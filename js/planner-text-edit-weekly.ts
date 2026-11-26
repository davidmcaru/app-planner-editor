import { createMiniEditor, type MiniEditorEl } from './planner-mini-editor.ts';
import type { CellTexts } from './planner-types.ts';
import type { SharedState } from './planner-text-edit-shared.ts';

export function createWeeklyMode(shared: SharedState) {
    const { render, saveConfig, t, getWeekConfig, setWeekConfig, getDesignConfig, getTextConfig } = shared.deps;

    let _cellEditMiniEditor: MiniEditorEl | null = null;
    let _cellEditSnapshot: CellTexts | null = null;
    let _cellEditClickHandlers: Array<{ el: HTMLElement; handler: (e?: Event) => void }> = [];

    function enter() {
        // Close orphaned mini-editor from previous render cycle
        if (_cellEditMiniEditor) {
            _cellEditMiniEditor._dismiss?.();
            _cellEditMiniEditor = null;
        }
        _unbindCellEditClicks();
        shared.setActiveEditStyle('weekly');
        // Snapshot cell texts so we can revert on cancel
        const wc = getWeekConfig();
        _cellEditSnapshot = JSON.parse(JSON.stringify(wc.cellTexts || {}));

        // Add crosshair cursor + click handlers to cells
        _bindCellEditClicks();

        // Defer outside-click listener registration past the current event
        // loop tick AND the next paint, so the mousedown that activated this
        // mode cannot be observed by the capture-phase handler. Double rAF
        // is more robust than `setTimeout(0)` on slow browsers/devices.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.addEventListener('mousedown', _cellEditOutsideHandler, true);
            });
        });
    }

    function exit(action: string) {
        shared.setActiveEditStyle(null);
        if (action !== 'save' && _cellEditSnapshot !== null) {
            const wc = getWeekConfig();
            wc.cellTexts = _cellEditSnapshot;
            setWeekConfig(wc);
        }
        _cellEditSnapshot = null;

        if (_cellEditMiniEditor) {
            if (typeof _cellEditMiniEditor._restoreCell === 'function') {
                _cellEditMiniEditor._restoreCell();
            }
            _cellEditMiniEditor._dismiss?.();
            _cellEditMiniEditor = null;
        }

        document.removeEventListener('mousedown', _cellEditOutsideHandler, true);
        _unbindCellEditClicks();

        if (action === 'save') {
            saveConfig();
        } else {
            render();
        }
    }

    function _closeMiniEditorOnly() {
        if (_cellEditMiniEditor) {
            _cellEditMiniEditor._confirm?.();
            _cellEditMiniEditor = null;
        }
    }

    // Solo confirma el editor: el clic fuera del panel Textos lo resuelve el controller, que ahí cancela Textos.
    function _cellEditOutsideHandler(e: MouseEvent) {
        if (_cellEditMiniEditor && _cellEditMiniEditor.contains(e.target as Node)) return;
        _closeMiniEditorOnly();
    }

    function _bindCellEditClicks() {
        const cells = document.querySelectorAll<HTMLElement>('.pw-table__cell[data-cell]');
        _cellEditClickHandlers = [];
        for (const el of cells) {
            el.style.cursor = 'crosshair';
            el.classList.add('is-cell-editable');
            const handler = () => {
                const cellKey = el.dataset.cell as string;
                _openCellMiniEditor(el, cellKey);
            };
            el.addEventListener('click', handler);
            _cellEditClickHandlers.push({ el, handler });
        }
    }

    function _unbindCellEditClicks() {
        for (const { el, handler } of _cellEditClickHandlers) {
            el.removeEventListener('click', handler);
            el.style.cursor = '';
            el.classList.remove('is-cell-editable');
        }
        _cellEditClickHandlers = [];
    }

    function _openCellMiniEditor(cellEl: HTMLElement, cellKey: string) {
        // Remove previous editor if open (restore its cell preview)
        if (_cellEditMiniEditor) {
            if (typeof _cellEditMiniEditor._restoreCell === 'function') {
                _cellEditMiniEditor._restoreCell();
            }
            _cellEditMiniEditor._dismiss?.();
            _cellEditMiniEditor = null;
        }

        const wc = getWeekConfig();
        const existing = wc.cellTexts[cellKey] || { text: '', color: null, bold: false };

        // Snapshot for cancel/restore (visual + config)
        const originalInnerHTML = cellEl.innerHTML;
        const originalBgStyle = cellEl.style.background || '';
        const cellDataSnapshot = JSON.parse(JSON.stringify(existing));

        const designAccent = getDesignConfig().weeklyAccent || '#4A90D9';

        const restoreCell = () => {
            cellEl.innerHTML = originalInnerHTML;
            cellEl.style.background = originalBgStyle;
        };

        const _reRenderAndRebind = () => {
            render();
            _unbindCellEditClicks();
            _bindCellEditClicks();
            _cellEditMiniEditor = null;
        };

        const editor = createMiniEditor({
            anchorEl: cellEl,
            existing,
            accentColor: designAccent,
            accentTitle: t('weeklyAccentDesign'),
            placeholderKey: t('weeklyCellPlaceholder'),
            supportsVacation: true,
            vacationDisabled: true,
            vacationDisabledTitle: t('vacationNotAvailable'),
            holidayHideDisabled: true,
            holidayHideDisabledTitle: t('vacationNotAvailable'),
            formatsDisabled: getTextConfig().overrideFormats,
            formatsDisabledTitle: getTextConfig().overrideFormats ? t('miniEditorFormatsForced') : null,
            colorDisabled: getTextConfig().overrideAccent,
            colorDisabledTitle: getTextConfig().overrideAccent ? t('miniEditorAccentForced') : null,
            supportsBgColor: true,
            // Default to no background (null), NOT the accent — defaulting to the
            // accent froze it into the cell as a ghost tint on every apply.
            bgColorActive: existing.noBg ? 'NONE' : existing.bgColor || null,
            bgColorIsDefault: !existing.noBg && !existing.bgColor,
            onBgPreview(bgColor) {
                const bgHex = bgColor || null;
                cellEl.style.background = bgHex ? `color-mix(in srgb, ${bgHex} 12%, var(--planner-color-paper))` : '';
            },
            confirmTitle: t('confirmCellBtn'),
            resetTitle: t('resetFormatBtn'),
            deleteTitle: t('deleteCellBtn'),
            onPreview(raw, plain, safeColor) {
                const sc = safeColor || designAccent;
                const rawBg = editor._getBgColor!();
                const bgHex = rawBg && rawBg !== 'NONE' ? rawBg : null;
                if (plain) {
                    const colorAttr = sc ? ` style="color:${sc};"` : '';
                    cellEl.innerHTML = `<span class="pw-table__cell-text"${colorAttr}>${raw}</span>`;
                }
                cellEl.style.background = bgHex ? `color-mix(in srgb, ${bgHex} 12%, var(--planner-color-paper))` : '';
                if (!plain) {
                    cellEl.innerHTML = '';
                }
            },
            onRestore: restoreCell,
            onApply(txt, plain, color) {
                const rawBg = editor._getBgColor!();
                const isNoBg = rawBg === 'NONE';
                const bgColor = !rawBg || isNoBg ? undefined : rawBg;
                if (plain || bgColor || isNoBg) {
                    wc.cellTexts[cellKey] = {
                        text: txt || '',
                        color,
                        ...(bgColor ? { bgColor } : {}),
                        ...(isNoBg ? { noBg: true } : {}),
                    };
                } else {
                    delete wc.cellTexts[cellKey];
                }
                setWeekConfig(wc);
            },
            onClear() {
                delete wc.cellTexts[cellKey];
                setWeekConfig(wc);
                _reRenderAndRebind();
            },
            onConfirm() {
                _reRenderAndRebind();
            },
            onCancel() {
                // Revert this cell's config data to pre-edit state
                if (cellDataSnapshot.text || cellDataSnapshot.bgColor || cellDataSnapshot.noBg) {
                    wc.cellTexts[cellKey] = JSON.parse(JSON.stringify(cellDataSnapshot));
                } else {
                    delete wc.cellTexts[cellKey];
                }
                setWeekConfig(wc);
                _reRenderAndRebind();
            },
            onClose() {
                _reRenderAndRebind();
            },
        });

        _cellEditMiniEditor = editor;
        _cellEditMiniEditor._restoreCell = restoreCell;
    }

    return { enter, exit };
}
