import { t, tArr } from './planner-i18n.ts';
import { esc, safeColor, sanitizeCellHTML, stripFormattingHTML } from './planner-ui-shared.ts';
import { SHOW_QR_WATERMARK, QR_SRC } from './planner-qr.ts';
import type { WeekRenderConfig } from './planner-types.ts';

/**
 * Renders a single-page weekly schedule.
 */
export function renderWeeklyPage(
    container: HTMLElement,
    _year: number,
    _month: number,
    _weekNumber: number,
    config: WeekRenderConfig
) {
    const daysFull = tArr('daysFull');

    const activeDays = config.days.sort((a, b) => a - b);
    const hours = config.hours;
    const numCols = activeDays.length;
    const showTitle = config.showTitle !== false;
    const titleText = config.titleText || t('pageWeekly');
    const accent = safeColor(config.accentColor);
    const _forceAccent = config.forceAccent === true;
    const _overrideFormats = config.overrideFormats === true;
    const cellTexts = config.cellTexts || {};

    const accentStyle = accent ? ` --pw-accent: ${accent};` : '';
    const hourAlign = config.hourAlign || 'middle';
    const alignCls = hourAlign !== 'middle' ? ` pw-layout--align-${hourAlign}` : '';
    let html = `<div class="pw-layout${accent ? ' pw-layout--accent' : ''}${alignCls}" style="--pw-cols: ${numCols};${accentStyle}">\r\n`;

    // Header (optional)
    if (showTitle) {
        html += `<div class="pw-header">
            <h2 class="pw-header__title">${esc(titleText)}</h2>
        </div>`;
    }

    // Table
    html += '<table class="pw-table">';

    // Day headers row
    html += '<thead><tr>';
    html += '<th class="pw-table__corner"></th>';
    for (const dayIdx of activeDays) {
        html += `<th class="pw-table__day-header">
            <span class="pw-table__day-name">${daysFull[dayIdx] || ''}</span>
        </th>`;
    }
    html += '</tr></thead>';

    // Body rows
    html += '<tbody>';
    for (let slot = 0; slot < hours.length; slot++) {
        const isBlockStart = slot % 2 === 0;
        const blockClass = isBlockStart ? ' pw-table__row--block-start' : '';

        html += `<tr class="pw-table__row${blockClass}">`;
        html += `<td class="pw-table__hour">${esc(hours[slot])}</td>`;
        for (let c = 0; c < numCols; c++) {
            const dayIdx = activeDays[c];
            const cellKey = `${dayIdx}-${slot}`;
            const cellData = cellTexts[cellKey];
            const dataAttr = ` data-cell="${cellKey}"`;
            if (cellData && cellData.text) {
                const sc = _forceAccent ? accent : safeColor(cellData.color) || accent;
                const bgHex = safeColor(cellData.bgColor) || (cellData.noBg ? null : sc);
                const cellStyle = bgHex
                    ? ` style="background:color-mix(in srgb, ${bgHex} 12%, var(--planner-color-paper));"`
                    : '';
                const colorStyle = sc ? ` style="color:${sc};"` : '';
                const cellHtml = _overrideFormats
                    ? stripFormattingHTML(cellData.text)
                    : sanitizeCellHTML(cellData.text);
                html += `<td class="pw-table__cell"${dataAttr}${cellStyle}><span class="pw-table__cell-text"${colorStyle}>${cellHtml}</span></td>`;
            } else if (cellData && (cellData.bgColor || cellData.noBg)) {
                const bgHex = safeColor(cellData.bgColor) || null;
                const cellStyle = bgHex
                    ? ` style="background:color-mix(in srgb, ${bgHex} 12%, var(--planner-color-paper));"`
                    : '';
                html += `<td class="pw-table__cell"${dataAttr}${cellStyle}></td>`;
            } else {
                html += `<td class="pw-table__cell"${dataAttr}></td>`;
            }
        }
        html += '</tr>';
    }
    html += '</tbody>';

    html += '</table>';

    // QR overlay
    if (SHOW_QR_WATERMARK) {
        html += `<img src="${QR_SRC}" class="planner-qr-watermark planner-qr-watermark--bottom-right planner-qr-watermark--weekly-fixed" alt="" aria-hidden="true">`;
    }

    html += '</div>'; // .pw-layout

    container.innerHTML = html;
}
