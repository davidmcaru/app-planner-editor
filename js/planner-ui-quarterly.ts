import {
    getQuarterMonths,
    getMonthName,
    getMonthDaysList,
    getMonthColor,
    getMonthColorLight,
    getMonthColorMedium,
    getMonthColorHoliday,
    getMonthColorHolidayText,
} from './planner-core.ts';
import { getHolidays, holidayCellText, holidayTooltip } from './planner-holidays.ts';
import { t } from './planner-i18n.ts';
import { esc, safeColor, sanitizeCellHTML, stripFormattingHTML } from './planner-ui-shared.ts';
import { SHOW_QR_WATERMARK, QR_SRC } from './planner-qr.ts';
import type { QuarterRenderConfig } from './planner-types.ts';

/**
 * Renders a single-page quarterly view (A4 landscape).
 * Layout: header + 3 month columns with day lists + objectives row.
 */
export function renderQuarterlyPage(
    container: HTMLElement,
    year: number,
    quarter: number,
    config: QuarterRenderConfig = {}
) {
    const months = getQuarterMonths(quarter);
    const showTitle = config.showTitle !== false;
    const titleAlign = config.titleAlign || 'center-inline';
    const isInline = titleAlign.endsWith('-inline');
    const textAlign = titleAlign.replace('-inline', '');
    const showWatermark = config.showWatermark !== false;
    const showDayAbbrev = config.showDayAbbrev !== false;
    const showHolidays = config.showHolidays !== false;
    const showWeekNumbers = config.showWeekNumbers !== false;
    const vacationDays = config._vacationDays || new Set();
    const quarterlyTexts = config._quarterlyTexts || {};
    const cellAccent = safeColor(config._accentColor);
    const _forceAccent = config._forceAccent === true;
    const _overrideFormats = config._overrideFormats === true;
    const _overrideLibres = config._overrideLibres === true;
    const _overrideFestivos = config._overrideFestivos === true;
    const holidays = showHolidays
        ? getHolidays(year, { national: true, ccaa: config.ccaa || null, province: config.province || null })
        : null;

    let html = '<div class="pq-layout" style="position: relative;">';

    // Year watermark (background, behind everything)
    if (showWatermark) {
        html += `<div class="pq-watermark" aria-hidden="true">${year}</div>`;
    }

    // Trimestral QR: se inyecta al final de la última columna (ver más abajo en el loop)

    // Header (conditional)
    if (showTitle) {
        if (isInline) {
            // Inline variant: year big + "Trimestre 2" subtitle
            const quarterFull = t('quarterFull').replace('{0}', String(quarter));
            html += `<div class="pq-header pq-header--inline" style="text-align: ${textAlign}">
                <h2 class="pq-header__title">${year}</h2>
                <p class="pq-header__subtitle">${quarterFull}</p>
            </div>`;
        } else {
            // Normal variant: "2026 T2"
            const defaultLabel = t('quarterOf').replace('{0}', String(quarter)).replace('{1}', String(year));
            const titleText = config.titleText || defaultLabel;
            html += `<div class="pq-header" style="text-align: ${textAlign}">
                <h2 class="pq-header__title">${esc(titleText)}</h2>
            </div>`;
        }
    }

    // 3 month columns
    html += '<div class="pq-months">';
    for (let mi = 0; mi < months.length; mi++) {
        const monthIdx = months[mi] as number;
        const isLastMonth = mi === months.length - 1;
        const monthName = getMonthName(monthIdx).toUpperCase();
        const color = getMonthColor(monthIdx);
        const colorLight = getMonthColorLight(monthIdx);
        const colorMedium = getMonthColorMedium(monthIdx);
        const colorHoliday = getMonthColorHoliday(monthIdx);
        const colorHolidayText = getMonthColorHolidayText(monthIdx);
        const days = getMonthDaysList(year, monthIdx, holidays);

        const hasQr = isLastMonth && SHOW_QR_WATERMARK;
        html += `<div class="pq-month${hasQr ? ' pq-month--has-qr' : ''}"${hasQr ? ' style="position: relative;"' : ''}>`;

        // Month header with color accent
        html += `<div class="pq-month__header" style="border-bottom: 2px solid ${color}">
            <span class="pq-month__name" style="color: ${color}">${monthName}</span>
        </div>`;

        // Day rows
        html += '<div class="pq-month__days">';
        for (const day of days) {
            const isWeekend = day.isSaturday || day.isSunday;
            const isHolidayVisible = day.isHoliday && showHolidays;
            const dateKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
            const isVacation = _overrideLibres ? false : showHolidays && vacationDays.has(dateKey);
            const qUserEntry = quarterlyTexts[dateKey];
            const hideHoliday = _overrideFestivos ? true : !!(qUserEntry && qUserEntry.hideHoliday);

            // CSS class: weekend takes priority over holiday for bg
            let cssClass = day.isSunday
                ? ' pq-day--sunday'
                : day.isSaturday
                  ? ' pq-day--saturday'
                  : isHolidayVisible
                    ? ' pq-day--holiday'
                    : '';
            if (isVacation) cssClass += ' pq-day--vacation';
            if (!showDayAbbrev) cssClass += ' pq-day--no-abbrev';

            // Background: weekend = colorMedium, vacation/holiday = colorHoliday, user bgColor overlay
            let bg = 'transparent';
            if (isWeekend) {
                bg = colorMedium;
            } else if (isVacation || isHolidayVisible) {
                bg = colorHoliday;
            }
            // User bgColor overlay (from cell editor)
            if (qUserEntry && qUserEntry.bgColor) {
                bg = `color-mix(in srgb, ${safeColor(qUserEntry.bgColor)} 12%, ${bg === 'transparent' ? 'var(--planner-color-paper)' : bg})`;
            }

            html += `<div class="pq-day${cssClass}" data-date="${dateKey}" style="background: ${bg}; border-bottom: 1px solid ${colorLight}">`;

            // Day abbreviation (always render for grid alignment)
            html += `<span class="pq-day__abbrev">${showDayAbbrev ? day.dayAbbrev : ''}</span>`;

            // Day number
            html += `<span class="pq-day__num">${String(day.day).padStart(2, '0')}</span>`;

            // Holiday text (suppressed if hideHoliday, not shown if vacation active)
            const holiday = day.holiday;
            if (isHolidayVisible && holiday && !hideHoliday && !isVacation) {
                html += `<span class="pq-day__holiday" style="color: ${colorHolidayText}" title="${esc(holidayTooltip(holiday))}">${esc(holidayCellText(holiday))}</span>`;
            }

            // Vacation indicator
            if (isVacation) {
                html += `<span class="pq-day__vacation" style="color: ${colorHolidayText}">✦ ${t('toggleVacation')}</span>`;
            }

            // User text (from quarterly cell editor)
            if (qUserEntry && qUserEntry.text) {
                const qc = _forceAccent ? cellAccent : safeColor(qUserEntry.color) || cellAccent;
                const qcStyle = qc ? ` style="color:${qc};"` : '';
                const qHtml = _overrideFormats
                    ? stripFormattingHTML(qUserEntry.text)
                    : sanitizeCellHTML(qUserEntry.text);
                html += `<span class="pq-day__user-text"${qcStyle}>${qHtml}</span>`;
            }

            // ISO week number (right-aligned, only on Mondays)
            // En el último mes (Junio/Sep/Dic/Mar), el QR interfiere con los últimos números de semana, así que los ocultamos.
            // Asumiremos que el QR (22mm) tapa los ~4-5 últimos días del mes.
            const overlapWithQr =
                isLastMonth && SHOW_QR_WATERMARK && mi === months.length - 1 && day.day >= days.length - 4;
            if (showWeekNumbers && day.isoWeekNum !== null && !overlapWithQr) {
                html += `<span class="pq-day__wk">${day.isoWeekNum}</span>`;
            }

            html += '</div>';
        }
        html += '</div>'; // .pq-month__days

        // Trimestral QR: al fondo a la derecha (debajo del último día, superpuesto)
        if (isLastMonth && SHOW_QR_WATERMARK) {
            html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--bottom-right planner-qr-watermark--quarterly" alt="" aria-hidden="true">`;
        }

        html += '</div>'; // .pq-month
    }
    html += '</div>'; // .pq-months

    html += '</div>'; // .pq-layout

    container.innerHTML = html;
}

// ── Diffing de celda: repintar UN día del trimestre SIN re-render ──
// In place: el mini-editor abierto retiene el nodo y el listener vive en el elemento.
export function updateQuarterlyCell(year: number, dateKey: string, config: QuarterRenderConfig): boolean {
    const el = document.querySelector<HTMLElement>(`.pq-day[data-date="${CSS.escape(dateKey)}"]`);
    if (!el) return false;
    const partes = dateKey.split('-').map(Number);
    const d = partes[2];
    const monthIdx = (partes[1] || 0) - 1;
    if (partes[0] !== year || monthIdx < 0 || !d) return false;

    const showHolidays = config.showHolidays !== false;
    const showDayAbbrev = config.showDayAbbrev !== false;
    const vacationDays = config._vacationDays || new Set();
    const quarterlyTexts = config._quarterlyTexts || {};
    const cellAccent = safeColor(config._accentColor);
    const forceAccent = config._forceAccent === true;
    const overrideFormats = config._overrideFormats === true;
    const overrideLibres = config._overrideLibres === true;
    const overrideFestivos = config._overrideFestivos === true;
    const colorMedium = getMonthColorMedium(monthIdx);
    const colorHoliday = getMonthColorHoliday(monthIdx);
    const colorHolidayText = getMonthColorHolidayText(monthIdx);
    const holidays = showHolidays
        ? getHolidays(year, { national: true, ccaa: config.ccaa || null, province: config.province || null })
        : null;

    const jsDay = new Date(year, monthIdx, d).getDay();
    const isSaturday = jsDay === 6;
    const isSunday = jsDay === 0;
    const isWeekend = isSaturday || isSunday;
    const holidayEntry = holidays ? holidays.get(`${monthIdx}-${d}`) : null;
    const isHolidayVisible = !!holidayEntry && showHolidays;
    const isVacation = overrideLibres ? false : showHolidays && vacationDays.has(dateKey);
    const qUserEntry = quarterlyTexts[dateKey];
    const hideHoliday = overrideFestivos ? true : !!(qUserEntry && qUserEntry.hideHoliday);

    let cssClass = isSunday
        ? ' pq-day--sunday'
        : isSaturday
          ? ' pq-day--saturday'
          : isHolidayVisible
            ? ' pq-day--holiday'
            : '';
    if (isVacation) cssClass += ' pq-day--vacation';
    if (!showDayAbbrev) cssClass += ' pq-day--no-abbrev';

    let bg = 'transparent';
    if (isWeekend) bg = colorMedium;
    else if (isVacation || isHolidayVisible) bg = colorHoliday;
    if (qUserEntry && qUserEntry.bgColor) {
        bg = `color-mix(in srgb, ${safeColor(qUserEntry.bgColor)} 12%, ${bg === 'transparent' ? 'var(--planner-color-paper)' : bg})`;
    }

    // Abreviatura y nº de semana son estáticos por celda (y el wk lleva la regla del QR con
    // contexto de mes entero): se conservan tal cual estaban.
    const abbrevHtml = el.querySelector('.pq-day__abbrev')?.outerHTML || '<span class="pq-day__abbrev"></span>';
    const wkHtml = el.querySelector('.pq-day__wk')?.outerHTML || '';

    let inner = abbrevHtml;
    inner += `<span class="pq-day__num">${String(d).padStart(2, '0')}</span>`;
    if (isHolidayVisible && holidayEntry && holidayEntry.name && !hideHoliday && !isVacation) {
        inner += `<span class="pq-day__holiday" style="color: ${colorHolidayText}" title="${esc(holidayTooltip(holidayEntry))}">${esc(holidayCellText(holidayEntry))}</span>`;
    }
    if (isVacation) {
        inner += `<span class="pq-day__vacation" style="color: ${colorHolidayText}">✦ ${t('toggleVacation')}</span>`;
    }
    if (qUserEntry && qUserEntry.text) {
        const qc = forceAccent ? cellAccent : safeColor(qUserEntry.color) || cellAccent;
        const qcStyle = qc ? ` style="color:${qc};"` : '';
        const qHtml = overrideFormats ? stripFormattingHTML(qUserEntry.text) : sanitizeCellHTML(qUserEntry.text);
        inner += `<span class="pq-day__user-text"${qcStyle}>${qHtml}</span>`;
    }
    inner += wkHtml;

    const editable = el.classList.contains('is-cell-editable') ? ' is-cell-editable' : '';
    el.className = `pq-day${cssClass}${editable}`;
    el.style.background = bg;
    el.innerHTML = inner;
    return true;
}
