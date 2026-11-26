import {
    getStyle,
    setStyle,
    getWeekConfig,
    setWeekConfig,
    getDefaultWeekConfig,
    getQuarterConfig,
    setQuarterConfig,
    getDefaultQuarterConfig,
    getHolidaysConfig,
    setHolidaysConfig,
    getDefaultHolidaysConfig,
    getPlannerOrientation,
    setPlannerOrientation,
    getPlannerA5Config,
    setPlannerA5Config,
    getDefaultPlannerA5Config,
    getPlannerA4Config,
    setPlannerA4Config,
    getDefaultPlannerA4Config,
    getMonthlyCalConfig,
    setMonthlyCalConfig,
    getDefaultMonthlyCalConfig,
    getDesignConfig,
    setDesignConfig,
    getDefaultDesignConfig,
    getTextConfig,
    setTextConfig,
    getDefaultTextConfig,
    getMonthlyTexts,
    setMonthlyTexts,
    getVacationDays,
    getVacationYears,
    saveVacationDays,
} from './planner-state.ts';
import { normalizeCellText } from './planner-sanitize.ts';
import type { CellLangs, CellTexts, PlannerPersistState, VacationByYear } from './planner-types.ts';

export const PLANNER_CONFIG_VERSION = 1;

function _normCells(map: CellTexts | undefined): CellTexts {
    const out: CellTexts = {};
    if (!map) return out;
    for (const k of Object.keys(map)) {
        const cell = map[k];
        if (!cell || typeof cell !== 'object') continue;
        const norm = normalizeCellText(cell);
        if (norm) out[k] = norm;
    }
    return out;
}

function _clean<T extends object>(cfg: T): T {
    const out: Record<string, unknown> = {};
    Object.keys(cfg).forEach((k) => {
        if (!k.startsWith('_')) out[k] = (cfg as Record<string, unknown>)[k];
    });
    return out as T;
}

// El default de orientación FIJO en 'vertical' (no el de arranque, que depende del breakpoint):
// los share-codes podan contra estos defaults y deben decodificar igual en cualquier dispositivo.
export function getPlannerDefaults(): PlannerPersistState {
    return {
        v: PLANNER_CONFIG_VERSION,
        style: 'planner',
        orientation: 'vertical',
        week: getDefaultWeekConfig(),
        quarter: getDefaultQuarterConfig(),
        holidays: getDefaultHolidaysConfig(),
        plannerA5: getDefaultPlannerA5Config(),
        plannerA4: getDefaultPlannerA4Config(),
        monthlyCal: getDefaultMonthlyCalConfig(),
        design: getDefaultDesignConfig(),
        text: getDefaultTextConfig(),
        cells: {},
        vacation: {},
        textsLang: null,
    };
}

export const PLANNER_DEFAULTS: Readonly<PlannerPersistState> = getPlannerDefaults();

export function getPersistablePlannerState(): PlannerPersistState {
    const vacation: VacationByYear = {};
    getVacationYears().forEach((y) => {
        const days = [...getVacationDays(y)].sort();
        if (days.length) vacation[String(y)] = days;
    });
    const cellLangs = _translationHooks ? _translationHooks.getCellLangs() : {};
    return {
        v: PLANNER_CONFIG_VERSION,
        style: getStyle(),
        orientation: getPlannerOrientation(),
        week: { ..._clean(getWeekConfig()), cellTexts: _normCells(getWeekConfig().cellTexts) },
        quarter: _clean(getQuarterConfig()),
        holidays: _clean(getHolidaysConfig()),
        plannerA5: { ..._clean(getPlannerA5Config()), sectionTexts: _normCells(getPlannerA5Config().sectionTexts) },
        plannerA4: { ..._clean(getPlannerA4Config()), sectionTexts: _normCells(getPlannerA4Config().sectionTexts) },
        monthlyCal: _clean(getMonthlyCalConfig()),
        design: _clean(getDesignConfig()),
        text: _clean(getTextConfig()),
        cells: _normCells(getMonthlyTexts()),
        vacation,
        textsLang: _translationHooks ? _translationHooks.getTextsLang() : null,
        // Solo con excepciones: sin ellas el JSON es el de antes y no cambian los hashes de «Mis planners».
        ...(Object.keys(cellLangs).length ? { cellLangs } : {}),
    };
}

export function applyPlannerState(s: PlannerPersistState) {
    setPlannerOrientation(s.orientation);
    setWeekConfig(s.week);
    setQuarterConfig(s.quarter);
    setHolidaysConfig(s.holidays);
    setPlannerA5Config(s.plannerA5);
    setPlannerA4Config(s.plannerA4);
    setMonthlyCalConfig(s.monthlyCal);
    setDesignConfig(s.design);
    setTextConfig(s.text);
    setMonthlyTexts(s.cells);
    // Reconciliar TODOS los años: un año con vacaciones ausente del payload debe quedar vacío,
    // o deshacer el primer día libre de un año nuevo parecería no hacer nada.
    const known = new Set(getVacationYears().map(String));
    Object.keys(s.vacation).forEach((y) => {
        saveVacationDays(Number(y), new Set(s.vacation[y]));
        known.delete(y);
    });
    // Solo se vacían años que TIENEN días: escribir "[]" en años solo-visitados acumula basura.
    known.forEach((y) => {
        if (getVacationDays(Number(y)).size) saveVacationDays(Number(y), new Set());
    });
    if (_translationHooks) _translationHooks.setTextsLang(s.textsLang ?? null, s.cellLangs ?? {});
    setStyle(s.style);
}

// El idioma REAL de los textos vive en la caché de traducción: viaja en el payload (deshacer una
// traducción debe devolver también su idioma) y entra por seam — importar translation aquí ciclaría.
type TranslationHooks = {
    getTextsLang: () => string | null;
    getCellLangs: () => CellLangs;
    setTextsLang: (v: string | null, cellLangs: CellLangs) => void;
    stampTextsLang: () => void;
    getApplyGen: () => number;
    restoreApplyGen: (gen: number) => void;
};
let _translationHooks: TranslationHooks | null = null;

export function registerTranslationHooks(hooks: TranslationHooks): void {
    _translationHooks = hooks;
}

export function getApplyGen(): number {
    return _translationHooks ? _translationHooks.getApplyGen() : 0;
}

export function restoreApplyGen(gen: number): void {
    _translationHooks?.restoreApplyGen(gen);
}

// Seam del historial: los sitios de commit importan ESTE módulo y planner-history
// se registra al cargarse — importar el motor aquí crearía el ciclo persist→history→apply→paneles→persist.
type PlannerHistoryHooks = {
    record: () => void;
    absorb: () => void;
};
let _historyHooks: PlannerHistoryHooks | null = null;

export function registerHistoryHooks(hooks: PlannerHistoryHooks): void {
    _historyHooks = hooks;
}

export function commitHistory(): void {
    // En el mismo paso que escribe los textos: fuera de él, deshacer por detrás devolvería textsLang a null
    if (_translationHooks) _translationHooks.stampTextsLang();
    if (_historyHooks) _historyHooks.record();
}

export function absorbHistory(): void {
    if (_historyHooks) _historyHooks.absorb();
}
