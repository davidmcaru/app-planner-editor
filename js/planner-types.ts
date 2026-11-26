import type { HolidayInfo } from './planner-holidays.ts';

export type PlannerStyle = 'planner' | 'weekly' | 'monthly' | 'quarterly';
export type PlannerOrientation = 'vertical' | 'horizontal';
export type BoldMode = 'bold' | 'light' | null;

export type CellText = {
    text?: string;
    color?: string | null;
    bold?: boolean | null;
    vacation?: boolean;
    hideHoliday?: boolean;
    bgColor?: string | null;
    noBg?: boolean;
};
export type CellTexts = Record<string, CellText>;

export type WeekConfig = {
    days: number[];
    hours: string[];
    hourIncrement: number;
    showTitle: boolean;
    titleText: string;
    hourAlign: string;
    accentColor: string | null;
    cellTexts: CellTexts;
};

export type QuarterConfig = {
    showTitle: boolean;
    titleText: string;
    titleAlign: string;
    showWatermark: boolean;
    showDayAbbrev: boolean;
    showHolidays: boolean;
    showWeekNumbers: boolean;
};

export type MonthlyCalConfig = {
    showTitle: boolean;
    showMiniCalLeft: boolean;
    showMiniCalRight: boolean;
    showNotes: boolean;
    monthYearAlign: string;
    showWatermark: boolean;
    showOverflow: boolean;
    showDayAbbrev: boolean;
    showWeekNumbers: boolean;
    showHolidays: boolean;
    weekendShading: boolean;
};

export type HolidaysConfig = { ccaa: string | null; province: string | null };

export type PlannerPageConfig = {
    showMonthYear: boolean;
    monthYearAlign: string;
    showGoals: boolean;
    showHabits: boolean;
    showTodo: boolean;
    showPriority: boolean;
    showGrateful: boolean;
    showSelfCare: boolean;
    todoCount: number;
    habitCount: number;
    sectionTexts: CellTexts;
};
export type PlannerConfig = PlannerPageConfig & { orientation?: PlannerOrientation };

export type DesignConfig = {
    theme: string;
    bgColor: string | null;
    textColor: string | null;
    textStyle: string | null;
    accentPalette: string | null;
    weeklyAccent: string;
    weeklyAccentKey: string | null;
    plannerAccent: string;
    plannerAccentKey: string | null;
    titleSize: number;
    textSize: number;
    boldTitle: BoldMode;
    boldText: BoldMode;
};

export type TextConfig = {
    textColor: string | null;
    bgColor: string | null;
    textSize: number;
    // boolean solo puede venir de configs viejas persistidas; la migración lo convierte
    boldText: BoldMode | boolean;
    textStyle: string | null;
    overrideFormats: boolean;
    overrideAccent: boolean;
    overrideLibres: boolean;
    overrideFestivos: boolean;
};

// Campos de runtime que el render añade en su COPIA de config (nunca llegan al disco)
export type RenderExtras = {
    ccaa?: string | null;
    province?: string | null;
    accentColor?: string | null;
    forceAccent?: boolean;
    overrideFormats?: boolean;
    overrideLibres?: boolean;
    overrideFestivos?: boolean;
    _vacationDays?: Set<string>;
    _monthlyTexts?: CellTexts;
    _quarterlyTexts?: CellTexts;
    _accentColor?: string | null;
    _forceAccent?: boolean;
    _overrideFormats?: boolean;
    _overrideLibres?: boolean;
    _overrideFestivos?: boolean;
};

export type PlannerRenderConfig = Partial<PlannerPageConfig> &
    RenderExtras & {
        orientation?: PlannerOrientation;
        // extras del export en cuadernillo
        showMiniCal?: boolean;
        showHolidays?: boolean;
        weekendShading?: boolean;
    };
export type MonthlyRenderConfig = Partial<MonthlyCalConfig> & RenderExtras;
export type QuarterRenderConfig = Partial<QuarterConfig> & RenderExtras;
export type WeekRenderConfig = WeekConfig & RenderExtras;

export type MiniCalData = {
    name: string;
    dayHeaders: string[];
    days: Array<{ num: number | ''; weekday: number }>;
};

export type CalCell = {
    day: number | null;
    weekday: number;
    isSaturday: boolean;
    isSunday: boolean;
    weekRow: number;
    overflowDay?: number;
    overflowMonth?: number;
    overflowYear?: number;
};

export type MonthDayInfo = {
    day: number;
    dayAbbrev: string;
    isSaturday: boolean;
    isSunday: boolean;
    isHoliday: boolean;
    // Con los demás del mismo día en `others`: la trimestral pinta el primero y «+N»
    holiday: HolidayInfo | null;
    isoWeekNum: number | null;
};

export type VacationByYear = Record<string, string[]>;

// Claves de `cellLangs` en PLN1 y en «Mis planners»: renombrar una invalida los códigos ya compartidos.
export type CellLangStyle = 'weekly' | 'plannerA5' | 'plannerA4' | 'monthly';
export type CellLangs = Partial<Record<CellLangStyle, Record<string, string>>>;

export type PlannerPersistState = {
    v: number;
    style: PlannerStyle;
    orientation: PlannerOrientation;
    week: WeekConfig;
    quarter: QuarterConfig;
    holidays: HolidaysConfig;
    plannerA5: PlannerPageConfig;
    plannerA4: PlannerPageConfig;
    monthlyCal: MonthlyCalConfig;
    design: DesignConfig;
    text: TextConfig;
    cells: CellTexts;
    vacation: VacationByYear;
    textsLang: string | null;
    cellLangs?: CellLangs;
};

export type PlannerSavedEntry = {
    id: string;
    name: string;
    createdAt: number;
    bgSwatch: string;
    thumb: string | null;
    code: string;
    key: string;
};
