import { createMiniEditor, type MiniEditorEl } from './planner-mini-editor.ts';
import { updateMonthlyCell } from './planner-ui-monthly.ts';
import { buildMonthlyRenderConfig } from './planner-render.ts';
import { getMonth } from './planner-state.ts';
import type { CellTexts } from './planner-types.ts';
import type { SharedState } from './planner-text-edit-shared.ts';

export function createMonthlyMode(shared: SharedState) {
    const {
        render,
        saveConfig,
        t,
        getYear,
        getVacationDays,
        saveVacationDays,
        getDesignConfig,
        getTextConfig,
        getMonthlyTexts,
        setMonthlyTexts,
        getMonthlyCalConfig,
    } = shared.deps;

    let _monthlyCellMiniEditor: MiniEditorEl | null = null;
    let _monthlyCellSnapshot: CellTexts | null = null;
    let _monthlyVacSnapshot: Map<number, Set<string>> | null = null; // Map<year, Set<dateKey>> — viewed year + adjacent years
    let _monthlyCellClickHandlers: Array<{ el: HTMLElement; handler: (e?: Event) => void }> = [];

    function enter() {
        // Close orphaned mini-editor from previous render cycle
        if (_monthlyCellMiniEditor) {
            _monthlyCellMiniEditor._dismiss?.();
            _monthlyCellMiniEditor = null;
        }
        _unbindMonthlyCellClicks();
        shared.setActiveEditStyle('monthly');
        const year = getYear();
        _monthlyCellSnapshot = JSON.parse(JSON.stringify(getMonthlyTexts()));
        // Snapshot the viewed year AND its neighbours — monthly overflow cells
        // can edit vacations of the prev/next year (Dec/Jan boundary), so cancel
        // must be able to revert those years too.
        _monthlyVacSnapshot = new Map();
        for (const y of [year - 1, year, year + 1]) {
            _monthlyVacSnapshot.set(y, new Set(getVacationDays(y)));
        }
        _bindMonthlyCellClicks();

        // Defer outside-click listener — see weekly mode for rationale.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.addEventListener('mousedown', _monthlyCellOutsideHandler, true);
            });
        });
    }

    function exit(action: string) {
        shared.setActiveEditStyle(null);
        if (action !== 'save') {
            if (_monthlyCellSnapshot !== null) setMonthlyTexts(_monthlyCellSnapshot);
            if (_monthlyVacSnapshot !== null) {
                for (const [y, set] of _monthlyVacSnapshot) {
                    saveVacationDays(y, set);
                }
            }
        }
        _monthlyCellSnapshot = null;
        _monthlyVacSnapshot = null;

        if (_monthlyCellMiniEditor) {
            if (typeof _monthlyCellMiniEditor._restoreCell === 'function') _monthlyCellMiniEditor._restoreCell();
            _monthlyCellMiniEditor._dismiss?.();
            _monthlyCellMiniEditor = null;
        }

        document.removeEventListener('mousedown', _monthlyCellOutsideHandler, true);
        _unbindMonthlyCellClicks();

        if (action === 'save') saveConfig();
        else render();
    }

    function _closeMonthlyCellMiniEditorOnly() {
        if (_monthlyCellMiniEditor) {
            _monthlyCellMiniEditor._confirm?.();
            _monthlyCellMiniEditor = null;
        }
    }

    // Solo confirma el editor: el clic fuera del panel Textos lo resuelve el controller, que ahí cancela Textos.
    function _monthlyCellOutsideHandler(e: MouseEvent) {
        if (_monthlyCellMiniEditor && _monthlyCellMiniEditor.contains(e.target as Node)) return;
        _closeMonthlyCellMiniEditorOnly();
    }

    function _bindMonthlyCellClicks() {
        const cells = document.querySelectorAll<HTMLElement>('.pm-cell[data-date]');
        _monthlyCellClickHandlers = [];
        for (const el of cells) {
            el.style.cursor = 'crosshair';
            el.classList.add('is-cell-editable');
            const handler = () => {
                const dateKey = el.dataset.date as string;
                _openMonthlyCellMiniEditor(el, dateKey);
            };
            el.addEventListener('click', handler);
            _monthlyCellClickHandlers.push({ el, handler });
        }
    }

    function _unbindMonthlyCellClicks() {
        for (const { el, handler } of _monthlyCellClickHandlers) {
            el.removeEventListener('click', handler);
            el.style.cursor = '';
            el.classList.remove('is-cell-editable');
        }
        _monthlyCellClickHandlers = [];
    }

    function _openMonthlyCellMiniEditor(cellEl: HTMLElement, dateKey: string) {
        if (_monthlyCellMiniEditor) {
            if (typeof _monthlyCellMiniEditor._restoreCell === 'function') _monthlyCellMiniEditor._restoreCell();
            _monthlyCellMiniEditor._dismiss?.();
            _monthlyCellMiniEditor = null;
        }

        // Derive the year from the cell's dateKey (YYYY-MM-DD), NOT the viewed
        // year — overflow cells (prev/next month) can belong to a different year
        // across the Dec/Jan boundary, so vacations must be read/written against
        // the cell's own year.
        const year = parseInt(dateKey.slice(0, 4), 10) || getYear();
        const mt = getMonthlyTexts();
        const cellData = mt[dateKey] || { text: '', vacation: false };
        const vacDays = getVacationDays(year);
        const isVac = vacDays.has(dateKey);
        const isHolidayCell = cellEl.classList.contains('pm-cell--holiday');
        const isHideHoliday = !!(mt[dateKey] || {}).hideHoliday;
        const showHolidays = getMonthlyCalConfig()?.showHolidays !== false;

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
            _unbindMonthlyCellClicks();
            _bindMonthlyCellClicks();
            _monthlyCellMiniEditor = null;
        };

        const editor = createMiniEditor({
            anchorEl: cellEl,
            existing: { text: cellData.text || '', color: cellData.color || null },
            accentColor: designAccent,
            accentTitle: t('accentColorLabel'),
            placeholderKey: t('weeklyCellPlaceholder'),
            supportsBulletList: true,
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
                // Diffing: solo la celda tocada; las overflow (mes vecino) devuelven false
                // y siguen por el camino del render completo.
                if (!updateMonthlyCell(year, getMonth(), dateKey, buildMonthlyRenderConfig())) {
                    render();
                    _unbindMonthlyCellClicks();
                    _bindMonthlyCellClicks();
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
                if (!mt[dateKey]) mt[dateKey] = { text: '', vacation: false };
                mt[dateKey]!.hideHoliday = !active;
                if (!mt[dateKey]!.text && !mt[dateKey]!.vacation && !mt[dateKey]!.hideHoliday) delete mt[dateKey];
                setMonthlyTexts(mt);
                if (!updateMonthlyCell(year, getMonth(), dateKey, buildMonthlyRenderConfig())) {
                    render();
                    _unbindMonthlyCellClicks();
                    _bindMonthlyCellClicks();
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
                // Re-render cell content with preview
                const sc = safeColor || designAccent;
                const rawBg = editor._getBgColor!();
                const bgHex = rawBg && rawBg !== 'NONE' ? rawBg : null;
                const dayNum = cellEl.querySelector('.pm-cell__day')?.textContent || '';
                const infoEl = cellEl.querySelector('.pm-cell__info');
                const infoHTML = infoEl ? infoEl.outerHTML : '';
                let html = `<span class="pm-cell__day">${dayNum}</span>`;
                html += infoHTML;
                if (plain) {
                    const colorAttr = sc ? ` style="color:${sc};"` : '';
                    html += `<span class="pm-cell__user-text"${colorAttr}>${raw}</span>`;
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
                    mt[dateKey] = {
                        text: plain ? txt : '',
                        vacation: vacState,
                        hideHoliday: hideState || undefined,
                        color: color || undefined,
                        ...(bgColor ? { bgColor } : {}),
                        ...(isNoBg ? { noBg: true } : {}),
                    };
                    if (
                        !mt[dateKey].text &&
                        !mt[dateKey].vacation &&
                        !mt[dateKey].hideHoliday &&
                        !mt[dateKey].bgColor &&
                        !mt[dateKey].noBg
                    )
                        delete mt[dateKey];
                } else {
                    delete mt[dateKey];
                }
                const vd = getVacationDays(year);
                if (vacState) vd.add(dateKey);
                else vd.delete(dateKey);
                saveVacationDays(year, vd);
                setMonthlyTexts(mt);
            },
            onClear() {
                delete mt[dateKey];
                setMonthlyTexts(mt);
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
                    mt[dateKey] = JSON.parse(JSON.stringify(cellDataSnapshot));
                } else {
                    delete mt[dateKey];
                }
                setMonthlyTexts(mt);
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

        _monthlyCellMiniEditor = editor;
        _monthlyCellMiniEditor._restoreCell = restoreCell;
    }

    return { enter, exit };
}
