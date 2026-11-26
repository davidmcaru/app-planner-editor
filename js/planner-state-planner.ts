import { getBp } from '@core/breakpoint/get-bp.ts';
import { setItemDebounced } from '@core/storage/debounced-storage.ts';
import { A4_HABIT_MAX, A4_TODO_MAX, A5_HABIT_MAX, A5_TODO_MAX, keepText, sanPlannerPage } from './planner-sanitize.ts';
import type { CellText, CellTexts, PlannerConfig, PlannerOrientation, PlannerPageConfig } from './planner-types.ts';

const DEFAULT_PLANNER_A5_CONFIG: PlannerPageConfig = {
    showMonthYear: true,
    monthYearAlign: 'center-inline',
    showGoals: true,
    showHabits: true,
    showTodo: true,
    showPriority: true,
    showGrateful: true,
    showSelfCare: true,
    todoCount: 6,
    habitCount: 5,
    sectionTexts: {}, // keyed by section key ("goals", "todo-0", "habit-2", etc.), value: { text, color }
};

const DEFAULT_PLANNER_A4_CONFIG: PlannerPageConfig = {
    showMonthYear: true,
    monthYearAlign: 'left-inline',
    showGoals: true,
    showHabits: true,
    showTodo: true,
    showPriority: true,
    showGrateful: true,
    showSelfCare: true,
    todoCount: 8,
    habitCount: 5,
    sectionTexts: {},
};

let plannerA5Config: PlannerPageConfig = { ...DEFAULT_PLANNER_A5_CONFIG, sectionTexts: {} };
let plannerA4Config: PlannerPageConfig = { ...DEFAULT_PLANNER_A4_CONFIG, sectionTexts: {} };
let plannerOrientation: PlannerOrientation = 'vertical';
// Las dos orientaciones al abrir Textos: el enlace entre celdas se decide con ellas y no tecla a tecla (README js, 25).
let _textEditBase: { a5: CellTexts; a4: CellTexts } | null = null;

// Listas cerradas y topes de los steppers: monthYearAlign y los colores acaban en el HTML del folio.
const sanA5 = (raw: unknown) => sanPlannerPage(raw, DEFAULT_PLANNER_A5_CONFIG, A5_TODO_MAX, A5_HABIT_MAX, keepText);
const sanA4 = (raw: unknown) => sanPlannerPage(raw, DEFAULT_PLANNER_A4_CONFIG, A4_TODO_MAX, A4_HABIT_MAX, keepText);

// Copia hasta la celda: quien mute una celda en sitio cambiaría también el «antes» del diff de setPlannerConfig.
function _cloneTexts(texts: CellTexts | undefined): CellTexts {
    const out: CellTexts = {};
    for (const [key, cell] of Object.entries(texts || {})) out[key] = { ...cell };
    return out;
}

// Por lo que se pinta: con JSON.stringify un color '' frente a null separa dos copias iguales y dejan de seguirse.
function _sameCell(a: CellText | undefined, b: CellText | undefined) {
    return (a?.text || '') === (b?.text || '') && (a?.color || null) === (b?.color || null);
}

export function loadPlannerConfig() {
    // Load orientation — default based on breakpoint if not previously saved
    try {
        const savedOrient = localStorage.getItem('planner-orientation');
        if (savedOrient === 'horizontal' || savedOrient === 'vertical') {
            plannerOrientation = savedOrient;
        } else {
            // First load: default based on breakpoint (desktop → horizontal A4, mobile/tablet → vertical A5)
            const bp = getBp();
            plannerOrientation = bp === 'd' ? 'horizontal' : 'vertical';
        }
    } catch {
        /* ignore */
    }

    // Load A5 config
    try {
        const savedA5 = localStorage.getItem('planner-a5-config');
        if (savedA5) {
            const parsed = JSON.parse(savedA5) as Partial<PlannerPageConfig> & { showConclusiones?: boolean };
            // Migrate old showConclusiones → showGrateful + showSelfCare
            if ('showConclusiones' in parsed) {
                const val = parsed.showConclusiones;
                if (!('showGrateful' in parsed)) parsed.showGrateful = val;
                if (!('showSelfCare' in parsed)) parsed.showSelfCare = val;
                delete parsed.showConclusiones;
            }
            plannerA5Config = sanA5(parsed);
        }
    } catch {
        /* ignore */
    }

    // Load A4 config
    try {
        const savedA4 = localStorage.getItem('planner-a4-config');
        if (savedA4) plannerA4Config = sanA4(JSON.parse(savedA4));
    } catch {
        /* ignore */
    }

    // ── Migration from old unified planner-monthly-config ──
    if (!localStorage.getItem('planner-a5-config') && !localStorage.getItem('planner-a4-config')) {
        try {
            const oldSaved = localStorage.getItem('planner-monthly-config');
            if (oldSaved) {
                const old = JSON.parse(oldSaved) as Partial<PlannerPageConfig> & { orientation?: PlannerOrientation };
                // Migrate orientation
                if (old.orientation) {
                    plannerOrientation = old.orientation;
                    localStorage.setItem('planner-orientation', plannerOrientation);
                }
                // Shared fields for both configs
                const shared: Partial<PlannerPageConfig> = {};
                if ('showMonthYear' in old) shared.showMonthYear = old.showMonthYear;
                if ('monthYearAlign' in old) shared.monthYearAlign = old.monthYearAlign;
                if ('showGoals' in old) shared.showGoals = old.showGoals;
                if ('showHabits' in old) shared.showHabits = old.showHabits;
                if ('showTodo' in old) shared.showTodo = old.showTodo;
                if ('showPriority' in old) shared.showPriority = old.showPriority;
                if ('todoCount' in old) shared.todoCount = old.todoCount;
                if ('habitCount' in old) shared.habitCount = old.habitCount;
                if ('showGrateful' in old) shared.showGrateful = old.showGrateful;
                if ('showSelfCare' in old) shared.showSelfCare = old.showSelfCare;

                plannerA5Config = sanA5({ ...DEFAULT_PLANNER_A5_CONFIG, ...shared });
                plannerA4Config = sanA4({ ...DEFAULT_PLANNER_A4_CONFIG, ...shared });

                savePlannerConfig();
            }
        } catch {
            /* ignore */
        }
    }
}

export function savePlannerConfig() {
    localStorage.setItem('planner-orientation', plannerOrientation);
    // La misma red que los otros saves: nada con prefijo `_` llega al disco.
    const limpio = (cfg: PlannerPageConfig) => {
        const clean: Record<string, unknown> = {};
        Object.keys(cfg).forEach((k) => {
            if (!k.startsWith('_')) clean[k] = (cfg as unknown as Record<string, unknown>)[k];
        });
        return clean;
    };
    setItemDebounced('planner-a5-config', JSON.stringify(limpio(plannerA5Config)));
    setItemDebounced('planner-a4-config', JSON.stringify(limpio(plannerA4Config)));
}

// ── Planner Orientation ──

export function getPlannerOrientation() {
    return plannerOrientation;
}

export function setPlannerOrientation(orient: PlannerOrientation) {
    plannerOrientation = orient;
    localStorage.setItem('planner-orientation', orient);
}

// ── Planner A5 Config (vertical) ──

export function getPlannerA5Config(): PlannerPageConfig {
    return { ...plannerA5Config, sectionTexts: _cloneTexts(plannerA5Config.sectionTexts) };
}

export function setPlannerA5Config(config: PlannerPageConfig) {
    plannerA5Config = { ...config, sectionTexts: _cloneTexts(config.sectionTexts) };
    savePlannerConfig();
}

export function getDefaultPlannerA5Config() {
    return { ...DEFAULT_PLANNER_A5_CONFIG, sectionTexts: {} };
}

// ── Planner A4 Config (horizontal) ──

export function getPlannerA4Config(): PlannerPageConfig {
    return { ...plannerA4Config, sectionTexts: _cloneTexts(plannerA4Config.sectionTexts) };
}

export function setPlannerA4Config(config: PlannerPageConfig) {
    plannerA4Config = { ...config, sectionTexts: _cloneTexts(config.sectionTexts) };
    savePlannerConfig();
}

export function getDefaultPlannerA4Config() {
    return { ...DEFAULT_PLANNER_A4_CONFIG, sectionTexts: {} };
}

// ── Planner Legacy Compat (returns active config based on orientation) ──

export function getPlannerConfig(): PlannerConfig {
    const src = plannerOrientation === 'horizontal' ? plannerA4Config : plannerA5Config;
    const base: PlannerConfig = { ...src, sectionTexts: _cloneTexts(src.sectionTexts) };
    base.orientation = plannerOrientation;
    return base;
}

// Con Textos abierto se edita a tecla viva: lo que cuenta para enlazar es cómo estaban las dos al abrirlo.
export function beginPlannerTextEdit() {
    _textEditBase = { a5: _cloneTexts(plannerA5Config.sectionTexts), a4: _cloneTexts(plannerA4Config.sectionTexts) };
}

export function endPlannerTextEdit() {
    _textEditBase = null;
}

// Una celda pasa a la otra orientación solo si CAMBIÓ, allí tenía lo mismo que aquí antes del cambio y ya lo tenía
// al abrir Textos: lo distinto no se pisa ni se rellena, y el ✕ o Cancelar devuelven las dos a lo de la apertura.
export function setPlannerConfig(config: PlannerConfig) {
    if (config.orientation) {
        plannerOrientation = config.orientation;
    }
    const { orientation: _o, ...rest } = config;
    const isH = plannerOrientation === 'horizontal';
    const before = (isH ? plannerA4Config : plannerA5Config).sectionTexts || {};
    const next: PlannerPageConfig = { ...(isH ? plannerA4Config : plannerA5Config), ...rest };
    if (rest.sectionTexts !== undefined) {
        next.sectionTexts = _cloneTexts(rest.sectionTexts);
        const other = isH ? plannerA5Config : plannerA4Config;
        const otherTexts = _cloneTexts(other.sectionTexts);
        // Fuera de Textos (Config) no hay base: vale el estado de antes de esta misma llamada.
        const baseHere = _textEditBase ? (isH ? _textEditBase.a4 : _textEditBase.a5) : before;
        const baseThere = _textEditBase ? (isH ? _textEditBase.a5 : _textEditBase.a4) : otherTexts;
        for (const key of new Set([...Object.keys(before), ...Object.keys(next.sectionTexts)])) {
            const now = next.sectionTexts[key];
            if (_sameCell(now, before[key]) || !_sameCell(otherTexts[key], before[key])) continue;
            if (!_sameCell(baseThere[key], baseHere[key])) continue;
            if (now) otherTexts[key] = { ...now };
            else delete otherTexts[key];
        }
        const synced: PlannerPageConfig = { ...other, sectionTexts: otherTexts };
        if (isH) plannerA5Config = synced;
        else plannerA4Config = synced;
    }
    if (isH) plannerA4Config = next;
    else plannerA5Config = next;
    savePlannerConfig();
}

export function getDefaultPlannerConfig(): PlannerConfig {
    if (plannerOrientation === 'horizontal') {
        return { orientation: 'horizontal', ...DEFAULT_PLANNER_A4_CONFIG, sectionTexts: {} };
    }
    return { orientation: 'vertical', ...DEFAULT_PLANNER_A5_CONFIG, sectionTexts: {} };
}
