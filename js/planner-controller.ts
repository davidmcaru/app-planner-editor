import { isMobile } from '@core/breakpoint/get-bp.ts';
import { IS_FULL } from './planner-mode.ts';
import { initPanelSheet } from '@widgets/panel-sheet/panel-sheet.ts';
import { enhanceCollapsibleSections } from '@widgets/collapsible-section/collapsible-section.ts';
import { setFlipToggle } from '@widgets/flip-toggle/flip-toggle.ts';
import { markPageReady } from '@core/page-fade/page-fade.ts';
import {
    initState,
    getYear,
    getStyle,
    setWeek,
    getWeekConfig,
    setWeekConfig,
    getPlannerConfig,
    setPlannerConfig,
    getDesignConfig,
    setDesignConfig,
    getDefaultDesignConfig,
    getTextConfig,
    setTextConfig,
    getDefaultTextConfig,
    getVacationDays,
    saveVacationDays,
    getMonthlyTexts,
    setMonthlyTexts,
    getQuarterlyTexts,
    setQuarterlyTexts,
    beginPlannerTextEdit,
    endPlannerTextEdit,
    onMonthChange,
    onStyleChange,
} from './planner-state.ts';
import { initExportModal } from './planner-export-modal.ts';
import { $id, announceSr, showBackdrop, removeBackdrop } from './planner-dom.ts';
import { render, setDraftDesignProvider } from './planner-render.ts';
import { initGlobalKeys, initMobilePanelGuards } from './planner-events.ts';
import { initLang, applyI18n, t, getLegacyLang } from './planner-i18n.ts';
import { initConfigPanel } from './planner-config-panel.ts';
import { initDesignPanel, applyDesignConfig } from './planner-design-panel.ts';
import { applyTextConfig, initTextPanel as initTextPanelModule } from './planner-text-panel.ts';
import { initTextsLang } from './planner-translation.ts';
import { initLangToggle, isTranslating, syncTranslateMine } from './planner-toolbar-i18n.ts';
import { followSiteLang } from './planner-site-lang.ts';
import { createPlannerContext } from './planner-context.ts';
import { panelStore } from './planner-panel-store.ts';
import { commitHistory } from './planner-persist.ts';
import { PlannerHistory, onHistoryChange } from './planner-history.ts';
import { initSavedUi } from './planner-saved-ui.ts';
import { resetCellEditorPen } from './planner-mini-editor.ts';
import { showToast } from './planner-toasts.ts';
import type { BoldMode, CellTexts, PlannerStyle, TextConfig } from './planner-types.ts';

/**
 * Sincroniza `aria-expanded` de los botones del toolbar con el estado de
 * panelStore y anuncia el modo crosshair cuando se abre el panel
 * de Textos.
 */
function _syncToolbarAria(snapshot: ReturnType<typeof panelStore.snapshot>) {
    const map = {
        design: 'designBtn',
        text: 'textToggle',
        config: 'configBtn',
        temas: 'btnTemas',
        mas: 'btnMas',
        saved: 'btnGuardados',
    };
    for (const [panel, btnId] of Object.entries(map) as Array<[keyof ReturnType<typeof panelStore.snapshot>, string]>) {
        const btn = document.getElementById(btnId);
        if (btn) btn.setAttribute('aria-expanded', snapshot[panel] ? 'true' : 'false');
    }
    // Crosshair mode = text panel abierto (activa cell editing)
    if (snapshot.text) {
        announceSr(t('crosshairModeActive') || 'Add mode active.');
    } else {
        announceSr('');
    }
}
panelStore.onChange(_syncToolbarAria);

// `inert` botón a botón y no en la barra: con la barra inerte el clic la atraviesa y el «clic fuera» cancela Textos.
function _syncToolbarBlocked(snapshot: ReturnType<typeof panelStore.snapshot>) {
    const toolbar = $id('plannerToolbar');
    if (!toolbar) return;
    toolbar.classList.toggle('is-blocked', snapshot.text);
    for (const btn of toolbar.querySelectorAll<HTMLElement>('.edt-toolbar__btn')) btn.inert = snapshot.text;
}
panelStore.onChange(_syncToolbarBlocked);

// ── TOOLBAR — style buttons + lang + export + config trigger ──

// Panel open/close state lives in panelStore (no more loose flags)
type EnterModeFn = () => void;
let _enterWeeklyCellEditMode: EnterModeFn | null = null;
let _enterPlannerTextEditMode: EnterModeFn | null = null;
let _enterMonthlyCellEditMode: EnterModeFn | null = null;
let _enterQuarterlyCellEditMode: EnterModeFn | null = null;
let _exitTextEditFn: ((action?: string) => boolean) | null = null; // exitCurrentMode (set by setupConfigPanel)

// The export modal is now owned by planner-export-modal.ts. The
// reference is set during setupToolbar(); closeExportModal() delegates to it
// and the controller still exposes the wrapper because _ctx and other
// scopes (setupConfigPanel, setupTextPanel) call it.
let _exportModal: ReturnType<typeof initExportModal> | null = null;

function closeExportModal() {
    _exportModal?.close();
}

function setupToolbar() {
    const textToggle = document.getElementById('textToggle');

    // Export modal extracted to planner-export-modal.ts
    _exportModal = initExportModal({
        getExitTextEditFn: () => _exitTextEditFn,
        // Con Textos abierto no: render() le quitaría la edición de celdas, y su cierre ya repinta.
        repaint: () => {
            if (!panelStore.isOpen('text')) render();
        },
    });

    // ── Textos button (opens/closes text panel + embedded cell editing) ──
    if (textToggle) {
        textToggle.addEventListener('click', () => {
            // Close config/design panels if open
            panelStore.closeIfOpen('config');
            panelStore.closeIfOpen('design');

            // Toggle text panel (cell editing is managed by open/close)
            if (panelStore.isOpen('text')) {
                panelStore.closeIfOpen('text');
            } else {
                const opener = panelStore.getOpener('text');
                if (opener) opener();
            }
        });
    }

    // ── Temas: los 16 temas de color (la vista se elige en Config) ──
    setupTemasPanel();
    setupMasPanel();
    setupHistoryButtons();

    onStyleChange(() => {
        if (getStyle() === 'weekly') setWeek(1);
        render();
        window.scrollTo({ top: 0, behavior: 'instant' });
        // Refresh modal contents if it's currently open
        _exportModal?.update();
    });
}

// closeAll ANTES de deshacer: los drafts de panel abiertos revierten con su propio Cancelar
// y el undo aplica sobre estado ya coherente (los closers del store SON el Cancelar).
function setupHistoryButtons() {
    const guarded = () => isTranslating() || !!document.querySelector('.edt-dlg-overlay');
    const doUndo = () => {
        if (guarded()) return;
        panelStore.closeAll();
        PlannerHistory.undo();
    };
    const doRedo = () => {
        if (guarded()) return;
        panelStore.closeAll();
        PlannerHistory.redo();
    };
    $id('btnUndo')?.addEventListener('click', doUndo);
    $id('btnRedo')?.addEventListener('click', doRedo);
}

function setupTemasPanel() {
    const btn = $id('btnTemas');
    const panel = $id('temasPanel');
    if (!btn || !panel) return;

    function openTemas() {
        panelStore.setOpen('temas', true);
        if (_beginTemas) _beginTemas();
        if (_buildTemas) _buildTemas();
        panel!.hidden = false;
        showBackdrop(cancelTemas, panel);
    }
    function ocultarTemas() {
        panelStore.setOpen('temas', false);
        panel!.hidden = true;
        removeBackdrop();
    }
    // El cierre estructural (abrir otro panel, clic fuera) equivale a Cancelar, como en el resto.
    function cancelTemas() {
        if (_rollbackTemas) _rollbackTemas();
        ocultarTemas();
    }
    function saveTemas() {
        if (_commitTemas) _commitTemas();
        ocultarTemas();
    }
    panelStore.setCloser('temas', cancelTemas);
    panelStore.setOpener('temas', openTemas);

    btn.addEventListener('click', () => {
        if (panelStore.isOpen('temas')) cancelTemas();
        else openTemas();
    });
    $id('temasCancel')?.addEventListener('click', cancelTemas);
    $id('temasSave')?.addEventListener('click', saveTemas);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelStore.isOpen('temas')) cancelTemas();
    });
}

function setupMasPanel() {
    const btn = $id('btnMas');
    const panel = $id('masPanel');
    if (!btn || !panel) return;

    function openMas() {
        syncTranslateMine();
        panelStore.setOpen('mas', true);
        panel!.hidden = false;
        showBackdrop(closeMas);
    }
    function closeMas() {
        panelStore.setOpen('mas', false);
        panel!.hidden = true;
        removeBackdrop();
    }
    panelStore.setCloser('mas', closeMas);
    panelStore.setOpener('mas', openMas);

    btn.addEventListener('click', () => {
        if (panelStore.isOpen('mas')) closeMas();
        else openMas();
    });

    // `pointerdown`, no `click`: en el mismo gesto que ABRE el sheet este handler corre antes de
    // que el store diga «abierto», así que no se cierra solo.
    document.addEventListener('pointerdown', (e) => {
        if (!panelStore.isOpen('mas')) return;
        const objetivo = e.target as Node;
        if (panel!.contains(objetivo) || btn!.contains(objetivo)) return;
        closeMas();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelStore.isOpen('mas')) closeMas();
    });

    const textosRow = $id('masTextosRow');
    if (textosRow && IS_FULL) textosRow.classList.remove('planner-mas__row--desktop-only');
    textosRow?.addEventListener('click', () => {
        if (!IS_FULL) {
            showToast(t('lblDesktopOnly'), 'info', 4000);
            return;
        }
        closeMas();
        $id('textToggle')?.click();
    });
    // Traducir, Diseño y Descargar van por click sintético a su botón de la barra: en móvil está oculto
    // (`--desk`), pero es donde vive su lógica y `design` no tiene opener registrado en el store.
    $id('masTraducirRow')?.addEventListener('click', () => {
        closeMas();
        $id('translateMineBtn')?.click();
    });
    $id('masDisenoRow')?.addEventListener('click', () => {
        closeMas();
        $id('designBtn')?.click();
    });
    $id('masDescargarRow')?.addEventListener('click', () => {
        closeMas();
        $id('exportBtn')?.click();
    });
}

// ── LANG TOGGLE & TOOLBAR i18n Implementation lives in planner-toolbar-i18n.ts ──

function setupLangToggle() {
    initLangToggle({ render });
    initTextsLang(getLegacyLang());
    followSiteLang();
    // Antes de PlannerHistory.init(): su primer aviso es el que pinta la acción al arrancar.
    onHistoryChange(syncTranslateMine);
}

// ── CONFIG PANEL — opens from "Diseño" button Monthly: nav mes/año (cancel reverts to original month) Weekly: day pills + hour inputs (6-10 rows, add/remove closes panel) ──

function setupConfigPanel() {
    // Body extracted to planner-config-panel.ts.
    const result = initConfigPanel({
        render,
        showBackdrop,
        removeBackdrop,
        closeExportModal,
        panelStore,
        $id,
        ctx: _ctx,
    });
    if (!result) return;
    panelStore.setCloser('config', result.closeConfig);
    _enterWeeklyCellEditMode = result.enterWeeklyCellEditMode;
    _enterPlannerTextEditMode = result.enterPlannerTextEditMode;
    _enterMonthlyCellEditMode = result.enterMonthlyCellEditMode;
    _enterQuarterlyCellEditMode = result.enterQuarterlyCellEditMode;
    _exitTextEditFn = result.exitTextEditFn;
}

// ── DESIGN PANEL — Delegated to planner-design-panel.ts (Phase 4) ──

// El panel Temas lo pinta el módulo de Diseño: la rejilla y su lógica de tema siguen ahí,
// solo se mudó el contenedor.
let _buildTemas: (() => void) | null = null;
let _beginTemas: (() => void) | null = null;
let _commitTemas: (() => void) | null = null;
let _rollbackTemas: (() => void) | null = null;

function setupDesignPanel() {
    // Contexto DI unificado.
    const result = initDesignPanel(_ctx);
    if (result) {
        panelStore.setCloser('design', result.closeDesign);
        setDraftDesignProvider(result.getDraftDesign || null);
        _buildTemas = result.buildThemes || null;
        _beginTemas = result.beginTemas || null;
        _commitTemas = result.commitTemas || null;
        _rollbackTemas = result.rollbackTemas || null;
    }
}

// ── TEXT PANEL — User-added text appearance (accent, color, size, font) ──

function setupTextPanel() {
    const textPanel = document.getElementById('textPanel');
    const saveBtn = document.getElementById('textSave');
    const cancelBtn = document.getElementById('textCancel');

    if (!textPanel) return;
    textPanel.tabIndex = -1;

    // Init text panel module (typography: title size/bold/font + text size/font)
    // Contexto DI unificado, con override de onAfterRender porque
    // _activateCellEditing es local a esta función.
    const textPanelApi = initTextPanelModule({
        ..._ctx,
        onAfterRender() {
            _activateCellEditing();
        },
    });

    type ContentSnapshot = {
        style: PlannerStyle;
        cellTexts?: CellTexts;
        sectionTexts?: CellTexts;
        monthlyTexts?: CellTexts;
        quarterlyTexts?: CellTexts;
        vacationByYear?: Record<string, string[]>;
    };
    type OverrideToggles = {
        overrideFormats?: boolean;
        overrideAccent?: boolean;
        overrideLibres?: boolean;
        overrideFestivos?: boolean;
    };
    let _savedText: TextConfig | null = null;
    let _savedTitle: {
        titleSize: number;
        boldTitle: BoldMode;
        textStyle: string | null;
    } | null = null;
    let _savedToggles: OverrideToggles | null = null;
    let _savedContent: ContentSnapshot | null = null;
    let _preClearSnapshot: { content: ContentSnapshot; toggles: OverrideToggles } | null = null;

    function _snapshotContent(): ContentSnapshot {
        const style = getStyle();
        const snap: ContentSnapshot = { style };
        if (style === 'weekly') {
            snap.cellTexts = JSON.parse(JSON.stringify(getWeekConfig().cellTexts || {}));
        } else if (style === 'planner') {
            snap.sectionTexts = JSON.parse(JSON.stringify(getPlannerConfig().sectionTexts || {}));
        } else if (style === 'monthly') {
            snap.monthlyTexts = JSON.parse(JSON.stringify(getMonthlyTexts()));
            snap.vacationByYear = _vacationWindow();
        } else if (style === 'quarterly') {
            snap.quarterlyTexts = JSON.parse(JSON.stringify(getQuarterlyTexts()));
            snap.vacationByYear = _vacationWindow();
        }
        return snap;
    }

    // Año±1, no solo el visible: las celdas overflow de mensual editan días del año vecino
    // y el Cancelar debe revertirlos también.
    function _vacationWindow(): Record<string, string[]> {
        const out: Record<string, string[]> = {};
        for (const y of [getYear() - 1, getYear(), getYear() + 1]) out[String(y)] = [...getVacationDays(y)];
        return out;
    }

    function _restoreVacationWindow(win: Record<string, string[]> | undefined) {
        if (!win) return;
        Object.entries(win).forEach(([y, days]) => saveVacationDays(Number(y), new Set(days)));
    }

    function _restoreContentFromSnapshot(snap: ContentSnapshot | null) {
        if (!snap) return;
        if (snap.style === 'weekly' && snap.cellTexts !== undefined) {
            const wc = getWeekConfig();
            wc.cellTexts = snap.cellTexts;
            setWeekConfig(wc);
        } else if (snap.style === 'planner' && snap.sectionTexts !== undefined) {
            const pc = getPlannerConfig();
            pc.sectionTexts = snap.sectionTexts;
            setPlannerConfig(pc);
        } else if (snap.style === 'monthly') {
            if (snap.monthlyTexts !== undefined) setMonthlyTexts(snap.monthlyTexts);
            _restoreVacationWindow(snap.vacationByYear);
        } else if (snap.style === 'quarterly') {
            if (snap.quarterlyTexts !== undefined) setQuarterlyTexts(snap.quarterlyTexts);
            _restoreVacationWindow(snap.vacationByYear);
        }
    }

    function openText() {
        resetCellEditorPen();
        panelStore.closeIfOpen('config');
        panelStore.closeIfOpen('design');
        closeExportModal();
        panelStore.setOpen('text', true);
        // Restaurar solo deshace el Limpiar de ESTA sesión: tras Guardar, el snapshot viejo resucitaría lo confirmado.
        _preClearSnapshot = null;
        const restoreBtn = document.getElementById('contentRestoreBtn') as HTMLButtonElement | null;
        if (restoreBtn) restoreBtn.disabled = true;
        _savedText = JSON.parse(JSON.stringify(getTextConfig()));
        _savedTitle = {
            titleSize: getDesignConfig().titleSize,
            boldTitle: getDesignConfig().boldTitle,
            textStyle: getDesignConfig().textStyle,
        };
        _savedToggles = {
            overrideFormats: getTextConfig().overrideFormats,
            overrideAccent: getTextConfig().overrideAccent,
            overrideLibres: getTextConfig().overrideLibres,
            overrideFestivos: getTextConfig().overrideFestivos,
        };
        _savedContent = _snapshotContent();
        // Antes de la primera escritura: el organizador decide con esto qué celdas de la otra orientación siguen a esta.
        beginPlannerTextEdit();
        const draft = JSON.parse(JSON.stringify(getTextConfig()));
        const titleDraft = {
            titleSize: getDesignConfig().titleSize,
            boldTitle: getDesignConfig().boldTitle,
            textStyle: getDesignConfig().textStyle,
        };
        textPanelApi.setDraft(draft);
        textPanelApi.setTitleDraft(titleDraft);
        textPanelApi.buildPanel();
        textPanel!.hidden = false;
        // La barra se vuelve `inert` (_syncToolbarBlocked) y le quita el foco a #textToggle: sin esto cae a <body>.
        textPanel!.focus({ preventScroll: true });
        updateToggleVisuals();
        _activateCellEditing();
    }

    // Solo si el foco se iba a perder con el panel: un clic fuera ya lo ha llevado a su sitio.
    function _hidePanelKeepingFocus() {
        const activo = document.activeElement;
        const perdido = !activo || activo === document.body || textPanel!.contains(activo);
        textPanel!.hidden = true;
        if (perdido) document.getElementById('textToggle')?.focus({ preventScroll: true });
    }

    function _activateCellEditing() {
        const style = getStyle();
        if (style === 'planner' && _enterPlannerTextEditMode) _enterPlannerTextEditMode();
        else if (style === 'weekly' && _enterWeeklyCellEditMode) _enterWeeklyCellEditMode();
        else if (style === 'monthly' && _enterMonthlyCellEditMode) _enterMonthlyCellEditMode();
        else if (style === 'quarterly' && _enterQuarterlyCellEditMode) _enterQuarterlyCellEditMode();
    }

    // La barra NO se suelta aquí: Limpiar y Restaurar salen por esta vía con Textos aún abierto.
    function _deactivateCellEditing(action?: string) {
        if (_exitTextEditFn) _exitTextEditFn(action);
    }

    function closeText() {
        // Deactivate cell editing (revert cell changes)
        _deactivateCellEditing('cancel');
        resetCellEditorPen();
        // Revert typography
        if (_savedText) {
            setTextConfig(_savedText);
            applyTextConfig(getTextConfig(), getDesignConfig());
        }
        if (_savedTitle) {
            const dc = { ...getDesignConfig(), ..._savedTitle };
            setDesignConfig(dc);
            applyDesignConfig(dc);
        }
        // Restore content to the state when the panel was opened
        if (_savedContent) {
            _restoreContentFromSnapshot(_savedContent);
        }
        endPlannerTextEdit();
        panelStore.setOpen('text', false);
        _savedText = null;
        _savedTitle = null;
        _savedToggles = null;
        _savedContent = null;
        _preClearSnapshot = null;
        textPanelApi.clearDraft();
        _hidePanelKeepingFocus();
        render();
    }

    function saveText() {
        // Deactivate cell editing (keep cell changes)
        _deactivateCellEditing('save');
        resetCellEditorPen();
        endPlannerTextEdit();
        // Persist text draft
        const draft = textPanelApi.getDraft();
        if (draft) setTextConfig(draft);
        // Persist title draft to designConfig
        const titleDraft = textPanelApi.getTitleDraft();
        if (titleDraft) {
            const dc = { ...getDesignConfig(), ...titleDraft };
            setDesignConfig(dc);
            applyDesignConfig(dc);
        }
        _savedText = null;
        _savedTitle = null;
        _savedToggles = null;
        _savedContent = null;
        panelStore.setOpen('text', false);
        textPanelApi.clearDraft();
        _hidePanelKeepingFocus();
        render();
        commitHistory();
    }

    // Un reset por sección: el de «Tamaño y tipografía» llama a los dos de abajo
    // y el de «Contenido» solo toca los interruptores. El panel ya no lleva reset global.
    function resetTitleSection() {
        const defaultDesign = getDefaultDesignConfig();
        const dc = getDesignConfig();
        dc.titleSize = defaultDesign.titleSize;
        dc.boldTitle = defaultDesign.boldTitle;
        dc.textStyle = defaultDesign.textStyle;
        setDesignConfig(dc);
        applyDesignConfig(dc);
        const titleDraft = textPanelApi.getTitleDraft();
        if (titleDraft) {
            titleDraft.titleSize = defaultDesign.titleSize;
            titleDraft.boldTitle = defaultDesign.boldTitle;
            titleDraft.textStyle = defaultDesign.textStyle;
        }
        applyTextConfig(getTextConfig(), dc);
        textPanelApi.buildPanel();
        render();
        _activateCellEditing();
    }

    function resetBodySection() {
        const defaultText = getDefaultTextConfig();
        const tc = getTextConfig();
        tc.textSize = defaultText.textSize;
        tc.boldText = defaultText.boldText;
        tc.textStyle = defaultText.textStyle;
        setTextConfig(tc);
        const draft = textPanelApi.getDraft();
        if (draft) {
            draft.textSize = defaultText.textSize;
            draft.boldText = defaultText.boldText;
            draft.textStyle = defaultText.textStyle;
        }
        applyTextConfig(tc, getDesignConfig());
        textPanelApi.buildPanel();
        render();
        _activateCellEditing();
    }

    // Solo los cuatro interruptores: es lo que el reset del panel cubría y ninguna sección
    // reclamaba.
    function resetOverrides() {
        const tc = getTextConfig();
        tc.overrideFormats = false;
        tc.overrideAccent = false;
        tc.overrideLibres = false;
        tc.overrideFestivos = false;
        setTextConfig(tc);
        const draft = textPanelApi.getDraft();
        if (draft) {
            draft.overrideFormats = false;
            draft.overrideAccent = false;
            draft.overrideLibres = false;
            draft.overrideFestivos = false;
        }
        updateToggleVisuals();
        render();
        _activateCellEditing();
    }

    function restoreText() {
        // Restore content to pre-clear snapshot (if Limpiar was used)
        _deactivateCellEditing('cancel');
        if (_preClearSnapshot) {
            if (_preClearSnapshot.toggles) {
                const tc = getTextConfig();
                Object.assign(tc, _preClearSnapshot.toggles);
                setTextConfig(tc);
                const draft = textPanelApi.getDraft();
                if (draft) Object.assign(draft, _preClearSnapshot.toggles);
            }
            if (_preClearSnapshot.content) {
                _restoreContentFromSnapshot(JSON.parse(JSON.stringify(_preClearSnapshot.content)));
            }
            _preClearSnapshot = null;
            const contentRestoreBtn = document.getElementById('contentRestoreBtn') as HTMLButtonElement | null;
            if (contentRestoreBtn) contentRestoreBtn.disabled = true;
        }
        updateToggleVisuals();
        render();
        _activateCellEditing();
    }

    function clearContent() {
        // Snapshot current state so Restaurar can undo this clear
        _deactivateCellEditing('cancel');
        _preClearSnapshot = {
            content: _snapshotContent(),
            toggles: {
                overrideFormats: getTextConfig().overrideFormats,
                overrideAccent: getTextConfig().overrideAccent,
                overrideLibres: getTextConfig().overrideLibres,
                overrideFestivos: getTextConfig().overrideFestivos,
            },
        };
        const contentRestoreBtn = document.getElementById('contentRestoreBtn') as HTMLButtonElement | null;
        if (contentRestoreBtn) contentRestoreBtn.disabled = false;
        const style = getStyle();
        if (style === 'weekly') {
            const wc = getWeekConfig();
            wc.cellTexts = {};
            setWeekConfig(wc);
        } else if (style === 'planner') {
            const pc = getPlannerConfig();
            pc.sectionTexts = {};
            setPlannerConfig(pc);
        } else if (style === 'monthly') {
            setMonthlyTexts({});
            saveVacationDays(getYear(), new Set());
        } else if (style === 'quarterly') {
            setQuarterlyTexts({});
            saveVacationDays(getYear(), new Set());
        }
        render();
        _activateCellEditing();
    }

    panelStore.setCloser('text', closeText);
    panelStore.setOpener('text', openText);

    if (saveBtn) saveBtn.addEventListener('click', saveText);
    if (cancelBtn) cancelBtn.addEventListener('click', closeText);
    // Títulos y textos comparten sección: un solo restablecer para las dos mitades.
    document.getElementById('textTypoReset')?.addEventListener('click', () => {
        resetTitleSection();
        resetBodySection();
    });
    document.getElementById('textOverridesReset')?.addEventListener('click', resetOverrides);

    // ── Content clear + restore buttons ──
    const contentClearBtn = document.getElementById('contentClearBtn') as HTMLButtonElement | null;
    const contentRestoreBtn = document.getElementById('contentRestoreBtn') as HTMLButtonElement | null;
    if (contentRestoreBtn) contentRestoreBtn.disabled = true;
    if (contentClearBtn) contentClearBtn.addEventListener('click', clearContent);
    if (contentRestoreBtn) contentRestoreBtn.addEventListener('click', restoreText);

    // ── Override toggle buttons ──
    const toggleFormatsBtn = document.getElementById('toggleFormatsBtn');
    const toggleAccentBtn = document.getElementById('toggleAccentBtn');
    const toggleLibresBtn = document.getElementById('toggleLibresBtn') as HTMLButtonElement | null;
    const toggleFestivosBtn = document.getElementById('toggleFestivosBtn') as HTMLButtonElement | null;

    function updateToggleVisuals() {
        const tc = getTextConfig();
        // Único escritor de su is-active y aria-pressed: deshacer o cargar un guardado se ven aquí al reabrir.
        if (toggleFormatsBtn) setFlipToggle(toggleFormatsBtn, !!tc.overrideFormats);
        if (toggleAccentBtn) setFlipToggle(toggleAccentBtn, !!tc.overrideAccent);
        if (toggleLibresBtn) setFlipToggle(toggleLibresBtn, !!tc.overrideLibres);
        if (toggleFestivosBtn) setFlipToggle(toggleFestivosBtn, !!tc.overrideFestivos);

        // Libres/Festivos only relevant for calendar views
        const style = getStyle();
        const isCalendar = style === 'monthly' || style === 'quarterly';
        if (toggleLibresBtn) toggleLibresBtn.disabled = !isCalendar;
        if (toggleFestivosBtn) toggleFestivosBtn.disabled = !isCalendar;
        _syncClearLabel(isCalendar);
    }

    // Se cambia la CLAVE data-i18n y no solo el texto: si no, el siguiente applyI18n devolvería «Limpiar».
    function _syncClearLabel(todo: boolean) {
        if (!contentClearBtn) return;
        const titleKey = todo ? 'contentClearAllTooltip' : 'contentClearTooltip';
        contentClearBtn.setAttribute('data-i18n-title', titleKey);
        contentClearBtn.title = t(titleKey);
        const label = contentClearBtn.querySelector<HTMLElement>('span[data-i18n]');
        if (!label) return;
        const labelKey = todo ? 'contentClearAllLabel' : 'contentClearLabel';
        label.setAttribute('data-i18n', labelKey);
        label.textContent = t(labelKey);
    }

    function handleToggle(key: 'overrideFormats' | 'overrideAccent' | 'overrideLibres' | 'overrideFestivos') {
        const tc = getTextConfig();
        tc[key] = !tc[key];
        setTextConfig(tc);
        // Sync into text panel draft so save/cancel are coherent
        const draft = textPanelApi.getDraft();
        if (draft) draft[key] = tc[key];
        updateToggleVisuals();
        render();
        _activateCellEditing();
    }

    if (toggleFormatsBtn) toggleFormatsBtn.addEventListener('click', () => handleToggle('overrideFormats'));
    if (toggleAccentBtn) toggleAccentBtn.addEventListener('click', () => handleToggle('overrideAccent'));
    if (toggleLibresBtn) toggleLibresBtn.addEventListener('click', () => handleToggle('overrideLibres'));
    if (toggleFestivosBtn) toggleFestivosBtn.addEventListener('click', () => handleToggle('overrideFestivos'));

    updateToggleVisuals();
    onStyleChange(updateToggleVisuals);

    // ── Outside click: capture phase pre-check for mini editor ──
    let _hadMiniEditorOnMousedown = false;
    document.addEventListener(
        'mousedown',
        () => {
            _hadMiniEditorOnMousedown = !!document.querySelector('.planner-cell-editor');
        },
        true
    );

    document.addEventListener('mousedown', (e) => {
        if (!panelStore.isOpen('text')) return;
        const inPanel = textPanel!.contains(e.target as Node);
        const inToolbar = $id('plannerToolbar')?.contains(e.target as Node);
        const objetivo = e.target as HTMLElement | null;
        const inCell = objetivo?.closest('.is-cell-editable, .is-section-editable');
        const inMiniEditor = objetivo?.closest('.planner-cell-editor');
        if (inPanel || inToolbar || inCell || inMiniEditor) return;
        // If a mini editor was open, the text-edit handler already confirmed it.
        // Don't close the text panel — just let the mini editor close.
        if (_hadMiniEditorOnMousedown) return;
        // No mini editor open → close text panel (cancel)
        closeText();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelStore.isOpen('text')) closeText();
    });
}

// ── INIT ──

/**
 * Single DI context shared by setupTextPanel, setupDesignPanel and initTextEdit.
 * . Keeps mutable controller state accessible
 * via getter closures so refactors hacia un Store sean triviales.
 */
const _ctx = createPlannerContext({
    render,
    applyTextConfig,
    showBackdrop,
    removeBackdrop,
    closeExportModal,
    getConfigIsOpen: () => panelStore.isOpen('config'),
    getCloseConfigFn: () => panelStore.getCloser('config'),
    getExitTextEditFn: () => _exitTextEditFn,
    getTextPanelIsOpen: () => panelStore.isOpen('text'),
    getCloseTextPanelFn: () => panelStore.getCloser('text'),
    setDesignIsOpen: (v) => {
        panelStore.setOpen('design', v);
    },
    setCloseDesignFn: (fn) => {
        panelStore.setCloser('design', fn);
    },
    // _activateCellEditing is local to setupTextPanel; overridden there.
    onAfterRender: () => {},
});

document.addEventListener('DOMContentLoaded', () => {
    // 1 · Estado e idioma
    initLang();
    initState();

    // 2 · Primer render del folio
    render();

    // 3 · Chrome: toolbar, paneles y toggle de idioma
    setupToolbar();
    setupLangToggle();
    setupConfigPanel();
    setupDesignPanel();
    setupTextPanel();
    initSavedUi();
    applyTextConfig(getTextConfig(), getDesignConfig());
    applyI18n();

    initPanelSheet({
        panelIds: ['configPanel', 'designPanel', 'textPanel', 'temasPanel', 'masPanel', 'savedPanel'],
        isOpen: (p) => !p.hidden,
        subscribe: (cb) => panelStore.onChange(cb),
        isMobile,
        handleLabel: () => t('ariaSheetHandle'),
        pinnedTop: '.planner-config__header',
        pinnedBottom: '.planner-config__footer',
        // `__scroll` envuelve TODO lo scrolleable de los seis paneles —incluidos los varios
        // `__body` de Config, uno por vista—, así que el motor lo reutiliza en vez de fabricar
        // su `.edt-sheet__body`. Si algo scrolleable se sale de él, en móvil queda bajo el footer.
        ownScroller: '.planner-config__scroll',
    });

    // 4 · Reactividad de navegación + atajos + guardas móviles
    onMonthChange(() => {
        if (getStyle() === 'weekly') setWeek(1);
        render();
    });

    enhanceCollapsibleSections();
    initGlobalKeys();
    initMobilePanelGuards();

    // Línea base del historial al FINAL del arranque: el primer Ctrl+Z no debe
    // revertir pasos intermedios del propio init.
    PlannerHistory.init();

    // 5 · Revelado.
    // El retardo de 120 ms es del planner; lo que aporta el compartido es la red de seguridad:
    // si este init falla antes de aquí, page-fade revela igual a los 2 s en vez de dejar la
    // página invisible para siempre.
    requestAnimationFrame(() => {
        setTimeout(markPageReady, 120);
    });
});
