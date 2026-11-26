import { flushPendingWrites } from '@core/storage/debounced-storage.ts';
import { loadWeekConfig } from './planner-state-week.ts';
import { loadQuarterConfig } from './planner-state-quarter.ts';
import { loadHolidaysConfig } from './planner-state-holidays.ts';
import { loadPlannerConfig } from './planner-state-planner.ts';
import { loadMonthlyCalConfig } from './planner-state-monthly-cal.ts';
import { loadDesignConfig } from './planner-state-design.ts';
import { loadTextConfig } from './planner-state-text.ts';
import { loadMonthlyTexts, loadQuarterlyTexts, migrateVacationToYearly } from './planner-state-cell-texts.ts';
import type { PlannerStyle } from './planner-types.ts';

// ── NAVIGATION STATE  (year / month / style / week / quarter) ──

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed
let currentStyle: PlannerStyle = 'planner';
let currentWeek = 1; // 1-based week within month
let currentQuarter = Math.floor(currentMonth / 3) + 1; // 1-4, derived from month

const subscribers: Array<(year: number, month: number) => void> = [];
const styleSubscribers: Array<(style: PlannerStyle) => void> = [];

export function initState() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    currentQuarter = Math.floor(currentMonth / 3) + 1;

    // Restore last selected style if valid
    const savedStyle = localStorage.getItem('planner-style');
    if (savedStyle && ['planner', 'weekly', 'monthly', 'quarterly'].includes(savedStyle)) {
        currentStyle = savedStyle as PlannerStyle;
    }

    loadWeekConfig();
    loadQuarterConfig();
    loadHolidaysConfig();
    loadPlannerConfig();
    loadMonthlyCalConfig();
    loadDesignConfig();
    loadTextConfig();
    loadMonthlyTexts();
    loadQuarterlyTexts();
    migrateVacationToYearly(currentYear);
}

export function getYear() {
    return currentYear;
}

export function getMonth() {
    return currentMonth;
}

export function goToPrevMonth() {
    if (currentMonth === 0) {
        currentMonth = 11;
        currentYear--;
    } else {
        currentMonth--;
    }
    notifySubscribers();
}

export function goToNextMonth() {
    if (currentMonth === 11) {
        currentMonth = 0;
        currentYear++;
    } else {
        currentMonth++;
    }
    notifySubscribers();
}

export function setMonthYear(month: number, year: number) {
    currentMonth = month;
    currentYear = year;
    // El trimestre deriva del mes: sin esto «Restablecer» en la trimestral dejaba el trimestre de antes.
    currentQuarter = Math.floor(month / 3) + 1;
    notifySubscribers();
}

export function onMonthChange(callback: (year: number, month: number) => void) {
    subscribers.push(callback);
}

function notifySubscribers() {
    for (const cb of subscribers) {
        cb(currentYear, currentMonth);
    }
}

// ── Style ──

export function getStyle() {
    return currentStyle;
}

export function setStyle(style: PlannerStyle) {
    if (style === currentStyle) return;
    currentStyle = style;
    localStorage.setItem('planner-style', style);
    if (style === 'quarterly') {
        currentQuarter = Math.floor(currentMonth / 3) + 1;
    }
    notifyStyleSubscribers();
}

export function onStyleChange(callback: (style: PlannerStyle) => void) {
    styleSubscribers.push(callback);
}

function notifyStyleSubscribers() {
    for (const cb of styleSubscribers) {
        cb(currentStyle);
    }
}

// ── Week ──

export function getWeek() {
    return currentWeek;
}

export function setWeek(w: number) {
    currentWeek = w;
}

// ── Quarter ──

export function getQuarter() {
    return currentQuarter;
}

export function goToPrevQuarter() {
    if (currentQuarter > 1) {
        currentQuarter--;
    } else {
        currentQuarter = 4;
        currentYear--;
    }
    currentMonth = (currentQuarter - 1) * 3;
    notifySubscribers();
}

export function goToNextQuarter() {
    if (currentQuarter < 4) {
        currentQuarter++;
    } else {
        currentQuarter = 1;
        currentYear++;
    }
    currentMonth = (currentQuarter - 1) * 3;
    notifySubscribers();
}

// ── PUBLIC API RE-EXPORTS  (preserved from pre-split planner-state.ts) ──

export { flushPendingWrites };
export { getWeekConfig, setWeekConfig, getDefaultWeekConfig, dropWeekSlot } from './planner-state-week.ts';
export { getQuarterConfig, setQuarterConfig, getDefaultQuarterConfig } from './planner-state-quarter.ts';
export { getHolidaysConfig, setHolidaysConfig, getDefaultHolidaysConfig } from './planner-state-holidays.ts';
export {
    getPlannerOrientation,
    setPlannerOrientation,
    getPlannerA5Config,
    setPlannerA5Config,
    getDefaultPlannerA5Config,
    getPlannerA4Config,
    setPlannerA4Config,
    getDefaultPlannerA4Config,
    getPlannerConfig,
    setPlannerConfig,
    getDefaultPlannerConfig,
    beginPlannerTextEdit,
    endPlannerTextEdit,
} from './planner-state-planner.ts';
export { getMonthlyCalConfig, setMonthlyCalConfig, getDefaultMonthlyCalConfig } from './planner-state-monthly-cal.ts';
export { getDesignConfig, setDesignConfig, getDefaultDesignConfig } from './planner-state-design.ts';
export { getTextConfig, setTextConfig, getDefaultTextConfig } from './planner-state-text.ts';
export {
    getVacationDays,
    getVacationYears,
    saveVacationDays,
    getMonthlyTexts,
    setMonthlyTexts,
    getQuarterlyTexts,
    setQuarterlyTexts,
} from './planner-state-cell-texts.ts';
