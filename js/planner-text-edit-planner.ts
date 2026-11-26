import { createMiniEditor, type MiniEditorEl } from './planner-mini-editor.ts';
import type { CellText, CellTexts } from './planner-types.ts';
import { SECTION_SELECTOR, type SharedState } from './planner-text-edit-shared.ts';

export function createPlannerMode(shared: SharedState) {
    const { render, saveConfig, t, getPlannerConfig, setPlannerConfig, getDesignConfig, getTextConfig } = shared.deps;

    let _sectionEditMiniEditor: MiniEditorEl | null = null;
    let _sectionEditSnapshot: CellTexts | null = null;
    let _sectionEditClickHandlers: Array<{ el: HTMLElement; handler: (e?: Event) => void }> = [];

    function enter() {
        // Close orphaned mini-editor from previous render cycle
        if (_sectionEditMiniEditor) {
            _sectionEditMiniEditor._dismiss?.();
            _sectionEditMiniEditor = null;
        }
        _unbindPlannerSectionClicks();
        shared.setActiveEditStyle('planner');
        // Snapshot sectionTexts so we can revert on cancel
        const pc = getPlannerConfig();
        _sectionEditSnapshot = JSON.parse(JSON.stringify(pc.sectionTexts || {}));

        // Add crosshair cursor + click handlers to sections
        _bindPlannerSectionClicks();

        // Defer outside-click listener — see weekly mode for rationale.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.addEventListener('mousedown', _sectionEditOutsideHandler, true);
            });
        });
    }

    function exit(action: string) {
        shared.setActiveEditStyle(null);
        if (action !== 'save' && _sectionEditSnapshot !== null) {
            const pc = getPlannerConfig();
            pc.sectionTexts = _sectionEditSnapshot;
            setPlannerConfig(pc);
        }
        _sectionEditSnapshot = null;

        if (_sectionEditMiniEditor) {
            if (typeof _sectionEditMiniEditor._restoreSection === 'function') {
                _sectionEditMiniEditor._restoreSection();
            }
            _sectionEditMiniEditor._dismiss?.();
            _sectionEditMiniEditor = null;
        }

        document.removeEventListener('mousedown', _sectionEditOutsideHandler, true);
        _unbindPlannerSectionClicks();

        if (action === 'save') {
            saveConfig();
        } else {
            render();
        }
    }

    function _closeSectionMiniEditorOnly() {
        if (_sectionEditMiniEditor) {
            _sectionEditMiniEditor._confirm?.();
            _sectionEditMiniEditor = null;
        }
    }

    // Solo confirma el editor: el clic fuera del panel Textos lo resuelve el controller, que ahí cancela Textos.
    function _sectionEditOutsideHandler(e: MouseEvent) {
        if (_sectionEditMiniEditor && _sectionEditMiniEditor.contains(e.target as Node)) return;
        _closeSectionMiniEditorOnly();
    }

    function _bindPlannerSectionClicks() {
        const sections = document.querySelectorAll<HTMLElement>(SECTION_SELECTOR);
        _sectionEditClickHandlers = [];
        for (const el of sections) {
            el.style.cursor = 'crosshair';
            el.classList.add('is-section-editable');
            const handler = () => {
                const sectionKey = el.dataset.section as string;
                _openSectionMiniEditor(el, sectionKey);
            };
            el.addEventListener('click', handler);
            _sectionEditClickHandlers.push({ el, handler });
        }
    }

    function _unbindPlannerSectionClicks() {
        for (const { el, handler } of _sectionEditClickHandlers) {
            el.removeEventListener('click', handler);
            el.style.cursor = '';
            el.classList.remove('is-section-editable');
        }
        _sectionEditClickHandlers = [];
    }

    function _openSectionMiniEditor(sectionEl: HTMLElement, sectionKey: string) {
        // Remove previous editor if open
        if (_sectionEditMiniEditor) {
            if (typeof _sectionEditMiniEditor._restoreSection === 'function') {
                _sectionEditMiniEditor._restoreSection();
            }
            _sectionEditMiniEditor._dismiss?.();
            _sectionEditMiniEditor = null;
        }

        const existing = getPlannerConfig().sectionTexts[sectionKey] || { text: '', color: null };
        const sectionDataSnapshot = JSON.parse(JSON.stringify(existing));
        // getPlannerConfig da copia: setPlannerConfig es quien pasa la celda a la otra orientación (README js, 25).
        const writeSection = (cell: CellText | null) => {
            const pc = getPlannerConfig();
            if (cell) pc.sectionTexts[sectionKey] = cell;
            else delete pc.sectionTexts[sectionKey];
            setPlannerConfig(pc);
        };

        // For todo items, the text lives inside the __line child, not the __item itself
        const textTarget = sectionEl.querySelector('.p1-todo__line, .ph-todo__line') || sectionEl;
        const originalTargetHTML = textTarget.innerHTML;

        const plannerAcc = getDesignConfig().plannerAccent || '#333';
        const isTodoOrHabit = /^(todo-|habit-)/.test(sectionKey);

        const restoreSection = () => {
            textTarget.innerHTML = originalTargetHTML;
        };

        const _reRenderAndRebind = () => {
            render();
            _unbindPlannerSectionClicks();
            _bindPlannerSectionClicks();
            _sectionEditMiniEditor = null;
        };

        const editor = createMiniEditor({
            anchorEl: sectionEl,
            existing,
            accentColor: plannerAcc,
            accentTitle: t('accentColorLabel'),
            placeholderKey: t('plannerCellPlaceholder'),
            supportsLists: !isTodoOrHabit,
            supportsVacation: true,
            vacationDisabled: true,
            vacationDisabledTitle: t('vacationNotAvailable'),
            holidayHideDisabled: true,
            holidayHideDisabledTitle: t('vacationNotAvailable'),
            supportsBgColor: false,
            formatsDisabled: getTextConfig().overrideFormats,
            formatsDisabledTitle: getTextConfig().overrideFormats ? t('miniEditorFormatsForced') : null,
            colorDisabled: getTextConfig().overrideAccent,
            colorDisabledTitle: getTextConfig().overrideAccent ? t('miniEditorAccentForced') : null,
            confirmTitle: t('confirmCellBtn'),
            resetTitle: t('resetFormatBtn'),
            deleteTitle: t('deleteCellBtn'),
            onPreview(raw, plain, safeColor) {
                const sc = safeColor || '';
                const existingSpan = textTarget.querySelector('.planner-section-text');
                if (plain) {
                    const colorAttr = sc ? ` style="color:${sc};"` : '';
                    const newSpan = `<span class="planner-section-text" data-section="${sectionKey}"${colorAttr}>${raw}</span>`;
                    if (existingSpan) {
                        existingSpan.outerHTML = newSpan;
                    } else {
                        textTarget.insertAdjacentHTML('beforeend', newSpan);
                    }
                } else if (existingSpan) {
                    existingSpan.remove();
                }
            },
            onRestore: restoreSection,
            onApply(txt, plain, color) {
                writeSection(plain ? { text: txt, color } : null);
            },
            onClear() {
                writeSection(null);
                _reRenderAndRebind();
            },
            onConfirm() {
                _reRenderAndRebind();
            },
            onCancel() {
                writeSection(sectionDataSnapshot.text ? JSON.parse(JSON.stringify(sectionDataSnapshot)) : null);
                _reRenderAndRebind();
            },
            onClose() {
                _reRenderAndRebind();
                _sectionEditMiniEditor = null;
            },
        });

        _sectionEditMiniEditor = editor;
        _sectionEditMiniEditor._restoreSection = restoreSection;
    }

    return { enter, exit };
}
