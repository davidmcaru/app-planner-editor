import { createMiniEditor, type MiniEditorEl } from './planner-mini-editor.ts';
import { updateQuarterlyCell } from './planner-ui-quarterly.ts';
import { buildQuarterlyRenderConfig } from './planner-render.ts';
import type { CellTexts } from './planner-types.ts';
import type { SharedState } from './planner-text-edit-shared.ts';

export function createQuarterlyMode(shared: SharedState) {
    const {
        render,
        saveConfig,
        t,
        getYear,
        getVacationDays,
        saveVacationDays,
        getDesignConfig,
        getTextConfig,
        getQuarterlyTexts,
        setQuarterlyTexts,
        getQuarterConfig,
    } = shared.deps;

    let _quarterlyCellMiniEditor: MiniEditorEl | null = null;
    let _quarterlyCellSnapshot: CellTexts | null = null;
    let _quarterlyVacSnapshot: Set<string> | null = null;
    let _quarterlyCellClickHandlers: Array<{ el: HTMLElement; handler: (e?: Event) => void }> = [];

    function enter() {
        // Close orphaned mini-editor from previous render cycle
        if (_quarterlyCellMiniEditor) {
            _quarterlyCellMiniEditor._dismiss?.();
            _quarterlyCellMiniEditor = null;
        }
        _unbindQuarterlyCellClicks();
        shared.setActiveEditStyle('quarterly');
        const year = getYear();
        _quarterlyCellSnapshot = JSON.parse(JSON.stringify(getQuarterlyTexts()));
        _quarterlyVacSnapshot = new Set(getVacationDays(year));
        _bindQuarterlyCellClicks();

        // Defer outside-click listener — see weekly mode for rationale.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.addEventListener('mousedown', _quarterlyCellOutsideHandler, true);
            });
        });
    }

    function exit(action: string) {
        shared.setActiveEditStyle(null);
        const year = getYear();
        if (action !== 'save') {
            if (_quarterlyCellSnapshot !== null) setQuarterlyTexts(_quarterlyCellSnapshot);
            if (_quarterlyVacSnapshot !== null) saveVacationDays(year, _quarterlyVacSnapshot);
        }
        _quarterlyCellSnapshot = null;
        _quarterlyVacSnapshot = null;

        if (_quarterlyCellMiniEditor) {
            if (typeof _quarterlyCellMiniEditor._restoreCell === 'function') _quarterlyCellMiniEditor._restoreCell();
            _quarterlyCellMiniEditor._dismiss?.();
            _quarterlyCellMiniEditor = null;
        }

        document.removeEventListener('mousedown', _quarterlyCellOutsideHandler, true);
        _unbindQuarterlyCellClicks();

        if (action === 'save') saveConfig();
        else render();
    }

    function _closeQuarterlyCellMiniEditorOnly() {
        if (_quarterlyCellMiniEditor) {
            _quarterlyCellMiniEditor._confirm?.();
            _quarterlyCellMiniEditor = null;
        }
    }

    // Solo confirma el editor: el clic fuera del panel Textos lo resuelve el controller, que ahí cancela Textos.
    function _quarterlyCellOutsideHandler(e: MouseEvent) {
        if (_quarterlyCellMiniEditor && _quarterlyCellMiniEditor.contains(e.target as Node)) return;
        _closeQuarterlyCellMiniEditorOnly();
    }

    function _bindQuarterlyCellClicks() {
        const cells = document.querySelectorAll<HTMLElement>('.pq-day[data-date]');
        _quarterlyCellClickHandlers = [];
        for (const el of cells) {
            el.style.cursor = 'crosshair';
            el.classList.add('is-cell-editable');
            const handler = () => {
                const dateKey = el.dataset.date as string;
                _openQuarterlyCellMiniEditor(el, dateKey);
            };
            el.addEventListener('click', handler);
            _quarterlyCellClickHandlers.push({ el, handler });
        }
    }

    function _unbindQuarterlyCellClicks() {
        for (const { el, handler } of _quarterlyCellClickHandlers) {
            el.removeEventListener('click', handler);
            el.style.cursor = '';
            el.classList.remove('is-cell-editable');
        }
        _quarterlyCellClickHandlers = [];
    }

    function _openQuarterlyCellMiniEditor(cellEl: HTMLElement, dateKey: string) {
        if (_quarterlyCellMiniEditor) {
            if (typeof _quarterlyCellMiniEditor._restoreCell === 'function') _quarterlyCellMiniEditor._restoreCell();
            _quarterlyCellMiniEditor._dismiss?.();
            _quarterlyCellMiniEditor = null;
        }

        const year = getYear();
        const qt = getQuarterlyTexts();
        const cellData = qt[dateKey] || { text: '', vacation: false };
        const vacDays = getVacationDays(year);
        const isVac = vacDays.has(dateKey);
        const isHolidayCell = cellEl.classList.contains('pq-day--holiday');
        const isHideHoliday = !!(qt[dateKey] || {}).hideHoliday;
        const showHolidays = getQuarterConfig()?.showHolidays !== false;

        const originalInnerHTML = cellEl.innerHTML;
        const originalBgStyle = cellEl.style.background || '';
        const designAccent = getDesignConfig().plannerAccent || '#4A90D9';
        // Snapshot for cancel (config + vacation state)
        const cellDataSnapshot = JSON.parse(JSON.stringify(cellData));
        const vacSnapshot = isVac;

        const restoreCell = () => {
            cellEl.innerHTML = originalInnerHTML;
            cellEl.style.background = originalBgStyle;
        };

        const _reRenderAndRebind = () => {
            render();
            _unbindQuarterlyCellClicks();
            _bindQuarterlyCellClicks();
            _quarterlyCellMiniEditor = null;
        };

        const editor = createMiniEditor({
            anchorEl: cellEl,
            existing: { text: cellData.text || '', color: cellData.color || null },
            accentColor: designAccent,
            accentTitle: t('accentColorLabel'),
            placeholderKey: t('weeklyCellPlaceholder'),
            supportsVacation: true,
            vacationActive: isVac,
            vacationDisabled: !showHolidays || getTextConfig().overrideLibres,
            vacationDisabledTitle: getTextConfig().overrideLibres
                ? t('miniEditorLibresForced')
                : !showHolidays
                  ? t('vacationDisabledHint')
                  : null,
            onVacationToggle(active) {
                const vd = getVacationDays(year);
                if (active) vd.add(dateKey);
                else vd.delete(dateKey);
                saveVacationDays(year, vd);
                // Diffing: solo la celda tocada — el re-render completo mataba el editor
                // abierto y reconstruia cientos de nodos por cada toggle.
                if (!updateQuarterlyCell(year, dateKey, buildQuarterlyRenderConfig())) {
                    render();
                    _unbindQuarterlyCellClicks();
                    _bindQuarterlyCellClicks();
                }
            },
            supportsHolidayHide: isHolidayCell,
            holidayHideActive: !isHideHoliday,
            holidayHideDisabled: !isHolidayCell || getTextConfig().overrideFestivos,
            holidayHideDisabledTitle: getTextConfig().overrideFestivos
                ? t('miniEditorFestivosForced')
                : !isHolidayCell
                  ? t('holidayHideDisabledHint')
                  : null,
            onHolidayHideToggle(active) {
                if (!qt[dateKey]) qt[dateKey] = { text: '', vacation: false };
                qt[dateKey]!.hideHoliday = !active;
                if (!qt[dateKey]!.text && !qt[dateKey]!.vacation && !qt[dateKey]!.hideHoliday) delete qt[dateKey];
                setQuarterlyTexts(qt);
                if (!updateQuarterlyCell(year, dateKey, buildQuarterlyRenderConfig())) {
                    render();
                    _unbindQuarterlyCellClicks();
                    _bindQuarterlyCellClicks();
                }
            },
            supportsBgColor: true,
            bgColorActive: cellData.noBg ? 'NONE' : cellData.bgColor || designAccent,
            bgColorIsDefault: !cellData.noBg && !cellData.bgColor,
            onBgPreview(bgColor) {
                const bgHex = bgColor || null;
                cellEl.style.background = bgHex ? `color-mix(in srgb, ${bgHex} 12%, var(--planner-color-paper))` : '';
            },
            formatsDisabled: getTextConfig().overrideFormats,
            formatsDisabledTitle: getTextConfig().overrideFormats ? t('miniEditorFormatsForced') : null,
            colorDisabled: getTextConfig().overrideAccent,
            colorDisabledTitle: getTextConfig().overrideAccent ? t('miniEditorAccentForced') : null,
            confirmTitle: t('confirmCellBtn'),
            resetTitle: t('resetFormatBtn'),
            deleteTitle: t('deleteCellBtn'),
            onPreview(raw, plain, safeColor) {
                const sc = safeColor || designAccent;
                const rawBg = editor._getBgColor!();
                const bgHex = rawBg && rawBg !== 'NONE' ? rawBg : null;
                const numEl = cellEl.querySelector('.pq-day__num');
                const num = numEl ? numEl.textContent : '';
                const abbrevEl = cellEl.querySelector('.pq-day__abbrev');
                const abbrev = abbrevEl ? abbrevEl.textContent : '';
                let html = `<span class="pq-day__abbrev">${abbrev}</span>`;
                html += `<span class="pq-day__num">${num}</span>`;
                if (plain) {
                    const colorAttr = sc ? ` style="color:${sc};"` : '';
                    html += `<span class="pq-day__user-text"${colorAttr}>${raw}</span>`;
                }
                cellEl.innerHTML = html;
                cellEl.style.background = bgHex ? `color-mix(in srgb, ${bgHex} 12%, var(--planner-color-paper))` : '';
            },
            onRestore: restoreCell,
            onApply(txt, plain, color) {
                const vacState = editor._getVacationState!();
                const showHolidayState = editor._getHolidayHideState!();
                const hideState = !showHolidayState;
                const rawBg = editor._getBgColor!();
                const isNoBg = rawBg === 'NONE';
                const bgColor = !rawBg || isNoBg ? undefined : rawBg;
                if (plain || vacState || hideState || bgColor || isNoBg) {
                    qt[dateKey] = {
                        text: plain ? txt : '',
                        vacation: vacState,
                        hideHoliday: hideState || undefined,
                        color: color || undefined,
                        ...(bgColor ? { bgColor } : {}),
                        ...(isNoBg ? { noBg: true } : {}),
                    };
                    if (
                        !qt[dateKey].text &&
                        !qt[dateKey].vacation &&
                        !qt[dateKey].hideHoliday &&
                        !qt[dateKey].bgColor &&
                        !qt[dateKey].noBg
                    )
                        delete qt[dateKey];
                } else {
                    delete qt[dateKey];
                }
                const vd = getVacationDays(year);
                if (vacState) vd.add(dateKey);
                else vd.delete(dateKey);
                saveVacationDays(year, vd);
                setQuarterlyTexts(qt);
            },
            onClear() {
                delete qt[dateKey];
                setQuarterlyTexts(qt);
                _reRenderAndRebind();
            },
            onConfirm() {
                _reRenderAndRebind();
            },
            onCancel() {
                // Revert this cell's config data + vacation to pre-edit state
                if (
                    cellDataSnapshot.text ||
                    cellDataSnapshot.vacation ||
                    cellDataSnapshot.hideHoliday ||
                    cellDataSnapshot.bgColor
                ) {
                    qt[dateKey] = JSON.parse(JSON.stringify(cellDataSnapshot));
                } else {
                    delete qt[dateKey];
                }
                setQuarterlyTexts(qt);
                const vd = getVacationDays(year);
                if (vacSnapshot) vd.add(dateKey);
                else vd.delete(dateKey);
                saveVacationDays(year, vd);
                _reRenderAndRebind();
            },
            onClose() {
                _reRenderAndRebind();
            },
        });

        _quarterlyCellMiniEditor = editor;
        _quarterlyCellMiniEditor._restoreCell = restoreCell;
    }

    return { enter, exit };
}
