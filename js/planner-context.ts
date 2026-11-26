import {
    getYear,
    getStyle,
    getWeekConfig,
    setWeekConfig,
    getPlannerConfig,
    setPlannerConfig,
    getMonthlyTexts,
    setMonthlyTexts,
    getQuarterlyTexts,
    setQuarterlyTexts,
    getQuarterConfig,
    getMonthlyCalConfig,
    getDesignConfig,
    setDesignConfig,
    getDefaultDesignConfig,
    getTextConfig,
    setTextConfig,
    getDefaultTextConfig,
    getVacationDays,
    saveVacationDays,
} from './planner-state.ts';
import { t } from './planner-i18n.ts';
import type { DesignConfig, TextConfig } from './planner-types.ts';

type AnyFn = (...args: unknown[]) => unknown;

export interface PlannerControllerHooks {
    render: AnyFn;
    showBackdrop: (onClose: () => void, panel?: HTMLElement | null) => void;
    removeBackdrop: () => void;
    closeExportModal: () => void;
    getConfigIsOpen: () => boolean;
    getCloseConfigFn: () => AnyFn | null;
    getExitTextEditFn: () => ((action?: string) => boolean) | null;
    getTextPanelIsOpen: () => boolean;
    getCloseTextPanelFn: () => AnyFn | null;
    setDesignIsOpen: (v: boolean) => void;
    setCloseDesignFn: (fn: AnyFn) => void;
    // Inyectada por el controller: importarla aquí crearía el ciclo context↔text-panel en el grafo.
    applyTextConfig: (textCfg: TextConfig, designCfg: DesignConfig) => void;
    onAfterRender: () => void;
}

/**
 * Build the planner DI context.
 */
export function createPlannerContext(hooks: PlannerControllerHooks) {
    const ctx = {
        // ── Render & UI primitives ──
        render: hooks.render,
        showBackdrop: hooks.showBackdrop,
        removeBackdrop: hooks.removeBackdrop,
        closeExportModal: hooks.closeExportModal,
        t,

        // ── State (pure getters/setters from planner-state.ts) ──
        getYear,
        getStyle,
        getWeekConfig,
        setWeekConfig,
        getPlannerConfig,
        setPlannerConfig,
        getMonthlyTexts,
        setMonthlyTexts,
        getQuarterlyTexts,
        setQuarterlyTexts,
        getQuarterConfig,
        getMonthlyCalConfig,
        getDesignConfig,
        setDesignConfig,
        getDefaultDesignConfig,
        getTextConfig,
        setTextConfig,
        getDefaultTextConfig,
        getVacationDays,
        saveVacationDays,

        // ── Controller-managed mutable refs ──
        getConfigIsOpen: hooks.getConfigIsOpen,
        getCloseConfigFn: hooks.getCloseConfigFn,
        getExitTextEditFn: hooks.getExitTextEditFn,
        getTextPanelIsOpen: hooks.getTextPanelIsOpen,
        getCloseTextPanelFn: hooks.getCloseTextPanelFn,
        setDesignIsOpen: hooks.setDesignIsOpen,
        setCloseDesignFn: hooks.setCloseDesignFn,

        // ── Cross-panel callbacks ──
        applyTextCallback: (designDraft: DesignConfig, opts?: { resetBodyFont?: boolean }) => {
            const tc = opts?.resetBodyFont ? { ...getTextConfig(), textStyle: null } : getTextConfig();
            hooks.applyTextConfig(tc, designDraft);
        },
        resetBodyFont: () => {
            setTextConfig({ ...getTextConfig(), textStyle: null });
        },
        onAfterRender: hooks.onAfterRender,
    };

    return ctx;
}

export type PlannerContext = ReturnType<typeof createPlannerContext>;
