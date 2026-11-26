import { getWeeksInMonth } from './planner-core.ts';
import {
    getYear,
    getMonth,
    getStyle,
    getWeek,
    setWeek,
    getWeekConfig,
    getQuarter,
    getQuarterConfig,
    getPlannerConfig,
    getMonthlyCalConfig,
    getHolidaysConfig,
    getDesignConfig,
    getTextConfig,
    getVacationDays,
    getMonthlyTexts,
    getQuarterlyTexts,
} from './planner-state.ts';
import {
    renderPlannerView,
    renderMonthlyCombinedView,
    renderPlannerHorizontalView,
    renderWeeklyView,
    renderQuarterlyView,
    updateSidebarMonth,
    updateSidebarTexts,
    ensurePageSlots,
} from './planner-ui.ts';
import type { DesignConfig, PlannerRenderConfig, PlannerStyle } from './planner-types.ts';

// Mientras el panel de Diseño está abierto, el render pinta su DRAFT en vivo; el panel
// registra aquí su proveedor al montarse (lo desregistra cerrando: devuelve null).
let _getDraftDesignFn: (() => DesignConfig | null) | null = null;

export function setDraftDesignProvider(fn: (() => DesignConfig | null) | null) {
    _getDraftDesignFn = fn;
}

export function render() {
    const year = getYear();
    const month = getMonth();
    const style = getStyle();
    const designDraft = _getDraftDesignFn ? _getDraftDesignFn() : null;
    const effectiveDesign = designDraft || getDesignConfig();
    const tc = getTextConfig();

    if (style === 'weekly') {
        ensurePageSlots(1, 'weekly');
        const maxWeeks = getWeeksInMonth(year, month);
        let week = getWeek();
        if (week > maxWeeks) {
            week = 1;
            setWeek(week);
        }
        renderWeeklyView(year, month, week, {
            ...getWeekConfig(),
            accentColor: effectiveDesign.weeklyAccent,
            forceAccent: tc.overrideAccent,
            overrideFormats: tc.overrideFormats,
            overrideLibres: tc.overrideLibres,
            overrideFestivos: tc.overrideFestivos,
        });
    } else if (style === 'quarterly') {
        ensurePageSlots(1, 'quarterly');
        renderQuarterlyView(year, getQuarter(), buildQuarterlyRenderConfig(effectiveDesign));
    } else if (style === 'monthly') {
        // New monthly calendar (combined A4h)
        ensurePageSlots(1, 'monthly');
        renderMonthlyCombinedView(year, month, buildMonthlyRenderConfig(effectiveDesign));
    } else {
        // 'planner' (default) — organizer page (1 visible page)
        const pConfig: PlannerRenderConfig = getPlannerConfig();
        pConfig.accentColor = effectiveDesign.plannerAccent || null;
        pConfig.forceAccent = tc.overrideAccent;
        pConfig.overrideFormats = tc.overrideFormats;
        if (pConfig.orientation === 'horizontal') {
            ensurePageSlots(1, 'planner-h');
            renderPlannerHorizontalView(year, month, pConfig);
        } else {
            ensurePageSlots(1, 'planner');
            renderPlannerView(year, month, pConfig);
        }
    }

    updateSidebarMonth(year);
    updateSidebarTexts();
    _updatePrintPageSize(style);
}

// El único @page estático era «A5 portrait» para TODO: imprimir con Ctrl+P cualquier vista
// apaisada (4 de 5) la metía en un pliego A5 vertical. CSS no sabe condicionar @page
// por clase, así que la regla vigente la inyecta el render según la vista activa.
function _updatePrintPageSize(style: PlannerStyle) {
    const a5 = style === 'planner' && getPlannerConfig().orientation !== 'horizontal';
    let tag = document.getElementById('plannerPageStyle');
    if (!tag) {
        tag = document.createElement('style');
        tag.id = 'plannerPageStyle';
        document.head.appendChild(tag);
    }
    tag.textContent = `@media print { @page { size: ${a5 ? 'A5 portrait' : 'A4 landscape'}; margin: 0; } }`;
}

// Copias de render (mutar el objeto VIVO persistia ccaa/province y los _campos). Se exportan
// porque el diffing de celda reconstruye UNA celda con exactamente esta misma config.
export function buildQuarterlyRenderConfig(effectiveDesign?: DesignConfig) {
    const design = effectiveDesign || getDesignConfig();
    const tc = getTextConfig();
    const holidays = getHolidaysConfig();
    return {
        ...getQuarterConfig(),
        ccaa: holidays.ccaa,
        province: holidays.province,
        _vacationDays: getVacationDays(getYear()),
        _quarterlyTexts: getQuarterlyTexts(),
        _accentColor: design.plannerAccent || null,
        _forceAccent: tc.overrideAccent,
        _overrideFormats: tc.overrideFormats,
        _overrideLibres: tc.overrideLibres,
        _overrideFestivos: tc.overrideFestivos,
    };
}

export function buildMonthlyRenderConfig(effectiveDesign?: DesignConfig) {
    const design = effectiveDesign || getDesignConfig();
    const tc = getTextConfig();
    const holidays = getHolidaysConfig();
    return {
        ...getMonthlyCalConfig(),
        ccaa: holidays.ccaa,
        province: holidays.province,
        _vacationDays: getVacationDays(getYear()),
        _monthlyTexts: getMonthlyTexts(),
        _accentColor: design.plannerAccent || null,
        _forceAccent: tc.overrideAccent,
        _overrideFormats: tc.overrideFormats,
        _overrideLibres: tc.overrideLibres,
        _overrideFestivos: tc.overrideFestivos,
    };
}
