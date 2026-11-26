import { setItemDebounced } from '@core/storage/debounced-storage.ts';
import { DATE_KEY, keepText, sanCellMap } from './planner-sanitize.ts';
import type { CellTexts } from './planner-types.ts';

// ── VACATION DAYS (unified yearly storage) ──

/**
 * Merge legacy per-quarter vacation keys into a single yearly key.
 * Called once from initState(). Safe to call multiple times.
 */
export function migrateVacationToYearly(year: number) {
    const yearKey = `planner-vacation-${year}`;
    // Only migrate if yearly key doesn't exist yet
    if (localStorage.getItem(yearKey)) return;

    const merged = new Set<string>();
    let found = false;
    for (let q = 1; q <= 4; q++) {
        const legacyKey = `planner-vacation-${year}-Q${q}`;
        try {
            const saved = localStorage.getItem(legacyKey);
            if (saved) {
                const arr = JSON.parse(saved) as unknown;
                if (Array.isArray(arr)) {
                    arr.forEach((d) => merged.add(String(d)));
                    found = true;
                }
            }
        } catch {
            /* ignore */
        }
    }

    if (found && merged.size > 0) {
        localStorage.setItem(yearKey, JSON.stringify([...merged]));
    }
    // Note: legacy keys are left intact (non-destructive migration)
}

// In-memory cache so reactive renders see updates immediately, before the
// debounced localStorage write fires. Without this, toggling the vacation
// state inside the mini-editor produced a stale read in the next render
// and the cell wouldn't repaint until the editor closed.
const _vacationDaysCache = new Map<number, Set<string>>();

/**
 * Returns the Set of vacation day keys (YYYY-MM-DD) for a given year.
 */
export function getVacationDays(year: number): Set<string> {
    const cached = _vacationDaysCache.get(year);
    if (cached) return cached;
    const key = `planner-vacation-${year}`;
    let set = new Set<string>();
    try {
        const saved = localStorage.getItem(key);
        if (saved) set = new Set(JSON.parse(saved) as string[]);
    } catch {
        /* ignore */
    }
    _vacationDaysCache.set(year, set);
    return set;
}

/**
 * Persists the vacation day Set for a given year.
 */
export function saveVacationDays(year: number, daysSet: Set<string> | string[]) {
    const key = `planner-vacation-${year}`;
    // Update in-memory cache synchronously so subsequent getVacationDays()
    // calls (e.g. from a render() triggered right after this) see the new
    // value before the debounced localStorage write fires.
    _vacationDaysCache.set(year, daysSet instanceof Set ? daysSet : new Set(daysSet));
    setItemDebounced(key, JSON.stringify([...daysSet]));
}

// El caché cubre los años con escritura debounced aún pendiente (no estarían en localStorage).
export function getVacationYears(): number[] {
    const years = new Set<number>();
    for (let i = 0; i < localStorage.length; i++) {
        const m = /^planner-vacation-(\d{4})$/.exec(localStorage.key(i) || '');
        if (m) years.add(Number(m[1]));
    }
    _vacationDaysCache.forEach((_days, year) => years.add(year));
    return [...years].sort();
}

// ⚠️ Almacén UNIFICADO mensual+trimestral: las funciones Monthly/Quarterly son ALIAS del mismo
// store por fecha — separarlos re-rompe el bug de «texto de mensual invisible en trimestral».

const CELL_TEXTS_KEY = 'planner-cell-texts';
let cellTexts: CellTexts = {};

// Migración no destructiva: fusiona los stores antiguos (quarterly primero, monthly encima → el
// mensual gana en conflictos de misma fecha) en el unificado. Deja las claves antiguas intactas.
function migrateCellTexts() {
    if (localStorage.getItem(CELL_TEXTS_KEY) !== null) return; // ya migrado
    let merged: CellTexts = {};
    let found = false;
    for (const legacyKey of ['planner-quarterly-texts', 'planner-monthly-texts']) {
        try {
            const parsed = JSON.parse(localStorage.getItem(legacyKey) || 'null') as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                merged = { ...merged, ...(parsed as CellTexts) };
                found = true;
            }
        } catch {
            /* ignore */
        }
    }
    if (found) localStorage.setItem(CELL_TEXTS_KEY, JSON.stringify(merged));
}

function loadCellTexts() {
    migrateCellTexts();
    try {
        const saved = localStorage.getItem(CELL_TEXTS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved) as unknown;
            // Guard shape: 'null' o array petaría Object.entries()/mt[dateKey] más adelante.
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                // Sin el tope de 5000 del códec: son fechas del propio usuario y el recorte tiraría las últimas.
                cellTexts = sanCellMap(parsed, DATE_KEY, Infinity, keepText);
            }
        }
    } catch {
        /* ignore */
    }
}

function saveCellTexts() {
    setItemDebounced(CELL_TEXTS_KEY, JSON.stringify(cellTexts));
}

// API pública. Monthly y Quarterly son ahora el MISMO almacén (alias) para no tocar los callers.
export function loadMonthlyTexts() {
    loadCellTexts();
}
export function loadQuarterlyTexts() {
    loadCellTexts();
}
export function getMonthlyTexts() {
    return cellTexts;
}
export function getQuarterlyTexts() {
    return cellTexts;
}
export function setMonthlyTexts(texts: CellTexts) {
    cellTexts = texts;
    saveCellTexts();
}
export function setQuarterlyTexts(texts: CellTexts) {
    cellTexts = texts;
    saveCellTexts();
}
