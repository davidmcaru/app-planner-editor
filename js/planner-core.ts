import { getMonthNames, tArr } from './planner-i18n.ts';
import type { HolidayInfo } from './planner-holidays.ts';
import type { CalCell, MiniCalData, MonthDayInfo } from './planner-types.ts';

/**
 * Devuelve el número de días de un mes (1-indexed month)
 */
export function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * Devuelve qué día de la semana empieza el mes (0=Lunes, 6=Domingo)
 * Ajustado para semana que comienza en lunes
 */
export function getFirstWeekday(year: number, month: number): number {
    const day = new Date(year, month, 1).getDay();
    // JS: 0=Dom, 1=Lun... → convertir a 0=Lun, 6=Dom
    return day === 0 ? 6 : day - 1;
}

/**
 * Calcula cuántas filas (semanas) necesita el calendario
 */
export function getWeekRows(year: number, month: number): number {
    const days = getDaysInMonth(year, month);
    const startDay = getFirstWeekday(year, month);
    return Math.ceil((days + startDay) / 7);
}

/**
 * Genera los datos del mini-calendario para un mes dado
 * Devuelve: { name, days: [{ num, weekday }] }
 */
export function getMiniCalendar(year: number, month: number): MiniCalData {
    const totalDays = getDaysInMonth(year, month);
    const firstDay = getFirstWeekday(year, month);
    const days: MiniCalData['days'] = [];

    // Celdas vacías antes del día 1
    for (let i = 0; i < firstDay; i++) {
        days.push({ num: '', weekday: i });
    }

    for (let d = 1; d <= totalDays; d++) {
        days.push({ num: d, weekday: (firstDay + d - 1) % 7 });
    }

    return {
        name: (getMonthNames()[month] || '').toUpperCase(),
        dayHeaders: tArr('dayHeadersShort'),
        days,
    };
}

/**
 * Genera la estructura de celdas para el calendario split en 2 páginas:
 * Página 2 (izquierda): Lunes, Martes, Miércoles
 * Página 3 (derecha): Jueves, Viernes, Sábado, Domingo
 *
 * Cada celda: { day: number|null, isSunday: boolean, weekRow: number }
 */
export function getCalendarCells(year: number, month: number) {
    const totalDays = getDaysInMonth(year, month);
    const firstDay = getFirstWeekday(year, month);
    const weeks = getWeekRows(year, month);

    const leftCells: CalCell[] = []; // Lun, Mar, Mié (weekday 0,1,2)
    const rightCells: CalCell[] = []; // Jue, Vie, Sáb, Dom (weekday 3,4,5,6)

    for (let week = 0; week < weeks; week++) {
        for (let wd = 0; wd < 7; wd++) {
            const pos = week * 7 + wd;
            const dayNum = pos - firstDay + 1;
            const isValid = dayNum >= 1 && dayNum <= totalDays;

            const cell: CalCell = {
                day: isValid ? dayNum : null,
                weekday: wd,
                isSaturday: wd === 5,
                isSunday: wd === 6,
                weekRow: week,
            };

            if (wd < 3) {
                leftCells.push(cell);
            } else {
                rightCells.push(cell);
            }
        }
    }

    return { leftCells, rightCells, weeks };
}

/**
 * Genera la estructura de celdas para el calendario combinado (7 columnas).
 * Cada celda: { day: number|null, weekday, isSaturday, isSunday, weekRow }
 * Celdas fuera del mes incluyen: overflowDay, overflowMonth, overflowYear
 */
export function getCalendarCellsFull(year: number, month: number) {
    const totalDays = getDaysInMonth(year, month);
    const firstDay = getFirstWeekday(year, month);
    const weeks = getWeekRows(year, month);
    const prev = getPrevMonth(year, month);
    const next = getNextMonth(year, month);
    const prevDays = getDaysInMonth(prev.year, prev.month);
    const cells: CalCell[] = [];

    for (let week = 0; week < weeks; week++) {
        for (let wd = 0; wd < 7; wd++) {
            const pos = week * 7 + wd;
            const dayNum = pos - firstDay + 1;
            const isValid = dayNum >= 1 && dayNum <= totalDays;

            const cell: CalCell = {
                day: isValid ? dayNum : null,
                weekday: wd,
                isSaturday: wd === 5,
                isSunday: wd === 6,
                weekRow: week,
            };

            if (!isValid) {
                if (dayNum < 1) {
                    cell.overflowDay = prevDays + dayNum;
                    cell.overflowMonth = prev.month;
                    cell.overflowYear = prev.year;
                } else {
                    cell.overflowDay = dayNum - totalDays;
                    cell.overflowMonth = next.month;
                    cell.overflowYear = next.year;
                }
            }

            cells.push(cell);
        }
    }

    return { cells, weeks };
}

/**
 * Devuelve mes anterior { year, month }
 */
export function getPrevMonth(year: number, month: number) {
    return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

/**
 * Devuelve mes siguiente { year, month }
 */
export function getNextMonth(year: number, month: number) {
    return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

export function getMonthName(month: number): string {
    return getMonthNames()[month] || '';
}

// ── Weekly helpers ──

/**
 * Returns how many calendar weeks overlap with a given month.
 * A "week" starts on Monday.
 */
export function getWeeksInMonth(year: number, month: number): number {
    const totalDays = getDaysInMonth(year, month);
    const firstDay = getFirstWeekday(year, month); // 0=Mon
    return Math.ceil((totalDays + firstDay) / 7);
}

// ── Quarterly helpers ──

/**
 * Returns the 3 month indexes (0-based) for a quarter (1-4).
 */
export function getQuarterMonths(quarter: number): [number, number, number] {
    const base = (quarter - 1) * 3;
    return [base, base + 1, base + 2];
}

/**
 * Returns ISO 8601 week number for a given date.
 */
export function getISOWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of the week
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Returns a list of all days in a month with metadata for quarterly view.
 */
export function getMonthDaysList(
    year: number,
    month: number,
    holidays: Map<string, HolidayInfo> | null = null
): MonthDayInfo[] {
    const totalDays = getDaysInMonth(year, month);
    const dayAbbrevs = tArr('dayAbbrevsShort');
    const result: MonthDayInfo[] = [];

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(year, month, d);
        const jsDay = date.getDay(); // 0=Sun
        const weekday = jsDay === 0 ? 6 : jsDay - 1; // 0=Mon, 6=Sun
        const isSaturday = weekday === 5;
        const isSunday = weekday === 6;
        const holidayKey = `${month}-${d}`;
        const holidayEntry = holidays ? holidays.get(holidayKey) || null : null;

        // ISO week number shown on Mondays only (weekday 0 = start of week)
        let isoWeekNum: number | null = null;
        if (weekday === 0) {
            isoWeekNum = getISOWeekNumber(date);
        }

        result.push({
            day: d,
            dayAbbrev: dayAbbrevs[weekday] || '',
            isSaturday,
            isSunday,
            isHoliday: !!holidayEntry,
            holiday: holidayEntry,
            isoWeekNum,
        });
    }

    return result;
}

/**
 * Default temperature-based color palette for each month (Spain climate).
 * Index 0=January, 11=December.
 * Used as fallback when CSS variables are not yet set.
 */
const DEFAULT_MONTH_COLORS = [
    '#4A90D9', // Enero — azul frío
    '#5DADE2', // Febrero — azul medio
    '#48C9B0', // Marzo — cyan/turquesa
    '#52BE80', // Abril — verde menta
    '#27AE60', // Mayo — verde
    '#D4AC0D', // Junio — dorado oscuro
    '#F39C12', // Julio — naranja
    '#E74C3C', // Agosto — rojo coral
    '#E67E22', // Septiembre — naranja cálido
    '#C0392B', // Octubre — rojo oscuro
    '#8E44AD', // Noviembre — morado
    '#5B2C6F', // Diciembre — violeta oscuro
];

/**
 * Get the active month color from the CSS variable set by the design theme.
 */
export function getMonthColor(month: number): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--planner-month-${month}`).trim();
    return v || DEFAULT_MONTH_COLORS[month] || '#4A90D9';
}

/**
 * Returns a lighter version of a color for weekend row backgrounds.
 */
export function getMonthColorLight(month: number): string {
    return getMonthColor(month) + '30'; // 30 = ~19% alpha hex
}

/**
 * Returns a medium-light version for weekend lines/backgrounds (more visible).
 */
export function getMonthColorMedium(month: number): string {
    return getMonthColor(month) + '45'; // 45 = ~27% alpha hex
}

/**
 * Returns a subtle holiday background (lighter than weekend, but noticeable).
 */
export function getMonthColorHoliday(month: number): string {
    return getMonthColor(month) + '28'; // 28 = ~16% alpha hex
}

/**
 * Returns an intermediate color for holiday text (~60% alpha — visible but not bold).
 */
export function getMonthColorHolidayText(month: number): string {
    return getMonthColor(month) + '99'; // 99 = ~60% alpha hex
}
