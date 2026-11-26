import {
    getDaysInMonth,
    getCalendarCells,
    getMiniCalendar,
    getPrevMonth,
    getNextMonth,
    getMonthName,
    getMonthColorMedium,
    getMonthColorHoliday,
    getMonthColorHolidayText,
} from './planner-core.ts';
import { getHolidays, holidayCellText, holidayTooltip, type HolidayInfo } from './planner-holidays.ts';
import { t } from './planner-i18n.ts';
import {
    esc,
    safeColor,
    renderSectionText,
    renderMiniCal,
    HABIT_ROWS,
    TODO_ITEMS,
    BOTTOM_MAX_HEIGHT,
} from './planner-ui-shared.ts';
import { SHOW_QR_WATERMARK, QR_SRC } from './planner-qr.ts';
import type { PlannerRenderConfig } from './planner-types.ts';

// Las páginas de calendario del cuadernillo lo pintan sin territorio, pero con «+N» si caen varios ese día.
function holidayInfoSpan(h: HolidayInfo, color: string): string {
    return `<span class="p-cal__cell-info" style="color:${color}" title="${esc(holidayTooltip(h))}">${esc(holidayCellText(h, false))}</span>`;
}

// ── PÁGINA 1 — Organizador mensual (A5 vertical) ──

export function renderPage1(container: HTMLElement, year: number, month: number, config: PlannerRenderConfig = {}) {
    const monthName = getMonthName(month).toUpperCase();
    const daysInMonth = getDaysInMonth(year, month);
    // Siempre visible: el interruptor «Título» se retiró de Config. `showMonthYear`
    // sigue en el tipo y en el código compartido por compatibilidad, pero ya no decide nada.
    const showMonthYear = true;
    const monthYearAlign = config.monthYearAlign || 'center';
    const showGoals = config.showGoals !== false;
    const showHabits = config.showHabits !== false;
    const showTodo = config.showTodo !== false;
    const showPriority = config.showPriority !== false;
    const showGrateful = config.showGrateful !== false;
    const showSelfCare = config.showSelfCare !== false;
    const showBottom = showGrateful || showSelfCare;
    const sectionTexts = config.sectionTexts || {};
    const todoCount = config.todoCount || TODO_ITEMS;
    const habitCount = config.habitCount || HABIT_ROWS;

    // Adjust bottom max-height based on extra rows
    const extraTodo = Math.max(0, todoCount - TODO_ITEMS);
    const extraHabit = Math.max(0, habitCount - HABIT_ROWS);
    const bottomReduction = extraTodo * 4 + extraHabit * 3; // mm reduction
    const bottomMaxH = Math.max(12, BOTTOM_MAX_HEIGHT - bottomReduction);
    const accent = safeColor(config.accentColor);
    // Only force the accent when explicitly requested (=== true), matching
    // weekly. Defaulting to `!== false` forced the accent whenever forceAccent
    // was absent (e.g. booklet export), overriding the user's custom colors.
    const _fa = config.forceAccent === true;
    const _of = config.overrideFormats === true;
    const rst = (key: string) => renderSectionText(sectionTexts, key, accent, _fa, _of);
    const accentStyle = accent ? ` --planner-page-accent: ${accent};` : '';

    // Header
    let html = `<div class="p1-layout${accent ? ' p1-layout--accent' : ''}" style="position: relative;${accentStyle}">`;

    if (showMonthYear) {
        const isInline = monthYearAlign.endsWith('-inline');
        const textAlign = monthYearAlign.replace('-inline', '');

        if (isInline) {
            html += `
                <div class="p1-header" style="text-align: ${textAlign}">
                    <h2 class="p1-header__month">${monthName} ${year}</h2>
                </div>`;
        } else {
            html += `
                <div class="p1-header" style="text-align: ${textAlign}">
                    <h2 class="p1-header__month">${monthName}</h2>
                    <p class="p1-header__year">${year}</p>
                </div>`;
        }
    }

    html += `
    `;

    // Monthly Goals — fieldset/legend style (closed box, title cuts top border)
    if (showGoals) {
        html += `<div class="p1-goals">
            <fieldset class="p1-goals__fieldset" data-section="goals">
                <legend class="p1-goals__legend">${t('monthlyGoals')}</legend>
                ${rst('goals')}
            </fieldset>
        </div>`;
    }

    // To Do + Top Priority
    if (showTodo || showPriority) {
        html += '<div class="p1-dual-row">';

        // To Do column
        if (showTodo) {
            html += `<div class="p1-todo"><p class="p1-section-title">${t('toDo')}</p>`;
            for (let i = 0; i < todoCount; i++) {
                html += `
                    <div class="p1-todo__item" data-section="todo-${i}">
                        <div class="p1-todo__circle"></div>
                        <div class="p1-todo__line">${rst(`todo-${i}`)}</div>
                    </div>
                `;
            }
            html += '</div>';
        }

        // Top Priority column
        if (showPriority) {
            html += `
                <div class="p1-priority">
                    <p class="p1-section-title">${t('topPriority')}</p>
                    <div class="p1-priority__box" data-section="priority">${rst('priority')}</div>
                </div>
            `;
        }
        html += '</div>';
    }

    // Habit Tracker — invisible table layout for perfect column alignment
    if (showHabits) {
        html += `<div class="p1-habits">
            <div class="p1-habits__title-row">
                <p class="p1-section-title">${t('myHabits')}</p>
            </div>`;

        html += '<table class="p1-habits__table"><thead><tr>';
        html += `<th class="p1-habits__label-col"><span class="p1-habits__label-text">${t('habit')}</span></th>`;
        html += '<th class="p1-habits__spacer-col"></th>';
        for (let d = 1; d <= daysInMonth; d++) {
            html += `<th class="p1-habits__day-num">${d}</th>`;
        }
        html += '</tr></thead><tbody>';

        for (let r = 0; r < habitCount; r++) {
            html += '<tr class="p1-habits__row">';
            html += `<td class="p1-habits__row-label" data-section="habit-${r}">${rst(`habit-${r}`)}</td>`;
            html += '<td class="p1-habits__spacer-cell"></td>';
            for (let d = 0; d < daysInMonth; d++) {
                html += '<td class="p1-habits__circle-cell"><div class="p1-habits__circle"></div></td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        html += '</div>';
    }

    // Bottom: Grateful + Self-care
    if (showBottom) {
        html += `<div class="p1-bottom-row" style="max-height: ${bottomMaxH}mm">`;

        if (showGrateful) {
            html += '<div class="p1-bottom-box" data-section="grateful">';
            html += `<p class="p1-bottom-box__title">${t('grateful')}</p>`;
            html += rst('grateful');
            html += '</div>';
        }

        if (showGrateful && showSelfCare) {
            html += '<div class="p1-bottom-divider"></div>';
        }

        if (showSelfCare) {
            html += '<div class="p1-bottom-box" data-section="selfCare">';
            html += `<p class="p1-bottom-box__title">${t('selfCare')}</p>`;
            html += rst('selfCare');
            html += '</div>';
        }

        html += '</div>'; // .p1-bottom-row
    }

    // Monthly H1 QR: alineado a la parte inferior derecha del folio, usando los márgenes existentes
    if (SHOW_QR_WATERMARK) {
        html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--bottom-right planner-qr-watermark--a5" alt="" aria-hidden="true">`;
    }

    html += '</div>'; // .p1-layout

    container.innerHTML = html;
}

// ── PÁGINA 2 — Calendario izquierda (Lun-Mié) + Notes sidebar ──

export function renderPage2(container: HTMLElement, year: number, month: number, config: PlannerRenderConfig = {}) {
    const { leftCells, weeks } = getCalendarCells(year, month);
    const prev = getPrevMonth(year, month);
    const miniPrev = getMiniCalendar(prev.year, prev.month);
    const monthName = getMonthName(month).toUpperCase();
    const dayNamesLeft = t('daysLeft');
    const showMiniCal = config.showMiniCal !== false;

    // Holiday / vacation data (optional — used in book export)
    const showHolidays = config.showHolidays === true;
    const holidays = showHolidays
        ? getHolidays(year, { national: true, ccaa: config.ccaa || null, province: config.province || null })
        : null;
    const vacationDays = config._vacationDays || new Set();
    const colorHoliday = getMonthColorHoliday(month);
    const colorHolidayText = getMonthColorHolidayText(month);

    let html = '<div class="p-cal">';

    // Header: mini prev (left) + month title (right or left)
    html += '<div class="p-cal__header p-cal__header--left">';
    if (showMiniCal) {
        html += `<div class="p-cal__mini p-cal__mini--left">${renderMiniCal(miniPrev)}</div>`;
    }
    const titleAlignClass = showMiniCal ? '' : ' p-cal__title-block--left';
    html += `<div class="p-cal__title-block${titleAlignClass}">
        <div class="p-cal__month-title">${monthName}</div>
        <div class="p-cal__year">${year}</div>
    </div>`;
    html += '</div>';

    // Body: CSS Grid — day-headers span right col, notes + grid below
    html += '<div class="p-cal__body p-cal__body--with-notes">';

    // Day name headers (grid-column: 2, grid-row: 1)
    html += '<div class="p-cal__day-headers p-cal__day-headers--3col">';
    for (const name of dayNamesLeft) {
        html += `<span class="p-cal__day-name">${name}</span>`;
    }
    html += '</div>';

    // Notes sidebar (grid-column: 1, grid-row: 2)
    // Monthly H2 QR: centrado H y V en la "ultima fila" del sidebar de notas
    // Hacemos el notes un grid con el mismo nº de filas que el calendario.
    if (SHOW_QR_WATERMARK) {
        html += `<div class="p-cal__notes" style="display: grid; grid-template-rows: repeat(${weeks}, 1fr);">`;
        html += `<span class="p-cal__notes-title" style="grid-row: 1;">${t('notes')}</span>`;
        html += `<div style="grid-row: ${weeks}; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2mm;">`;
        html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--notes planner-qr-watermark--a5" alt="" aria-hidden="true">`;
        html += '</div>';
        html += '</div>';
    } else {
        html += `<div class="p-cal__notes"><span class="p-cal__notes-title">${t('notes')}</span></div>`;
    }

    // Grid cells (grid-column: 2, grid-row: 2)
    html += `<div class="p-cal__grid p-cal__grid--3col" style="grid-template-rows: repeat(${weeks}, 1fr)">`;
    for (const cell of leftCells) {
        const empty = cell.day === null ? ' p-cal__cell--empty' : '';
        if (cell.day === null) {
            html += `<div class="p-cal__cell${empty}"></div>`;
            continue;
        }

        // Holiday / vacation lookup
        const holidayKey = `${month}-${cell.day}`;
        const holidayEntry = holidays ? holidays.get(holidayKey) : null;
        const isHolidayVisible = !!holidayEntry && showHolidays;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
        const isVacation = vacationDays.has(dateStr);

        let cssClass = '';
        if (isHolidayVisible) cssClass = ' p-cal__cell--holiday';
        if (isVacation) cssClass += ' p-cal__cell--vacation';

        // Background
        let bg = '';
        if (isVacation || isHolidayVisible) bg = colorHoliday;

        html += `<div class="p-cal__cell${cssClass}" data-date="${dateStr}"${bg ? ` style="background:${bg}"` : ''}>`;
        html += `<span class="p-cal__cell-day">${cell.day}</span>`;
        if (isVacation) {
            html += `<span class="p-cal__cell-info" style="color:${colorHolidayText}">✦</span>`;
        } else if (isHolidayVisible) {
            html += holidayInfoSpan(holidayEntry, colorHolidayText);
        }
        html += '</div>';
    }
    html += '</div>';

    html += '</div>'; // body
    html += '</div>'; // p-cal

    container.innerHTML = html;
}

// ── PÁGINA 3 — Calendario derecha (Jue-Dom) ──

export function renderPage3(container: HTMLElement, year: number, month: number, config: PlannerRenderConfig = {}) {
    const { rightCells, weeks } = getCalendarCells(year, month);
    const next = getNextMonth(year, month);
    const miniNext = getMiniCalendar(next.year, next.month);
    const dayNamesRight = t('daysRight');
    const sundayLabel = t('sundayLabel');
    const showMiniCal = config.showMiniCal !== false;

    // Holiday / vacation data (optional — used in book export)
    const showHolidays = config.showHolidays === true;
    const holidays = showHolidays
        ? getHolidays(year, { national: true, ccaa: config.ccaa || null, province: config.province || null })
        : null;
    const vacationDays = config._vacationDays || new Set();
    const colorHoliday = getMonthColorHoliday(month);
    const colorHolidayText = getMonthColorHolidayText(month);
    const colorMedium = getMonthColorMedium(month);
    const weekendShading = config.weekendShading !== false;

    let html = '<div class="p-cal">';

    // Header: mini next (right corner) — keep title-block spacer for consistent height
    html += '<div class="p-cal__header p-cal__header--right">';
    if (showMiniCal) {
        html += `<div class="p-cal__mini p-cal__mini--right">${renderMiniCal(miniNext)}</div>`;
    }
    // Invisible title-block keeps header height equal to left calendar
    html += `<div class="p-cal__title-block" style="visibility: hidden;">
        <div class="p-cal__month-title">&nbsp;</div>
        <div class="p-cal__year">&nbsp;</div>
    </div>`;
    html += '</div>';

    // Body: grid only (4 columns)
    html += '<div class="p-cal__body">';
    html += '<div class="p-cal__grid-wrapper">';

    // Day name headers
    html += '<div class="p-cal__day-headers p-cal__day-headers--4col">';
    for (const name of dayNamesRight) {
        const sundayClass = name === sundayLabel ? ' p-cal__day-name--sunday' : '';
        html += `<span class="p-cal__day-name${sundayClass}">${name}</span>`;
    }
    html += '</div>';

    // Grid cells with holidays, vacations, and QR
    const qrCellIdx3 = SHOW_QR_WATERMARK ? rightCells.length - 1 : -1;

    html += `<div class="p-cal__grid p-cal__grid--4col" style="grid-template-rows: repeat(${weeks}, 1fr)">`;
    for (let idx3 = 0; idx3 < rightCells.length; idx3++) {
        const cell = rightCells[idx3] as (typeof rightCells)[number];
        const isQrCell = SHOW_QR_WATERMARK && idx3 === qrCellIdx3;

        if (cell.day === null) {
            const emptyStyle = isQrCell ? ' style="position: relative;"' : '';
            html += `<div class="p-cal__cell p-cal__cell--empty"${emptyStyle}>`;
            if (isQrCell) {
                html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--cell-center planner-qr-watermark--a5" alt="" aria-hidden="true">`;
            }
            html += '</div>';
            continue;
        }

        // Holiday / vacation lookup
        const holidayKey = `${month}-${cell.day}`;
        const holidayEntry = holidays ? holidays.get(holidayKey) : null;
        const isHolidayVisible = !!holidayEntry && showHolidays;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
        const isVacation = vacationDays.has(dateStr);
        const isWeekend = cell.isSaturday || cell.isSunday;

        let cssClass = '';
        if (cell.isSunday) cssClass = ' p-cal__cell--sunday';
        else if (cell.isSaturday) cssClass = ' p-cal__cell--saturday';
        else if (isHolidayVisible) cssClass = ' p-cal__cell--holiday';
        if (isVacation) cssClass += ' p-cal__cell--vacation';

        // Background
        let bg = '';
        if (isWeekend && weekendShading) bg = colorMedium;
        else if (isVacation || isHolidayVisible) bg = colorHoliday;
        const styleAttr =
            bg || isQrCell ? ` style="${bg ? `background:${bg};` : ''}${isQrCell ? 'position:relative;' : ''}"` : '';

        html += `<div class="p-cal__cell${cssClass}" data-date="${dateStr}"${styleAttr}>`;
        html += `<span class="p-cal__cell-day">${cell.day}</span>`;
        if (isVacation) {
            html += `<span class="p-cal__cell-info" style="color:${colorHolidayText}">✦</span>`;
        } else if (isHolidayVisible) {
            html += holidayInfoSpan(holidayEntry, colorHolidayText);
        }
        if (isQrCell) {
            html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--cell-center planner-qr-watermark--a5" alt="" aria-hidden="true">`;
        }
        html += '</div>';
    }
    html += '</div>';

    html += '</div>'; // grid-wrapper
    html += '</div>'; // body
    html += '</div>'; // p-cal

    container.innerHTML = html;
}

// ── PLANNER HORIZONTAL — Organizador A4 landscape ──

/**
 * Renderiza el organizador en formato horizontal (A4 landscape).
 * Row 1: Goals (~40%) + Habits (~60%)
 * Row 2: (To Do + Priority ~40%) + (Grateful + Self-care ~60%)
 */
export function renderPlannerHorizontal(
    container: HTMLElement,
    year: number,
    month: number,
    config: PlannerRenderConfig = {}
) {
    const monthName = getMonthName(month).toUpperCase();
    const daysInMonth = getDaysInMonth(year, month);
    // Siempre visible: el interruptor «Título» se retiró de Config. `showMonthYear`
    // sigue en el tipo y en el código compartido por compatibilidad, pero ya no decide nada.
    const showMonthYear = true;
    const monthYearAlign = config.monthYearAlign || 'center';
    const showGoals = config.showGoals !== false;
    const showHabits = config.showHabits !== false;
    const showTodo = config.showTodo !== false;
    const showPriority = config.showPriority !== false;
    const showGrateful = config.showGrateful !== false;
    const showSelfCare = config.showSelfCare !== false;
    const sectionTexts = config.sectionTexts || {};
    const todoCount = config.todoCount || TODO_ITEMS;
    const habitCount = config.habitCount || HABIT_ROWS;
    const accent = safeColor(config.accentColor);
    // Only force the accent when explicitly requested (=== true), matching
    // weekly. See renderPage1 for rationale (booklet export default bug).
    const _fa = config.forceAccent === true;
    const _of = config.overrideFormats === true;
    const rst = (key: string) => renderSectionText(sectionTexts, key, accent, _fa, _of);
    const accentStyle = accent ? ` --planner-page-accent: ${accent};` : '';

    let html = `<div class="ph-layout${accent ? ' ph-layout--accent' : ''}"${accentStyle ? ` style="${accentStyle.trim()}"` : ''}>`;
    // ── Header ──
    if (showMonthYear) {
        const isInline = monthYearAlign.endsWith('-inline');
        const textAlign = monthYearAlign.replace('-inline', '');
        const leftCls = textAlign === 'left' ? ' ph-header--left' : '';

        if (isInline) {
            html += `<div class="ph-header${leftCls}" style="text-align: ${textAlign}">
                <h2 class="ph-header__month">${monthName} ${year}</h2>
            </div>`;
        } else {
            html += `<div class="ph-header${leftCls}" style="text-align: ${textAlign}">
                <h2 class="ph-header__month">${monthName}</h2>
                <p class="ph-header__year">${year}</p>
            </div>`;
        }
    }

    // ── Top Row: Goals (left) | Habits + Tareas (right) ──
    html += '<div class="ph-top-row">';

    if (showGoals) {
        html += `<div class="ph-goals">
            <fieldset class="ph-goals__fieldset" data-section="goals">
                <legend class="ph-goals__legend">${t('monthlyGoals')}</legend>
                ${rst('goals')}
            </fieldset>
        </div>`;
    }

    if (showHabits || showTodo) {
        html += '<div class="ph-right-col">';

        if (showTodo) {
            html += `<div class="ph-todo"><p class="ph-section-title">${t('toDo')}</p>`;
            for (let i = 0; i < todoCount; i++) {
                html += `<div class="ph-todo__item" data-section="todo-${i}">
                    <div class="ph-todo__circle"></div>
                    <div class="ph-todo__line">${rst(`todo-${i}`)}</div>
                </div>`;
            }
            html += '</div>';
        }

        if (showHabits) {
            html += '<div class="ph-habits">';
            html += `<div class="ph-habits__title-row">
                <p class="ph-section-title">${t('myHabits')}</p>
            </div>`;

            html += '<table class="ph-habits__table"><thead><tr>';
            html += `<th class="ph-habits__label-col"><span class="ph-habits__label-text">${t('habit')}</span></th>`;
            html += '<th class="ph-habits__spacer-col"></th>';
            for (let d = 1; d <= daysInMonth; d++) {
                html += `<th class="ph-habits__day-num">${d}</th>`;
            }
            html += '</tr></thead><tbody>';

            for (let r = 0; r < habitCount; r++) {
                html += '<tr class="ph-habits__row">';
                html += `<td class="ph-habits__row-label" data-section="habit-${r}">${rst(`habit-${r}`)}</td>`;
                html += '<td class="ph-habits__spacer-cell"></td>';
                for (let d = 0; d < daysInMonth; d++) {
                    html += '<td class="ph-habits__circle-cell"><div class="ph-habits__circle"></div></td>';
                }
                html += '</tr>';
            }
            html += '</tbody></table>';
            html += '</div>'; // .ph-habits
        }

        html += '</div>'; // .ph-right-col
    }

    html += '</div>'; // .ph-top-row

    // ── Bottom Row: Grateful + Self-care + Priority as flat elements ──
    const bottomItems: string[] = [];
    if (showGrateful) bottomItems.push('grateful');
    if (showSelfCare) bottomItems.push('selfCare');
    if (showPriority) bottomItems.push('priority');
    const bottomCount = bottomItems.length;

    if (bottomCount > 0) {
        html += '<div class="ph-bottom-row">';
        const isLeftAlign = monthYearAlign.startsWith('left');
        let firstBoxDone = false;

        bottomItems.forEach((item, idx) => {
            if (idx > 0 && item !== 'priority' && bottomItems[idx - 1] !== 'priority') {
                html += '<div class="ph-bottom-divider"></div>';
            }
            if (item === 'priority') {
                html += `<fieldset class="ph-priority__fieldset" data-section="priority">
                    <legend class="ph-priority__legend">${t('topPriority')}</legend>
                    ${rst('priority')}
                </fieldset>`;
            } else {
                const label = item === 'grateful' ? t('grateful') : t('selfCare');
                const leftCls = isLeftAlign && !firstBoxDone ? ' ph-bottom-box--left-inset' : '';
                firstBoxDone = true;
                html += `<div class="ph-bottom-box${leftCls}" data-section="${item}">`;
                html += `<p class="ph-bottom-box__title">${label}</p>`;
                html += rst(item);
                html += '</div>';
            }
        });

        html += '</div>'; // .ph-bottom-row
    }

    // QR watermark
    if (SHOW_QR_WATERMARK) {
        html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--bottom-right planner-qr-watermark--a4h" alt="" aria-hidden="true">`;
    }

    html += '</div>'; // .ph-layout

    container.innerHTML = html;
}
