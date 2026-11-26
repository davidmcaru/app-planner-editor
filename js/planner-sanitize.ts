import { oneOf } from '@features/utils/share-codec.ts';
import { getCCAAList, getProvinceList } from './planner-holidays.ts';
import { TEXT_STYLES, THEMES } from './planner-themes.ts';
import type {
    CellText,
    CellTexts,
    DesignConfig,
    HolidaysConfig,
    MonthlyCalConfig,
    PlannerPageConfig,
    QuarterConfig,
    TextConfig,
    WeekConfig,
} from './planner-types.ts';

// Datos sin forma garantizada (un código decodificado o localStorage): any acotado a este saneador.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

// El códec sanea el HTML del texto (viene de fuera); localStorage lo deja tal cual y lo sanea el render.
export type TextFilter = (text: string) => string;
export const keepText: TextFilter = (text) => text;
const asLoose = (v: unknown): Loose => (v && typeof v === 'object' ? (v as Loose) : {});

export const clampNum = (v: unknown, min: number, max: number, def: number): number => {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
export const hexOrNull = (v: unknown): string | null => (isHex(v) ? v : null);
export const boolOr = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
// Sin des-etiquetar: el render SIEMPRE escapa los títulos, y el strip destruía «<100km>».
export const plainText = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
export const ALIGN_6 = ['left-inline', 'left', 'center-inline', 'center', 'right-inline', 'right'] as const;
export const TITLE_MAX = 120;
// Los topes de los steppers de Config y Textos: los saneadores y los cargadores recortan a lo mismo que deja la UI.
export const TODO_MIN = 4;
export const HABIT_MIN = 3;
export const A5_TODO_MAX = 8;
export const A5_HABIT_MAX = 6;
export const A4_TODO_MAX = 10;
export const A4_HABIT_MAX = 10;
export const HOUR_INCREMENT_MIN = 5;
export const HOUR_INCREMENT_MAX = 1440;
export const SIZE_MIN = -8;
export const SIZE_MAX = 32;

export const WEEK_CELL_KEY = /^\d{1,2}-\d{1,2}$/;
export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const SECTION_KEY = /^(goals|priority|grateful|selfCare|todo-\d{1,2}|habit-\d{1,2})$/;
// Listas cerradas: un tema como «constructor» casaba con Object.prototype en THEMES[clave] y rompía el arranque.
const THEME_KEYS = Object.keys(THEMES);
const FONT_KEYS = Object.keys(TEXT_STYLES);
const BOLD = [null, 'bold', 'light'] as const;
const keyOrNull = (v: unknown, keys: readonly string[]): string | null =>
    typeof v === 'string' && keys.includes(v) ? v : null;
const toDay = (d: unknown): unknown => (typeof d === 'string' && /^[0-6]$/.test(d) ? Number(d) : d);
const isDay = (d: unknown): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6;

// Forma CANÓNICA, orden incluido: sin ella el dedupe del historial y el hash de guardados ven distinto el mismo estado.
export function normalizeCellText(c: CellText): CellText | null {
    const out: CellText = {};
    if (typeof c.text === 'string' && c.text) out.text = c.text;
    if (typeof c.color === 'string' && c.color) out.color = c.color;
    if (c.bold === true) out.bold = true;
    if (typeof c.bgColor === 'string' && c.bgColor) out.bgColor = c.bgColor;
    if (c.noBg) out.noBg = true;
    if (c.vacation) out.vacation = true;
    if (c.hideHoliday) out.hideHoliday = true;
    return Object.keys(out).length ? out : null;
}

export function sanCell(c: Loose, cleanText: TextFilter): CellText | null {
    if (!c || typeof c !== 'object') return null;
    const cand: CellText = {};
    if (typeof c.text === 'string' && c.text) cand.text = cleanText(c.text);
    if (isHex(c.color)) cand.color = c.color;
    if (c.bold === true) cand.bold = true;
    if (isHex(c.bgColor)) cand.bgColor = c.bgColor;
    if (c.noBg) cand.noBg = true;
    if (c.vacation) cand.vacation = true;
    if (c.hideHoliday) cand.hideHoliday = true;
    return normalizeCellText(cand);
}

export function sanCellMap(raw: Loose, keyRe: RegExp, cap: number, cleanText: TextFilter): CellTexts {
    const out: CellTexts = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const k of Object.keys(raw).slice(0, cap)) {
        if (!keyRe.test(k)) continue;
        const cell = sanCell(raw[k], cleanText);
        if (cell) out[k] = cell;
    }
    return out;
}

// Las franjas son texto libre en la UI y su POSICIÓN es la clave de sus textos: ninguna se descarta ni se mueve.
export function sanWeek(raw: unknown, def: WeekConfig, cleanText: TextFilter): WeekConfig {
    const w = asLoose(raw);
    const days = Array.isArray(w.days) ? [...new Set(w.days.map(toDay).filter(isDay))] : [];
    const hours = Array.isArray(w.hours)
        ? w.hours.slice(0, 16).map((h: unknown) => (typeof h === 'string' ? h.slice(0, 16) : ''))
        : [];
    return {
        days: days.length ? days : [...def.days],
        hours: hours.length ? hours : [...def.hours],
        hourIncrement: clampNum(w.hourIncrement, HOUR_INCREMENT_MIN, HOUR_INCREMENT_MAX, def.hourIncrement),
        showTitle: boolOr(w.showTitle, def.showTitle),
        titleText: plainText(w.titleText, TITLE_MAX),
        hourAlign: oneOf(w.hourAlign, ['top', 'middle', 'bottom'] as const, def.hourAlign),
        accentColor: hexOrNull(w.accentColor),
        cellTexts: sanCellMap(w.cellTexts, WEEK_CELL_KEY, 200, cleanText),
    };
}

export function sanQuarter(raw: unknown, def: QuarterConfig): QuarterConfig {
    const q = asLoose(raw);
    return {
        showTitle: boolOr(q.showTitle, def.showTitle),
        titleText: plainText(q.titleText, TITLE_MAX),
        titleAlign: oneOf(q.titleAlign, ALIGN_6, def.titleAlign),
        showWatermark: boolOr(q.showWatermark, def.showWatermark),
        showDayAbbrev: boolOr(q.showDayAbbrev, def.showDayAbbrev),
        showHolidays: boolOr(q.showHolidays, def.showHolidays),
        showWeekNumbers: boolOr(q.showWeekNumbers, def.showWeekNumbers),
    };
}

export function sanPlannerPage(
    raw: unknown,
    def: PlannerPageConfig,
    maxTodo: number,
    maxHabit: number,
    cleanText: TextFilter
): PlannerPageConfig {
    const p = asLoose(raw);
    return {
        showMonthYear: boolOr(p.showMonthYear, def.showMonthYear),
        monthYearAlign: oneOf(p.monthYearAlign, ALIGN_6, def.monthYearAlign),
        showGoals: boolOr(p.showGoals, def.showGoals),
        showHabits: boolOr(p.showHabits, def.showHabits),
        showTodo: boolOr(p.showTodo, def.showTodo),
        showPriority: boolOr(p.showPriority, def.showPriority),
        showGrateful: boolOr(p.showGrateful, def.showGrateful),
        showSelfCare: boolOr(p.showSelfCare, def.showSelfCare),
        todoCount: clampNum(p.todoCount, TODO_MIN, maxTodo, def.todoCount),
        habitCount: clampNum(p.habitCount, HABIT_MIN, maxHabit, def.habitCount),
        sectionTexts: sanCellMap(p.sectionTexts, SECTION_KEY, 60, cleanText),
    };
}

export function sanMonthlyCal(raw: unknown, def: MonthlyCalConfig): MonthlyCalConfig {
    const m = asLoose(raw);
    return {
        showTitle: boolOr(m.showTitle, def.showTitle),
        showMiniCalLeft: boolOr(m.showMiniCalLeft, def.showMiniCalLeft),
        showMiniCalRight: boolOr(m.showMiniCalRight, def.showMiniCalRight),
        showNotes: boolOr(m.showNotes, def.showNotes),
        monthYearAlign: oneOf(m.monthYearAlign, ALIGN_6, def.monthYearAlign),
        showWatermark: boolOr(m.showWatermark, def.showWatermark),
        showOverflow: boolOr(m.showOverflow, def.showOverflow),
        showDayAbbrev: boolOr(m.showDayAbbrev, def.showDayAbbrev),
        showWeekNumbers: boolOr(m.showWeekNumbers, def.showWeekNumbers),
        showHolidays: boolOr(m.showHolidays, def.showHolidays),
        weekendShading: boolOr(m.weekendShading, def.weekendShading),
    };
}

export function sanHolidays(raw: unknown, def: HolidaysConfig): HolidaysConfig {
    const h = asLoose(raw);
    // '__ALL__' y null son estados LEGÍTIMOS del panel: ccaa null es «— Ninguna —» (solo nacionales).
    const ccaaOk = h.ccaa === null || h.ccaa === '__ALL__' || getCCAAList().some((c) => c.code === h.ccaa);
    const ccaa = ccaaOk ? (h.ccaa as string | null) : def.ccaa;
    const inCcaa = (p: unknown): p is string => getProvinceList(ccaa).some((x) => x.code === p);
    let province: string | null = null;
    if (h.province === '__ALL__') province = '__ALL__';
    else if (inCcaa(h.province)) province = h.province;
    else if (h.province != null && inCcaa(def.province)) province = def.province;
    return { ccaa, province };
}

export function sanDesign(raw: unknown, def: DesignConfig): DesignConfig {
    const d = asLoose(raw);
    return {
        theme: keyOrNull(d.theme, THEME_KEYS) || def.theme,
        bgColor: hexOrNull(d.bgColor),
        textColor: hexOrNull(d.textColor),
        textStyle: keyOrNull(d.textStyle, FONT_KEYS),
        accentPalette: keyOrNull(d.accentPalette, THEME_KEYS),
        weeklyAccent: hexOrNull(d.weeklyAccent) || def.weeklyAccent,
        weeklyAccentKey: keyOrNull(d.weeklyAccentKey, THEME_KEYS),
        plannerAccent: hexOrNull(d.plannerAccent) || def.plannerAccent,
        plannerAccentKey: keyOrNull(d.plannerAccentKey, THEME_KEYS),
        titleSize: clampNum(d.titleSize, SIZE_MIN, SIZE_MAX, def.titleSize),
        textSize: clampNum(d.textSize, SIZE_MIN, SIZE_MAX, def.textSize),
        boldTitle: oneOf(d.boldTitle, BOLD, null),
        boldText: oneOf(d.boldText, BOLD, null),
    };
}

export function sanText(raw: unknown, def: TextConfig): TextConfig {
    const x = asLoose(raw);
    return {
        textColor: hexOrNull(x.textColor),
        bgColor: hexOrNull(x.bgColor),
        textSize: clampNum(x.textSize, SIZE_MIN, SIZE_MAX, def.textSize),
        boldText: oneOf(x.boldText, BOLD, null),
        textStyle: keyOrNull(x.textStyle, FONT_KEYS),
        overrideFormats: boolOr(x.overrideFormats, false),
        overrideAccent: boolOr(x.overrideAccent, false),
        overrideLibres: boolOr(x.overrideLibres, false),
        overrideFestivos: boolOr(x.overrideFestivos, false),
    };
}
