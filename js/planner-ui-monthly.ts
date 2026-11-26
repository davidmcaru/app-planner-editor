import {
    getCalendarCellsFull,
    getISOWeekNumber,
    getMiniCalendar,
    getPrevMonth,
    getNextMonth,
    getMonthName,
    getMonthColorMedium,
    getMonthColorHoliday,
    getMonthColorHolidayText,
} from './planner-core.ts';
import { getHolidays, holidayCellText, holidayTooltip } from './planner-holidays.ts';
import { t, tArr } from './planner-i18n.ts';
import { esc, safeColor, sanitizeCellHTML, stripFormattingHTML, renderMiniCal } from './planner-ui-shared.ts';
import { SHOW_QR_WATERMARK, QR_SRC } from './planner-qr.ts';
import type { MonthlyRenderConfig } from './planner-types.ts';
import { getVacationDays } from './planner-state-cell-texts.ts';

/**
 * Renderiza el calendario mensual combinado en una única página A4 horizontal.
 * Layout: header (mini-cals aligned with table edges) + day-name row + bordered grid (notes + 7 day cols).
 * Week numbers render as subtle absolute marks to the right of the grid (no dedicated column).
 * Border system: border-top + border-left on grid container, border-right + border-bottom on cells.
 */
export function renderMonthlyCombinedPage(
    container: HTMLElement,
    year: number,
    month: number,
    config: MonthlyRenderConfig & { showMiniCal?: boolean } = {}
) {
    const { cells, weeks } = getCalendarCellsFull(year, month);
    const prev = getPrevMonth(year, month);
    const next = getNextMonth(year, month);
    const miniPrev = getMiniCalendar(prev.year, prev.month);
    const miniNext = getMiniCalendar(next.year, next.month);
    const monthName = getMonthName(month).toUpperCase();
    const dayHeaders = tArr('daysFull');
    const colorMedium = getMonthColorMedium(month);
    const colorHoliday = getMonthColorHoliday(month);
    const colorHolidayText = getMonthColorHolidayText(month);

    const showTitle = config.showTitle !== false;
    const showMiniCalLeft = config.showMiniCalLeft === true || config.showMiniCal === true;
    const showMiniCalRight = config.showMiniCalRight === true;
    const showMiniCal = showMiniCalLeft || showMiniCalRight;
    const showNotes = config.showNotes !== false;
    const showWatermark = config.showWatermark !== false;
    const showDayAbbrev = config.showDayAbbrev !== false;
    const showWeekNumbers = config.showWeekNumbers !== false;
    const showHolidays = config.showHolidays !== false;
    const weekendShading = config.weekendShading !== false;
    const showOverflow = config.showOverflow !== false;
    const align = config.monthYearAlign || 'center';
    const vacationDays = config._vacationDays || new Set();
    const monthlyTexts = config._monthlyTexts || {};
    const cellAccent = safeColor(config._accentColor);
    const _forceAccent = config._forceAccent === true;
    const _overrideFormats = config._overrideFormats === true;
    const _overrideLibres = config._overrideLibres === true;
    const _overrideFestivos = config._overrideFestivos === true;

    // Build holiday map
    const holidayOpts = { national: true, ccaa: config.ccaa || null, province: config.province || null };
    const holidays = showHolidays ? getHolidays(year, holidayOpts) : null;

    // Overflow holidays (prev/next months — may span year boundary)
    const prevHolidays = showHolidays ? getHolidays(prev.year, holidayOpts) : null;
    const nextHolidays = showHolidays ? getHolidays(next.year, holidayOpts) : null;
    // Vacaciones de los meses de overflow (prev/next). El set de vacaciones es POR AÑO, así que las
    // celdas de enero (año siguiente) en la vista de diciembre necesitan el set del año contiguo.
    const prevVacations = getVacationDays(prev.year);
    const nextVacations = getVacationDays(next.year);

    const layoutMod = showNotes ? '' : ' pm-layout--no-notes';
    let html = `<div class="pm-layout${layoutMod}">`;

    // ── Year watermark ──
    if (showWatermark) {
        html += `<div class="pm-watermark" aria-hidden="true">${year}</div>`;
    }

    // ── Header (mini-cals + title) ──
    const showQrInHeader = !showNotes && SHOW_QR_WATERMARK;
    const showHeader = showTitle || showMiniCal || showQrInHeader;
    if (showHeader) {
        const headerCls = showMiniCal ? ' pm-header--has-mini' : '';
        html += `<div class="pm-header${headerCls}">`;

        if (showMiniCalLeft) {
            html += `<div class="pm-header__mini pm-header__mini--left">${renderMiniCal(miniPrev)}</div>`;
        }

        if (showTitle) {
            const titleClass = ` pm-header__title--${align}`;
            html += `<h2 class="pm-header__title${titleClass}">
                <span class="pm-header__month">${monthName}</span>
                <span class="pm-header__year">${year}</span>
            </h2>`;
        }

        if (showMiniCalRight) {
            html += `<div class="pm-header__mini pm-header__mini--right">${renderMiniCal(miniNext)}</div>`;
        }

        html += '</div>';
    }

    // ── QR overlay on grid when notes are hidden ──
    if (showQrInHeader) {
        html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--grid-overlay" alt="" aria-hidden="true">`;
    }

    // ── Day name headers (outside bordered grid) ──
    html += '<div class="pm-day-headers">';
    if (showNotes) {
        html += `<div class="pm-day-header pm-day-header--notes">${showDayAbbrev ? t('notes') : ''}</div>`;
    }
    for (let wd = 0; wd < 7; wd++) {
        const sundayClass = wd === 6 ? ' pm-day-header--sunday' : '';
        html += `<div class="pm-day-header${sundayClass}">${showDayAbbrev ? dayHeaders[wd] : ''}</div>`;
    }
    html += '</div>';

    // ── Bordered grid: (optional notes col +) 7 day cols ──
    html += `<div class="pm-grid" style="grid-template-rows: repeat(${weeks}, 1fr);">`;

    // ── Notes sidebar (only when showNotes) ──
    if (showNotes) {
        html += `<div class="pm-notes" style="grid-row: 1 / ${weeks + 1};">`;
        if (SHOW_QR_WATERMARK) {
            html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--monthly-combined" alt="" aria-hidden="true">`;
        }
        html += '</div>';
    }

    // ── Calendar cells (7 per row × weeks) ──
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i] as (typeof cells)[number];
        const isWeekend = cell.isSaturday || cell.isSunday;
        let cssClass = '';
        let bg = 'transparent';

        // ── Week number mark (computed once per row on Sunday) ──
        let wkMark = '';
        if (showWeekNumbers && cell.weekday === 6) {
            const mondayIdx = i - 6;
            let isoWeek: number | '' = '';
            for (let j = mondayIdx; j <= i; j++) {
                const cj = cells[j];
                if (j >= 0 && cj && cj.day !== null) {
                    const date = new Date(year, month, cj.day);
                    isoWeek = getISOWeekNumber(date);
                    break;
                }
            }
            if (isoWeek) wkMark = `<span class="pm-wk-mark">${isoWeek}</span>`;
        }

        if (cell.day !== null) {
            const holidayKey = `${month}-${cell.day}`;
            const holidayEntry = holidays ? holidays.get(holidayKey) : null;
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
            const isVacation = _overrideLibres ? false : showHolidays && vacationDays.has(dateKey);
            const isHolidayVisible = !!holidayEntry && showHolidays;
            const userEntry = monthlyTexts[dateKey];
            const hideHoliday = _overrideFestivos ? true : !!(userEntry && userEntry.hideHoliday);

            if (cell.isSunday) cssClass = ' pm-cell--sunday';
            else if (cell.isSaturday) cssClass = ' pm-cell--saturday';
            else if (isHolidayVisible) cssClass = ' pm-cell--holiday';
            if (isVacation) cssClass += ' pm-cell--vacation';

            if (isWeekend && weekendShading) bg = colorMedium;
            else if (isVacation || isHolidayVisible) bg = colorHoliday;

            // User bgColor overlay (from cell editor)
            if (userEntry && userEntry.bgColor) {
                bg = `color-mix(in srgb, ${safeColor(userEntry.bgColor)} 12%, ${bg === 'transparent' ? 'var(--planner-color-paper)' : bg})`;
            }

            html += `<div class="pm-cell${cssClass}" data-date="${dateKey}" style="background: ${bg};">`;
            html += `<span class="pm-cell__day">${cell.day}</span>`;

            // Holiday text (suppressed if hideHoliday)
            if (isHolidayVisible && holidayEntry && !hideHoliday && !isVacation) {
                html += `<span class="pm-cell__info" style="color: ${colorHolidayText}" title="${esc(holidayTooltip(holidayEntry))}">${esc(holidayCellText(holidayEntry))}</span>`;
            }

            // User text (below holiday)
            if (userEntry && userEntry.text) {
                const uc = _forceAccent ? cellAccent : safeColor(userEntry.color) || cellAccent;
                const ucStyle = uc ? ` style="color:${uc};"` : '';
                const uHtml = _overrideFormats ? stripFormattingHTML(userEntry.text) : sanitizeCellHTML(userEntry.text);
                html += `<span class="pm-cell__user-text"${ucStyle}>${uHtml}</span>`;
            }

            // Vacation (bottom)
            if (isVacation) {
                html += `<span class="pm-cell__vacation" style="color: ${colorHolidayText}">✦ ${t('toggleVacation')}</span>`;
            }

            html += wkMark;
            html += '</div>';
        } else if (showOverflow) {
            // ── Overflow cell (prev/next month day) ──
            // Los overflow* SIEMPRE existen en una celda day===null (los pone getCalendarCellsFull)
            const oDay = cell.overflowDay as number;
            const oMonth = cell.overflowMonth as number;
            const oYear = cell.overflowYear as number;
            const oDateKey = `${oYear}-${String(oMonth + 1).padStart(2, '0')}-${String(oDay).padStart(2, '0')}`;
            // Select the holiday AND vacation sets by the overflow cell's REAL (year, month), not a
            // month-only comparison — otherwise December's January-next cells map to the previous
            // year's holidays, y sus vacaciones (set por año) no se encontrarían.
            const isPrevOverflow = oYear === prev.year && oMonth === prev.month;
            const oHolidayMap = isPrevOverflow ? prevHolidays : nextHolidays;
            const oVacationSet = isPrevOverflow ? prevVacations : nextVacations;
            const isVacation = _overrideLibres ? false : showHolidays && oVacationSet.has(oDateKey);
            const oHolidayKey = `${oMonth}-${oDay}`;
            const oHolidayEntry = oHolidayMap ? oHolidayMap.get(oHolidayKey) : null;
            const isHolidayVisible = !!oHolidayEntry && showHolidays;
            const oUserEntry = monthlyTexts[oDateKey];
            const oHideHoliday = _overrideFestivos ? true : !!(oUserEntry && oUserEntry.hideHoliday);

            let oCss = ' pm-cell--empty';
            let oBg = '';

            if (isHolidayVisible) oCss += ' pm-cell--holiday';
            if (isVacation) {
                oBg = colorHoliday;
                oCss += ' pm-cell--vacation';
            } else if (isHolidayVisible) {
                oBg = colorHoliday;
            } else if (isWeekend && weekendShading) {
                oCss += ' pm-cell--overflow-weekend';
            } else {
                oCss += ' pm-cell--overflow-weekday';
            }

            const oBgAttr = oBg ? ` style="background: ${oBg};"` : '';
            html += `<div class="pm-cell${oCss}" data-date="${oDateKey}"${oBgAttr}>`;
            html += `<span class="pm-cell__day pm-cell__day--overflow">${oDay}</span>`;

            if (isHolidayVisible && oHolidayEntry && !oHideHoliday && !isVacation) {
                html += `<span class="pm-cell__info pm-cell__info--overflow" title="${esc(holidayTooltip(oHolidayEntry))}">${esc(holidayCellText(oHolidayEntry))}</span>`;
            }

            // User text (overflow) — atenuado como festivos/vacaciones (pm-cell__info--overflow, 0.15).
            // El texto se guarda en monthlyTexts por fecha completa (incl. otros años); solo faltaba
            // pintarlo aquí.
            if (oUserEntry && oUserEntry.text) {
                const ouc = _forceAccent ? cellAccent : safeColor(oUserEntry.color) || cellAccent;
                const oucStyle = ouc ? ` style="color:${ouc};"` : '';
                const ouHtml = _overrideFormats
                    ? stripFormattingHTML(oUserEntry.text)
                    : sanitizeCellHTML(oUserEntry.text);
                html += `<span class="pm-cell__user-text pm-cell__info--overflow"${oucStyle}>${ouHtml}</span>`;
            }

            if (isVacation) {
                html += `<span class="pm-cell__vacation pm-cell__info--overflow" style="color: ${colorHolidayText}">✦ ${t('toggleVacation')}</span>`;
            }

            html += wkMark;
            html += '</div>';
        } else {
            // ── Overflow hidden: empty cell, but keep weekend shading if active ──
            const owCss = isWeekend && weekendShading ? ' pm-cell--empty pm-cell--overflow-weekend' : ' pm-cell--empty';
            html += `<div class="pm-cell${owCss}">${wkMark}</div>`;
        }
    }

    html += '</div>'; // .pm-grid
    html += '</div>'; // .pm-layout

    container.innerHTML = html;
}

// ── Diffing de celda: repintar UNA celda del mes visible SIN re-render ──
// In place a propósito: el mini-editor abierto retiene el nodo en sus closures y el listener de
// click vive en el elemento — reemplazar el nodo los dejaría apuntando a un fantasma.
export function updateMonthlyCell(year: number, month: number, dateKey: string, config: MonthlyRenderConfig): boolean {
    const el = document.querySelector<HTMLElement>(`.pm-cell[data-date="${CSS.escape(dateKey)}"]`);
    if (!el) return false;
    const partes = dateKey.split('-').map(Number);
    const d = partes[2];
    // Celdas overflow (otro mes) siguen al render completo: su contexto es el del mes vecino.
    if (partes[0] !== year || (partes[1] || 0) - 1 !== month || !d) return false;

    const showHolidays = config.showHolidays !== false;
    const weekendShading = config.weekendShading !== false;
    const vacationDays = config._vacationDays || new Set();
    const monthlyTexts = config._monthlyTexts || {};
    const cellAccent = safeColor(config._accentColor);
    const forceAccent = config._forceAccent === true;
    const overrideFormats = config._overrideFormats === true;
    const overrideLibres = config._overrideLibres === true;
    const overrideFestivos = config._overrideFestivos === true;
    const colorMedium = getMonthColorMedium(month);
    const colorHoliday = getMonthColorHoliday(month);
    const colorHolidayText = getMonthColorHolidayText(month);
    const holidays = showHolidays
        ? getHolidays(year, { national: true, ccaa: config.ccaa || null, province: config.province || null })
        : null;

    const jsDay = new Date(year, month, d).getDay();
    const isSaturday = jsDay === 6;
    const isSunday = jsDay === 0;
    const isWeekend = isSaturday || isSunday;
    const holidayEntry = holidays ? holidays.get(`${month}-${d}`) : null;
    const isVacation = overrideLibres ? false : showHolidays && vacationDays.has(dateKey);
    const isHolidayVisible = !!holidayEntry && showHolidays;
    const userEntry = monthlyTexts[dateKey];
    const hideHoliday = overrideFestivos ? true : !!(userEntry && userEntry.hideHoliday);

    let cssClass = '';
    if (isSunday) cssClass = ' pm-cell--sunday';
    else if (isSaturday) cssClass = ' pm-cell--saturday';
    else if (isHolidayVisible) cssClass = ' pm-cell--holiday';
    if (isVacation) cssClass += ' pm-cell--vacation';

    let bg = 'transparent';
    if (isWeekend && weekendShading) bg = colorMedium;
    else if (isVacation || isHolidayVisible) bg = colorHoliday;
    if (userEntry && userEntry.bgColor) {
        bg = `color-mix(in srgb, ${safeColor(userEntry.bgColor)} 12%, ${bg === 'transparent' ? 'var(--planner-color-paper)' : bg})`;
    }

    let inner = `<span class="pm-cell__day">${d}</span>`;
    if (isHolidayVisible && holidayEntry && !hideHoliday && !isVacation) {
        inner += `<span class="pm-cell__info" style="color: ${colorHolidayText}" title="${esc(holidayTooltip(holidayEntry))}">${esc(holidayCellText(holidayEntry))}</span>`;
    }
    if (userEntry && userEntry.text) {
        const uc = forceAccent ? cellAccent : safeColor(userEntry.color) || cellAccent;
        const ucStyle = uc ? ` style="color:${uc};"` : '';
        const uHtml = overrideFormats ? stripFormattingHTML(userEntry.text) : sanitizeCellHTML(userEntry.text);
        inner += `<span class="pm-cell__user-text"${ucStyle}>${uHtml}</span>`;
    }
    if (isVacation) {
        inner += `<span class="pm-cell__vacation" style="color: ${colorHolidayText}">✦ ${t('toggleVacation')}</span>`;
    }
    // El nº de semana depende del contexto de FILA, que aquí no cambia: se conserva el que hubiera.
    inner += el.querySelector('.pm-wk-mark')?.outerHTML || '';

    const editable = el.classList.contains('is-cell-editable') ? ' is-cell-editable' : '';
    el.className = `pm-cell${cssClass}${editable}`;
    el.style.background = bg;
    el.innerHTML = inner;
    return true;
}
