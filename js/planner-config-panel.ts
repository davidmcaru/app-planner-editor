import { attachHoldRepeat } from '@features/utils/hold-repeat.ts';
import { getMonthName } from './planner-core.ts';
import {
    getYear,
    getMonth,
    getStyle,
    setStyle,
    getWeek,
    setWeek,
    getWeekConfig,
    setWeekConfig,
    getDefaultWeekConfig,
    dropWeekSlot,
    getQuarter,
    getQuarterConfig,
    setQuarterConfig,
    getDefaultQuarterConfig,
    getPlannerConfig,
    setPlannerConfig,
    getDefaultPlannerConfig,
    getPlannerOrientation,
    setPlannerOrientation,
    getPlannerA5Config,
    setPlannerA5Config,
    getDefaultPlannerA5Config,
    getPlannerA4Config,
    setPlannerA4Config,
    getDefaultPlannerA4Config,
    getMonthlyCalConfig,
    setMonthlyCalConfig,
    getDefaultMonthlyCalConfig,
    getHolidaysConfig,
    setHolidaysConfig,
    getDefaultHolidaysConfig,
    goToPrevMonth,
    goToNextMonth,
    goToPrevQuarter,
    goToNextQuarter,
    getVacationDays,
    saveVacationDays,
    setMonthYear,
} from './planner-state.ts';
import { t } from './planner-i18n.ts';
import { commitHistory } from './planner-persist.ts';
import {
    A4_HABIT_MAX,
    A4_TODO_MAX,
    A5_HABIT_MAX,
    A5_TODO_MAX,
    HABIT_MIN,
    HOUR_INCREMENT_MAX,
    HOUR_INCREMENT_MIN,
    TITLE_MAX,
    TODO_MIN,
} from './planner-sanitize.ts';
import { initTextEdit } from './planner-text-edit.ts';
import { createHolidaysSection } from './planner-config-holidays.ts';
import { hasHolidayData } from './planner-holidays.ts';
import type { PlannerContext } from './planner-context.ts';
import type { panelStore as PanelStoreT } from './planner-panel-store.ts';
import type {
    HolidaysConfig,
    MonthlyCalConfig,
    PlannerConfig,
    PlannerOrientation,
    PlannerPageConfig,
    QuarterConfig,
    WeekConfig,
    PlannerStyle,
} from './planner-types.ts';

const MIN_HOURS = 4;
const MAX_HOURS = 12;

export function initConfigPanel(deps: {
    render: () => void;
    showBackdrop: (onClose: () => void, panel?: HTMLElement | null) => void;
    removeBackdrop: () => void;
    closeExportModal: () => void;
    panelStore: typeof PanelStoreT;
    $id: (id: string) => HTMLElement | null;
    ctx: PlannerContext;
}) {
    const { render, showBackdrop, removeBackdrop, closeExportModal, panelStore, $id, ctx } = deps;
    const configBtn = document.getElementById('configBtn');
    const configPanel = document.getElementById('configPanel');
    const configTitle = document.getElementById('configTitleText');
    const configWeekly = document.getElementById('configWeekly');
    const configQuarterly = document.getElementById('configQuarterly');
    const configPlanner = document.getElementById('configPlanner');
    const configMonthlyCal = document.getElementById('configMonthlyCal');
    const configQuarterLabel = document.getElementById('configQuarterLabel');
    const configPlannerMonthLabel = document.getElementById('configPlannerMonthLabel');
    const configMonthlyCalLabel = document.getElementById('configMonthlyCalLabel');
    const prevPlannerMonth = document.getElementById('prevPlannerMonth');
    const nextPlannerMonth = document.getElementById('nextPlannerMonth');
    const prevMonthlyCal = document.getElementById('prevMonthlyCal');
    const nextMonthlyCal = document.getElementById('nextMonthlyCal');
    const prevQuarterBtn = document.getElementById('prevQuarter');
    const nextQuarterBtn = document.getElementById('nextQuarter');
    const quarterToggles = document.getElementById('quarterToggles');
    const plannerToggles = document.getElementById('plannerToggles');
    const plannerInputs = document.getElementById('plannerInputs');
    const monthlyCalToggles = document.getElementById('monthlyCalToggles');
    const holidaysSelectors = document.getElementById('holidaysSelectors');
    const configHolidays = document.getElementById('configHolidays');
    const daysPills = document.getElementById('daysPills');
    const weeklyTitleRow = document.getElementById('weeklyTitleRow');
    const hoursInputs = document.getElementById('hoursInputs');
    const saveBtn = document.getElementById('configSave');
    const cancelBtn = document.getElementById('configCancel');
    const resetBtn = document.getElementById('configReset');

    if (!configBtn || !configPanel) return;

    const viewPills = Array.from(document.querySelectorAll<HTMLElement>('#viewPills [data-style]'));
    viewPills.forEach((pill) => {
        pill.addEventListener('click', () => switchView(pill.dataset.style as PlannerStyle));
    });

    let draftConfig: WeekConfig | null = null;
    let draftQuarterConfig: QuarterConfig | null = null;
    let draftPlannerConfig: PlannerConfig | null = null;
    let draftMonthlyCalConfig: (MonthlyCalConfig & { _savedMiniLeft?: boolean }) | null = null;
    let draftHolidaysConfig: HolidaysConfig | null = null;
    const holidaysSection = createHolidaysSection({
        container: holidaysSelectors,
        render,
        getDraft: () => draftHolidaysConfig,
        showHolidaysOff: () =>
            getStyle() === 'quarterly'
                ? draftQuarterConfig?.showHolidays === false
                : draftMonthlyCalConfig?.showHolidays === false,
    });

    let _savedMonth: number | null = null; // snapshot for cancel revert
    let _savedYear: number | null = null;
    let _savedWeek: number | null = null;
    let _savedWeekConfig: WeekConfig | null = null;
    let _savedMonthlyConfig = null;
    let _savedQuarterConfig: QuarterConfig | null = null;
    let _savedPlannerConfig: PlannerConfig | null = null;
    let _savedPlannerA5Config: PlannerPageConfig | null = null;
    let _savedPlannerA4Config: PlannerPageConfig | null = null;
    let _savedPlannerOrientation: PlannerOrientation | null = null;
    let _savedMonthlyCalConfig: MonthlyCalConfig | null = null;
    let _savedHolidaysConfig: HolidaysConfig | null = null;
    let _savedVacationDays: Set<string> | null = null;
    let _savedVacationYear: number | null = null;
    let _holidaysSnapshot = null;

    function hideAllConfigBodies() {
        configWeekly!.hidden = true;
        if (configHolidays) configHolidays.hidden = true;
        if (configQuarterly) configQuarterly!.hidden = true;
        if (configPlanner) configPlanner!.hidden = true;
        if (configMonthlyCal) configMonthlyCal!.hidden = true;
    }

    // ── Open config panel ──

    function openConfig() {
        // Close design/text panel if open
        panelStore.closeIfOpen('design');
        panelStore.closeIfOpen('text');
        closeExportModal();

        const style = getStyle();
        panelStore.setOpen('config', true);

        // Save month/year snapshot for cancel
        _savedMonth = getMonth();
        _savedYear = getYear();
        _savedWeek = getWeek();

        hideAllConfigBodies();

        if (style === 'planner') {
            configTitle!.textContent = t('configTitlePlanner') || 'Config. Planner';
            if (configPlanner) configPlanner!.hidden = false;
            _savedPlannerOrientation = getPlannerOrientation();
            // Snapshot BOTH orientation configs — toggling A5/A4 inside the panel
            // (and the sectionTexts cross-copy) can mutate either one, so Cancel
            // must be able to restore both.
            _savedPlannerA5Config = JSON.parse(JSON.stringify(getPlannerA5Config()));
            _savedPlannerA4Config = JSON.parse(JSON.stringify(getPlannerA4Config()));
            _savedPlannerConfig = JSON.parse(JSON.stringify(getPlannerConfig()));
            draftPlannerConfig = JSON.parse(JSON.stringify(getPlannerConfig()));
            updateConfigPlannerMonthLabel();
            buildPlannerToggles();
            buildPlannerInputs();
        } else if (style === 'monthly') {
            configTitle!.textContent = t('configTitleMonthlyCal') || 'Config. Calendario';
            if (configMonthlyCal) configMonthlyCal!.hidden = false;
            _savedMonthlyCalConfig = JSON.parse(JSON.stringify(getMonthlyCalConfig()));
            _savedHolidaysConfig = JSON.parse(JSON.stringify(getHolidaysConfig()));
            draftMonthlyCalConfig = JSON.parse(JSON.stringify(getMonthlyCalConfig()));
            draftHolidaysConfig = JSON.parse(JSON.stringify(getHolidaysConfig()));
            _savedVacationYear = getYear();
            _savedVacationDays = new Set(getVacationDays(_savedVacationYear));
            updateConfigMonthlyCalLabel();
            buildMonthlyCalToggles();
            if (configHolidays) configHolidays.hidden = false;
            holidaysSection.build();
        } else if (style === 'weekly') {
            configTitle!.textContent = t('configTitleWeekly') || 'Config. Semanal';
            configWeekly!.hidden = false;
            _savedWeekConfig = JSON.parse(JSON.stringify(getWeekConfig()));
            draftConfig = JSON.parse(JSON.stringify(getWeekConfig()));
            buildDaysPills();
            buildWeeklyTitle();
            buildHoursInputs();
        } else if (style === 'quarterly') {
            configTitle!.textContent = t('configTitleQuarterly') || 'Config. Trimestral';
            if (configQuarterly) configQuarterly!.hidden = false;
            _savedQuarterConfig = JSON.parse(JSON.stringify(getQuarterConfig()));
            _savedHolidaysConfig = JSON.parse(JSON.stringify(getHolidaysConfig()));
            draftQuarterConfig = JSON.parse(JSON.stringify(getQuarterConfig()));
            draftHolidaysConfig = JSON.parse(JSON.stringify(getHolidaysConfig()));
            _savedVacationYear = getYear();
            _savedVacationDays = new Set(getVacationDays(_savedVacationYear));
            updateConfigQuarterLabel();
            buildQuarterToggles();
            if (configHolidays) configHolidays.hidden = false;
            holidaysSection.build();
        }

        syncViewPills();
        syncPeriodo();
        configPanel!.hidden = false;
        showBackdrop(() => closeConfig(), configPanel);
    }

    // El periodo vive en la sección Vista y hay uno por estilo: se enseña el de la vista activa.
    function syncPeriodo() {
        const activo = { planner: 'secPeriodPlanner', monthly: 'secPeriodMonthly', quarterly: 'secPeriodQuarter' }[
            getStyle() as string
        ];
        for (const id of ['secPeriodPlanner', 'secPeriodMonthly', 'secPeriodQuarter']) {
            const el = document.getElementById(id);
            if (el) el.hidden = id !== activo;
        }
    }

    function syncViewPills() {
        viewPills.forEach((p) => p.classList.toggle('is-active', p.dataset.style === getStyle()));
    }

    // Cambiar de vista con el panel abierto: se guarda lo de la vista que se deja (sus controles
    // ya escribieron al estado en vivo) y se re-arma para la nueva — si no, los snapshots de
    // Cancelar seguirían apuntando a la vista anterior y revertirían la equivocada.
    function switchView(style: PlannerStyle) {
        if (style === getStyle()) return;
        // Si la vista que se deja no se puede guardar (semanal sin días), no se cambia: el panel
        // se queda abierto avisando, igual que al pulsar Guardar.
        // `keepOpen`: sin él, saveConfig ocultaba el panel y openConfig lo volvía a mostrar en el
        // mismo tick — `hidden` hacía off/on, el `panelFadeIn` se rearmaba y se veía un parpadeo.
        if (!saveConfig({ keepOpen: true })) return;
        setStyle(style);
        commitHistory();
        openConfig();
    }

    // ── Close config panel (cancel — reverts nav + config) ──
    function closeConfig() {
        const style = getStyle();
        // Revert config changes (restore snapshots)
        if (style === 'planner' && _savedPlannerConfig) {
            if (_savedPlannerOrientation) setPlannerOrientation(_savedPlannerOrientation);
            // Restore BOTH orientation configs directly (not via setPlannerConfig,
            // which cross-copies sectionTexts and would only touch the active one).
            if (_savedPlannerA5Config) setPlannerA5Config(_savedPlannerA5Config);
            if (_savedPlannerA4Config) setPlannerA4Config(_savedPlannerA4Config);
        }
        if (style === 'monthly' && _savedMonthlyCalConfig) {
            setMonthlyCalConfig(_savedMonthlyCalConfig);
        }
        if ((style === 'monthly' || style === 'quarterly') && _savedHolidaysConfig) {
            setHolidaysConfig(_savedHolidaysConfig);
        }
        if (style === 'weekly' && _savedWeekConfig) {
            setWeekConfig(_savedWeekConfig);
        }
        if (style === 'quarterly' && _savedQuarterConfig) {
            setQuarterConfig(_savedQuarterConfig);
        }
        // Revert vacation days if changed during quarterly/monthly editing.
        // Restore against the year captured at openConfig, NOT the currently
        // viewed year — the user may have navigated across a year boundary.
        if (
            (style === 'quarterly' || style === 'monthly') &&
            _savedVacationDays !== null &&
            _savedVacationYear !== null
        ) {
            saveVacationDays(_savedVacationYear, _savedVacationDays);
        }

        // Recorrer trimestres dejaba el mes en el primero del trimestre: setMonthYear restaura mes, año y trimestre.
        if (_savedMonth !== null && (getMonth() !== _savedMonth || getYear() !== _savedYear)) {
            setMonthYear(_savedMonth, _savedYear!);
        }
        // DESPUÉS del mes: su onMonthChange pone la semana 1, y Restablecer la mueve sin pasar por un borrador.
        if (_savedWeek !== null) setWeek(_savedWeek);

        panelStore.setOpen('config', false);
        draftConfig = null;
        draftQuarterConfig = null;
        draftPlannerConfig = null;
        draftMonthlyCalConfig = null;
        draftHolidaysConfig = null;
        _savedMonth = null;
        _savedYear = null;
        _savedWeek = null;
        _savedWeekConfig = null;
        _savedMonthlyConfig = null;
        _savedQuarterConfig = null;
        _savedPlannerConfig = null;
        _savedPlannerA5Config = null;
        _savedPlannerA4Config = null;
        _savedPlannerOrientation = null;
        _savedMonthlyCalConfig = null;
        _savedHolidaysConfig = null;
        _savedVacationDays = null;
        _savedVacationYear = null;
        _holidaysSnapshot = null;
        configPanel!.hidden = true;
        removeBackdrop();
        render();
    }

    // Expose close function for toolbar style switching
    panelStore.setCloser('config', closeConfig);
    panelStore.setOpener('config', openConfig);

    // ── Save config ──
    // Devuelve si llegó a guardar: con 0 días marcados NO guarda y deja el panel abierto, que es
    // la única señal de que no se guardó. Quien la llame debe mirar el retorno.
    // `keepOpen` lo usa SOLO el cambio de vista: persiste y suelta los borradores, pero no toca
    // el panel (ver `switchView`).
    function saveConfig(opts?: { keepOpen?: boolean }): boolean {
        const style = getStyle();

        if (style === 'weekly' && draftConfig) {
            if (draftConfig!.days.length === 0) return false;
            setWeekConfig(draftConfig!);
        }
        if (style === 'quarterly' && draftQuarterConfig) {
            setQuarterConfig(draftQuarterConfig!);
        }
        if (style === 'planner' && draftPlannerConfig) {
            setPlannerConfig(draftPlannerConfig!);
        }
        if (style === 'monthly' && draftMonthlyCalConfig) {
            setMonthlyCalConfig(draftMonthlyCalConfig!);
        }
        if ((style === 'quarterly' || style === 'monthly') && draftHolidaysConfig) {
            setHolidaysConfig(draftHolidaysConfig!);
        }
        // Clear snapshots so closeConfig won't revert
        _savedMonth = null;
        _savedYear = null;
        _savedWeek = null;
        _savedWeekConfig = null;
        _savedMonthlyConfig = null;
        _savedQuarterConfig = null;
        _savedPlannerConfig = null;
        _savedPlannerA5Config = null;
        _savedPlannerA4Config = null;
        _savedPlannerOrientation = null;
        _savedMonthlyCalConfig = null;
        _savedHolidaysConfig = null;
        _savedVacationDays = null;
        _savedVacationYear = null;
        _holidaysSnapshot = null;

        draftConfig = null;
        draftQuarterConfig = null;
        draftPlannerConfig = null;
        draftMonthlyCalConfig = null;
        draftHolidaysConfig = null;
        if (!opts?.keepOpen) {
            panelStore.setOpen('config', false);
            configPanel!.hidden = true;
            removeBackdrop();
        }
        render();
        return true;
    }

    // ── Text edit modes (extracted to planner-text-edit.ts) ──
    // Inyectamos el contexto unificado más `saveConfig` (que es
    // local a setupConfigPanel y por eso no vive en el ctx).
    const _textEdit = initTextEdit({ ...ctx, saveConfig });

    // Button handlers
    configBtn.addEventListener('click', () => {
        if (_textEdit.exitCurrentMode) _textEdit.exitCurrentMode('dismiss');
        if (panelStore.isOpen('config')) {
            closeConfig();
        } else {
            openConfig();
        }
    });

    if (saveBtn)
        saveBtn.addEventListener('click', () => {
            saveConfig();
            // saveConfig con días vacíos retorna SIN cerrar: el panel abierto delata el no-guardado.
            if (!panelStore.isOpen('config')) commitHistory();
        });
    if (cancelBtn) cancelBtn.addEventListener('click', closeConfig);

    // ── Reset config to defaults ──
    function resetConfig() {
        const style = getStyle();
        const now = new Date();
        const todayMonth = now.getMonth();
        const todayYear = now.getFullYear();

        // Reset date to current month (also updates quarter).
        // Refresh ALL 4 nav labels — each guards on its element existing, so it's
        // safe to call them all regardless of the active style. Previously only
        // the monthly + quarterly labels were refreshed, leaving the planner and
        // monthly-cal nav labels showing the pre-reset month.
        setMonthYear(todayMonth, todayYear);
        updateConfigQuarterLabel();
        updateConfigPlannerMonthLabel();
        updateConfigMonthlyCalLabel();

        if (style === 'weekly') {
            const savedCellTexts = JSON.parse(JSON.stringify(getWeekConfig().cellTexts || {}));
            // 1-based (planner-state.ts): la semana 0 no existe y salía en el nombre del export.
            setWeek(1);
            draftConfig = getDefaultWeekConfig();
            draftConfig!.cellTexts = savedCellTexts;
            setWeekConfig(draftConfig!);
            buildDaysPills();
            buildWeeklyTitle();
            buildHoursInputs();
        } else if (style === 'quarterly') {
            updateConfigQuarterLabel();
            draftQuarterConfig = getDefaultQuarterConfig();
            setQuarterConfig(draftQuarterConfig!);
            draftHolidaysConfig = getDefaultHolidaysConfig();
            setHolidaysConfig(draftHolidaysConfig!);
            buildQuarterToggles();
            holidaysSection.build();
        } else if (style === 'planner') {
            const savedSectionTexts = JSON.parse(JSON.stringify(getPlannerConfig().sectionTexts || {}));
            const orient = getPlannerOrientation();
            if (orient === 'horizontal') {
                draftPlannerConfig = getDefaultPlannerA4Config();
                draftPlannerConfig!.orientation = 'horizontal';
                draftPlannerConfig!.sectionTexts = savedSectionTexts;
                setPlannerA4Config(draftPlannerConfig!);
            } else {
                draftPlannerConfig = getDefaultPlannerA5Config();
                draftPlannerConfig!.orientation = 'vertical';
                draftPlannerConfig!.sectionTexts = savedSectionTexts;
                setPlannerA5Config(draftPlannerConfig!);
            }
            buildPlannerToggles();
            buildPlannerInputs();
        } else if (style === 'monthly') {
            draftMonthlyCalConfig = getDefaultMonthlyCalConfig();
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            draftHolidaysConfig = getDefaultHolidaysConfig();
            setHolidaysConfig(draftHolidaysConfig!);
            buildMonthlyCalToggles();
            holidaysSection.build();
        }

        render();
    }

    if (resetBtn) resetBtn.addEventListener('click', resetConfig);

    function updateConfigQuarterLabel() {
        if (!configQuarterLabel) return;
        const q = getQuarter();
        configQuarterLabel.textContent = t('quarterOf').replace('{0}', String(q)).replace('{1}', String(getYear()));
    }

    // Cruzar de año cambia si hay festivos, y el toggle y la sección leen hasHolidayData solo al construirse.
    function rebuildIfYearChanged(yearBefore: number) {
        if (getYear() === yearBefore || !draftHolidaysConfig) return;
        if (draftQuarterConfig) buildQuarterToggles();
        if (draftMonthlyCalConfig) buildMonthlyCalToggles();
        holidaysSection.build();
    }

    if (prevQuarterBtn) {
        prevQuarterBtn.addEventListener('click', () => {
            const yearBefore = getYear();
            goToPrevQuarter();
            updateConfigQuarterLabel();
            rebuildIfYearChanged(yearBefore);
            render();
        });
    }

    if (nextQuarterBtn) {
        nextQuarterBtn.addEventListener('click', () => {
            const yearBefore = getYear();
            goToNextQuarter();
            updateConfigQuarterLabel();
            rebuildIfYearChanged(yearBefore);
            render();
        });
    }

    // ── Planner: toggles (simple 2-per-row grid, separate A5/A4) ──
    function buildPlannerToggles() {
        if (!plannerToggles) return;
        plannerToggles!.innerHTML = '';

        const isHoriz = getPlannerOrientation() === 'horizontal';

        // ── Fila 0: A4/A5 + Alineación ──
        const row0 = document.createElement('div');
        row0.className = 'planner-config__toggle-row';

        const ALIGN_CYCLE = ['left-inline', 'left', 'center-inline', 'center', 'right-inline', 'right'];
        const ALIGN_ICONS = {
            left: 'fa-align-left',
            'left-inline': 'fa-align-left',
            center: 'fa-align-center',
            'center-inline': 'fa-align-center',
            right: 'fa-align-right',
            'right-inline': 'fa-align-right',
        };
        const ALIGN_LABELS = {
            left: 'alignLeft',
            'left-inline': 'alignLeftInline',
            center: 'alignCenter',
            'center-inline': 'alignCenterInline',
            right: 'alignRight',
            'right-inline': 'alignRightInline',
        };

        const alignBtn = document.createElement('button');
        alignBtn.className = 'planner-config__toggle-btn is-active';
        alignBtn.type = 'button';

        function updateAlignBtn() {
            const align = draftPlannerConfig!.monthYearAlign || 'center';
            alignBtn.innerHTML = `<i class="fas ${ALIGN_ICONS[align as keyof typeof ALIGN_ICONS]}"></i><span>${t(ALIGN_LABELS[align as keyof typeof ALIGN_LABELS] || '')}</span>`;
        }
        updateAlignBtn();

        alignBtn.addEventListener('click', () => {
            const cur = draftPlannerConfig!.monthYearAlign || 'center';
            const idx = ALIGN_CYCLE.indexOf(cur);
            draftPlannerConfig!.monthYearAlign = ALIGN_CYCLE[(idx + 1) % ALIGN_CYCLE.length]!;
            updateAlignBtn();
            setPlannerConfig(draftPlannerConfig!);
            render();
        });

        const orientBtn = document.createElement('button');
        orientBtn.className = 'planner-config__toggle-btn is-active';
        orientBtn.type = 'button';
        function updateOrientBtn() {
            const h = getPlannerOrientation() === 'horizontal';
            const icon = h ? 'fa-arrows-alt-h' : 'fa-arrows-alt-v';
            const sizeLabel = h ? 'A4' : 'A5';
            orientBtn.innerHTML = `<i class="fas ${icon}"></i><span>${sizeLabel}</span>`;
        }
        updateOrientBtn();
        orientBtn.addEventListener('click', () => {
            const newOrient = getPlannerOrientation() === 'horizontal' ? 'vertical' : 'horizontal';
            setPlannerOrientation(newOrient);
            // Switch to the other config
            draftPlannerConfig = JSON.parse(
                JSON.stringify(newOrient === 'horizontal' ? getPlannerA4Config() : getPlannerA5Config())
            );
            draftPlannerConfig!.orientation = newOrient;
            buildPlannerToggles();
            buildPlannerInputs();
            render();
        });

        row0.appendChild(orientBtn);
        row0.appendChild(alignBtn);
        plannerToggles!.appendChild(row0);

        // ── Rows 2-4: Section toggles (vary by orientation) ──
        if (isHoriz) {
            // Horizontal (A4): Objetivos+Prioridad, Tareas+Hábitos, Gratitud+Mejorar
            const row2 = document.createElement('div');
            row2.className = 'planner-config__toggle-row';
            row2.appendChild(_makeToggle('showGoals', 'toggleGoals'));
            row2.appendChild(_makeToggle('showPriority', 'togglePriority'));
            plannerToggles!.appendChild(row2);

            const row3 = document.createElement('div');
            row3.className = 'planner-config__toggle-row';
            row3.appendChild(_makeToggle('showTodo', 'toggleTodo'));
            row3.appendChild(_makeToggle('showHabits', 'toggleHabits'));
            plannerToggles!.appendChild(row3);

            const row4 = document.createElement('div');
            row4.className = 'planner-config__toggle-row';
            row4.appendChild(_makeToggle('showGrateful', 'toggleGratitude'));
            row4.appendChild(_makeToggle('showSelfCare', 'toggleSelfCare'));
            plannerToggles!.appendChild(row4);
        } else {
            // Vertical (A5): Objetivos+Hábitos, Tareas+Prioridad, Gratitud+Mejorar
            const row2 = document.createElement('div');
            row2.className = 'planner-config__toggle-row';
            row2.appendChild(_makeToggle('showGoals', 'toggleGoals'));
            row2.appendChild(_makeToggle('showHabits', 'toggleHabits'));
            plannerToggles!.appendChild(row2);

            const row3 = document.createElement('div');
            row3.className = 'planner-config__toggle-row';
            row3.appendChild(_makeToggle('showTodo', 'toggleTodo'));
            row3.appendChild(_makeToggle('showPriority', 'togglePriority'));
            plannerToggles!.appendChild(row3);

            const row4 = document.createElement('div');
            row4.className = 'planner-config__toggle-row';
            row4.appendChild(_makeToggle('showGrateful', 'toggleGratitude'));
            row4.appendChild(_makeToggle('showSelfCare', 'toggleSelfCare'));
            plannerToggles!.appendChild(row4);
        }

        /** Helper: create a simple toggle button bound to draftPlannerConfig */
        type PlannerToggleKey =
            | 'showGoals'
            | 'showHabits'
            | 'showTodo'
            | 'showPriority'
            | 'showGrateful'
            | 'showSelfCare';
        function _makeToggle(configKey: PlannerToggleKey, labelKey: string) {
            const btn = document.createElement('button');
            btn.className = 'planner-config__toggle-btn';
            btn.type = 'button';
            btn.textContent = t(labelKey);
            if (draftPlannerConfig![configKey] !== false) btn.classList.add('is-active');
            btn.addEventListener('click', () => {
                draftPlannerConfig![configKey] = !draftPlannerConfig![configKey];
                btn.classList.toggle('is-active', draftPlannerConfig![configKey]);
                setPlannerConfig(draftPlannerConfig!);
                render();
            });
            return btn;
        }
    }

    // ── Planner: number inputs (TO DO count, Habit count) ──
    function buildPlannerInputs() {
        if (!plannerInputs) return;
        plannerInputs!.innerHTML = '';

        const defaults = getDefaultPlannerConfig();
        const isHoriz = getPlannerOrientation() === 'horizontal';
        const inputs: Array<{ key: 'todoCount' | 'habitCount'; label: string; min: number; max: number }> = [
            { key: 'todoCount', label: t('labelTodoCount'), min: TODO_MIN, max: isHoriz ? A4_TODO_MAX : A5_TODO_MAX },
            {
                key: 'habitCount',
                label: t('labelHabitCount'),
                min: HABIT_MIN,
                max: isHoriz ? A4_HABIT_MAX : A5_HABIT_MAX,
            },
        ];

        for (const { key, label, min, max } of inputs) {
            const row = document.createElement('div');
            row.className = 'planner-config__select-row';

            const lbl = document.createElement('label');
            lbl.className = 'planner-config__select-label';
            lbl.textContent = label;
            row.appendChild(lbl);

            const controls = document.createElement('div');
            controls.className = 'planner-config__num-controls';

            // Con el nombre de la fila, como su ↺: hay dos filas y «Disminuir» a secas no dice cuál
            const minusBtn = document.createElement('button');
            minusBtn.type = 'button';
            minusBtn.className = 'planner-config__num-btn';
            minusBtn.textContent = '\u2212';
            minusBtn.setAttribute('aria-label', `${t('ariaDecrease')} ${label}`);

            const valueSpan = document.createElement('span');
            valueSpan.className = 'planner-config__num-value';
            valueSpan.textContent = String(draftPlannerConfig![key]);

            const plusBtn = document.createElement('button');
            plusBtn.type = 'button';
            plusBtn.className = 'planner-config__num-btn';
            plusBtn.textContent = '+';
            plusBtn.setAttribute('aria-label', `${t('ariaIncrease')} ${label}`);

            // Per-control reset button
            const resetCtrlBtn = document.createElement('button');
            resetCtrlBtn.type = 'button';
            resetCtrlBtn.className = 'planner-config__num-reset';
            resetCtrlBtn.title = t('btnReset');
            resetCtrlBtn.setAttribute('aria-label', `${t('btnReset')} ${label}`);
            resetCtrlBtn.innerHTML = '<i class="fas fa-undo"></i>';
            resetCtrlBtn.disabled = draftPlannerConfig![key] === defaults[key];

            function update(delta: number) {
                const val = Math.min(max, Math.max(min, draftPlannerConfig![key] + delta));
                draftPlannerConfig![key] = val;
                valueSpan.textContent = String(val);
                minusBtn.disabled = val <= min;
                plusBtn.disabled = val >= max;
                resetCtrlBtn.disabled = val === defaults[key];
                setPlannerConfig(draftPlannerConfig!);
                render();
            }

            attachHoldRepeat(minusBtn, () => update(-1));
            attachHoldRepeat(plusBtn, () => update(1));
            resetCtrlBtn.addEventListener('click', () => {
                draftPlannerConfig![key] = defaults[key];
                valueSpan.textContent = String(defaults[key]);
                minusBtn.disabled = defaults[key] <= min;
                plusBtn.disabled = defaults[key] >= max;
                resetCtrlBtn.disabled = true;
                setPlannerConfig(draftPlannerConfig!);
                render();
            });

            minusBtn.disabled = draftPlannerConfig![key] <= min;
            plusBtn.disabled = draftPlannerConfig![key] >= max;

            controls.appendChild(minusBtn);
            controls.appendChild(valueSpan);
            controls.appendChild(plusBtn);
            row.appendChild(controls);
            row.appendChild(resetCtrlBtn);
            plannerInputs!.appendChild(row);
        }
    }

    // ── Monthly Calendar: nav arrows ──
    function updateConfigPlannerMonthLabel() {
        if (!configPlannerMonthLabel) return;
        configPlannerMonthLabel.textContent = `${getMonthName(getMonth())} ${getYear()}`;
    }

    if (prevPlannerMonth) {
        prevPlannerMonth.addEventListener('click', () => {
            goToPrevMonth();
            updateConfigPlannerMonthLabel();
            render();
        });
    }

    if (nextPlannerMonth) {
        nextPlannerMonth.addEventListener('click', () => {
            goToNextMonth();
            updateConfigPlannerMonthLabel();
            render();
        });
    }

    function updateConfigMonthlyCalLabel() {
        if (!configMonthlyCalLabel) return;
        configMonthlyCalLabel.textContent = `${getMonthName(getMonth())} ${getYear()}`;
    }

    if (prevMonthlyCal) {
        prevMonthlyCal.addEventListener('click', () => {
            const yearBefore = getYear();
            goToPrevMonth();
            updateConfigMonthlyCalLabel();
            rebuildIfYearChanged(yearBefore);
            render();
        });
    }

    if (nextMonthlyCal) {
        nextMonthlyCal.addEventListener('click', () => {
            const yearBefore = getYear();
            goToNextMonth();
            updateConfigMonthlyCalLabel();
            rebuildIfYearChanged(yearBefore);
            render();
        });
    }

    // ── Monthly Calendar: toggles ──
    function buildMonthlyCalToggles() {
        if (!monthlyCalToggles) return;
        monthlyCalToggles!.innerHTML = '';

        // Track saved mini-cal-left state for restore when notas is re-enabled
        if (draftMonthlyCalConfig!._savedMiniLeft === undefined) {
            draftMonthlyCalConfig!._savedMiniLeft = draftMonthlyCalConfig!.showMiniCalLeft;
        }

        const showNotes = draftMonthlyCalConfig!.showNotes !== false;

        // ── Row 0: Título (on/off) + Alineación ──
        const row0 = document.createElement('div');
        row0.className = 'planner-config__toggle-row';

        const titleBtn = document.createElement('button');
        titleBtn.className = 'planner-config__toggle-btn';
        titleBtn.type = 'button';
        titleBtn.textContent = t('toggleTitle');
        if (draftMonthlyCalConfig!.showTitle !== false) titleBtn.classList.add('is-active');

        const MC_ALIGN_ALL = {
            'left-inline': { icon: 'fa-align-left', label: 'alignLeftInline' },
            left: { icon: 'fa-align-left', label: 'alignLeft' },
            'center-inline': { icon: 'fa-align-center', label: 'alignCenterInline' },
            center: { icon: 'fa-align-center', label: 'alignCenter' },
            'right-inline': { icon: 'fa-align-right', label: 'alignRightInline' },
            right: { icon: 'fa-align-right', label: 'alignRight' },
        };

        // Allowed alignment options depend on mini-cal state + notes state
        function getAllowedAlignCycle() {
            const left = draftMonthlyCalConfig!.showMiniCalLeft;
            const right = draftMonthlyCalConfig!.showMiniCalRight;
            if (!showNotes) {
                // Without notes: only center and right variants
                if (left && right) return ['center-inline', 'center'];
                if (right) return ['center-inline', 'center'];
                if (left) return ['center-inline', 'center', 'right-inline', 'right'];
                return ['center-inline', 'center', 'right-inline', 'right'];
            }
            if (left && right) return ['center-inline', 'center'];
            if (left && !right) return ['center-inline', 'center', 'right-inline', 'right'];
            if (!left && right) return ['left-inline', 'left', 'center-inline', 'center'];
            return ['left-inline', 'left', 'center-inline', 'center', 'right-inline', 'right'];
        }

        const mcAlignBtn = document.createElement('button');
        mcAlignBtn.className = 'planner-config__toggle-btn is-active';
        mcAlignBtn.type = 'button';

        function updateMcAlignBtn() {
            const align = draftMonthlyCalConfig!.monthYearAlign || 'center';
            const info = MC_ALIGN_ALL[align as keyof typeof MC_ALIGN_ALL]!;
            mcAlignBtn.innerHTML = `<i class="fas ${info.icon}"></i><span>${t(info.label)}</span>`;
        }
        updateMcAlignBtn();

        function updateAlignState() {
            const titleOn = draftMonthlyCalConfig!.showTitle !== false;
            mcAlignBtn.disabled = !titleOn;
            mcAlignBtn.classList.toggle('is-disabled', !titleOn);
        }
        updateAlignState();

        // Snap current alignment to allowed set when state changes
        function snapAlignToAllowed() {
            const cycle = getAllowedAlignCycle();
            const cur = draftMonthlyCalConfig!.monthYearAlign || 'center';
            if (!cycle.includes(cur)) {
                draftMonthlyCalConfig!.monthYearAlign = cycle[0]!;
                updateMcAlignBtn();
                setMonthlyCalConfig(draftMonthlyCalConfig!);
            }
        }

        // Snap alignment on build (handles notes toggle rebuild)
        snapAlignToAllowed();

        titleBtn.addEventListener('click', () => {
            draftMonthlyCalConfig!.showTitle = !draftMonthlyCalConfig!.showTitle;
            titleBtn.classList.toggle('is-active', draftMonthlyCalConfig!.showTitle);
            updateAlignState();
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            render();
        });

        mcAlignBtn.addEventListener('click', () => {
            const cycle = getAllowedAlignCycle();
            const cur = draftMonthlyCalConfig!.monthYearAlign || 'center';
            const idx = cycle.indexOf(cur);
            draftMonthlyCalConfig!.monthYearAlign = cycle[(idx + 1) % cycle.length]!;
            updateMcAlignBtn();
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            render();
        });

        row0.appendChild(titleBtn);
        row0.appendChild(mcAlignBtn);
        monthlyCalToggles!.appendChild(row0);

        // ── Row 1: Notas toggle + Mini calendario (conditional cycle) ──
        const row1 = document.createElement('div');
        row1.className = 'planner-config__toggle-row';

        const notesBtn = document.createElement('button');
        notesBtn.className = 'planner-config__toggle-btn';
        notesBtn.type = 'button';
        notesBtn.textContent = t('toggleNotes');
        if (showNotes) notesBtn.classList.add('is-active');

        // Mini calendar cycle depends on notes state
        // With notes:    Der → Izq → Ambos → No
        // Without notes: Der → No (left is forced off, QR goes to left space)
        const MINI_CYCLE_FULL = [
            { left: false, right: true, labelKey: 'toggleMiniCalRight' },
            { left: true, right: false, labelKey: 'toggleMiniCalLeft' },
            { left: true, right: true, labelKey: 'toggleMiniCalBoth' },
            { left: false, right: false, labelKey: 'toggleMiniCalNone' },
        ];
        const MINI_CYCLE_NO_NOTES = [
            { left: false, right: true, labelKey: 'toggleMiniCalRight' },
            { left: false, right: false, labelKey: 'toggleMiniCalNone' },
        ];

        function getMiniCycle() {
            return showNotes ? MINI_CYCLE_FULL : MINI_CYCLE_NO_NOTES;
        }

        function getMiniIdx() {
            const cycle = getMiniCycle();
            const l = !!draftMonthlyCalConfig!.showMiniCalLeft;
            const r = !!draftMonthlyCalConfig!.showMiniCalRight;
            return cycle.findIndex((s) => s.left === l && s.right === r);
        }

        const miniBtn = document.createElement('button');
        miniBtn.className = 'planner-config__toggle-btn';
        miniBtn.type = 'button';

        function updateMiniBtn() {
            const cycle = getMiniCycle();
            const idx = getMiniIdx();
            const state = cycle[idx >= 0 ? idx : 0]!;
            miniBtn.textContent = t(state.labelKey);
            miniBtn.classList.toggle('is-active', state.left || state.right);
        }
        updateMiniBtn();

        miniBtn.addEventListener('click', () => {
            const cycle = getMiniCycle();
            const idx = getMiniIdx();
            const next = cycle[(idx + 1) % cycle.length]!;
            draftMonthlyCalConfig!.showMiniCalLeft = next.left;
            draftMonthlyCalConfig!.showMiniCalRight = next.right;
            if (showNotes) draftMonthlyCalConfig!._savedMiniLeft = next.left;
            updateMiniBtn();
            snapAlignToAllowed();
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            render();
        });

        notesBtn.addEventListener('click', () => {
            draftMonthlyCalConfig!.showNotes = !draftMonthlyCalConfig!.showNotes;
            if (!draftMonthlyCalConfig!.showNotes) {
                // Save left state and force it off
                draftMonthlyCalConfig!._savedMiniLeft = draftMonthlyCalConfig!.showMiniCalLeft;
                draftMonthlyCalConfig!.showMiniCalLeft = false;
            } else {
                // Restore saved left state
                draftMonthlyCalConfig!.showMiniCalLeft = !!draftMonthlyCalConfig!._savedMiniLeft;
            }
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            buildMonthlyCalToggles(); // Rebuild to update cycles and constraints
            render();
        });

        row1.appendChild(notesBtn);
        row1.appendChild(miniBtn);
        monthlyCalToggles!.appendChild(row1);

        // ── Row 2: Marca de agua + Otros meses ──
        const row2 = document.createElement('div');
        row2.className = 'planner-config__toggle-row';

        const watermarkBtn = document.createElement('button');
        watermarkBtn.className = 'planner-config__toggle-btn';
        watermarkBtn.type = 'button';
        watermarkBtn.textContent = t('toggleWatermark');
        if (draftMonthlyCalConfig!.showWatermark !== false) watermarkBtn.classList.add('is-active');
        watermarkBtn.addEventListener('click', () => {
            draftMonthlyCalConfig!.showWatermark = !draftMonthlyCalConfig!.showWatermark;
            watermarkBtn.classList.toggle('is-active', draftMonthlyCalConfig!.showWatermark);
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            render();
        });
        row2.appendChild(watermarkBtn);

        const overflowBtn = document.createElement('button');
        overflowBtn.className = 'planner-config__toggle-btn';
        overflowBtn.type = 'button';
        overflowBtn.textContent = t('toggleOverflow');
        if (draftMonthlyCalConfig!.showOverflow !== false) overflowBtn.classList.add('is-active');
        overflowBtn.addEventListener('click', () => {
            draftMonthlyCalConfig!.showOverflow = !draftMonthlyCalConfig!.showOverflow;
            overflowBtn.classList.toggle('is-active', draftMonthlyCalConfig!.showOverflow);
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            render();
        });
        row2.appendChild(overflowBtn);
        monthlyCalToggles!.appendChild(row2);

        // ── Row 3: Sab y Dom + Festivos ──
        const row3 = document.createElement('div');
        row3.className = 'planner-config__toggle-row';

        const weekendShadingBtn = document.createElement('button');
        weekendShadingBtn.className = 'planner-config__toggle-btn';
        weekendShadingBtn.type = 'button';
        weekendShadingBtn.textContent = t('toggleWeekendShading');
        if (draftMonthlyCalConfig!.weekendShading !== false) weekendShadingBtn.classList.add('is-active');
        weekendShadingBtn.addEventListener('click', () => {
            draftMonthlyCalConfig!.weekendShading = !draftMonthlyCalConfig!.weekendShading;
            weekendShadingBtn.classList.toggle('is-active', draftMonthlyCalConfig!.weekendShading);
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            render();
        });
        row3.appendChild(weekendShadingBtn);

        const holidaysBtn = document.createElement('button');
        holidaysBtn.className = 'planner-config__toggle-btn';
        holidaysBtn.type = 'button';
        holidaysBtn.textContent = t('toggleHolidays');
        if (draftMonthlyCalConfig!.showHolidays !== false) holidaysBtn.classList.add('is-active');
        // Sin festivos del año NO se deshabilita: también enciende los días libres (✦), que sí existen.
        if (!hasHolidayData(getYear())) {
            holidaysBtn.title = t('holidaysNoData').replace('{year}', String(getYear()));
        }
        holidaysBtn.addEventListener('click', () => {
            draftMonthlyCalConfig!.showHolidays = !draftMonthlyCalConfig!.showHolidays;
            holidaysBtn.classList.toggle('is-active', draftMonthlyCalConfig!.showHolidays);
            setMonthlyCalConfig(draftMonthlyCalConfig!);
            holidaysSection.build();
            render();
        });
        row3.appendChild(holidaysBtn);
        monthlyCalToggles!.appendChild(row3);
    }

    function buildQuarterToggles() {
        if (!quarterToggles) return;
        quarterToggles!.innerHTML = '';

        // ── Row 0: Título (on/off) + Alineación (cycle left→center→right) ──
        const row0 = document.createElement('div');
        row0.className = 'planner-config__toggle-row';

        const titleBtn = document.createElement('button');
        titleBtn.className = 'planner-config__toggle-btn';
        titleBtn.type = 'button';
        titleBtn.textContent = t('toggleTitle');
        if (draftQuarterConfig!.showTitle !== false) titleBtn.classList.add('is-active');

        const Q_ALIGN_CYCLE = ['left-inline', 'left', 'center-inline', 'center', 'right-inline', 'right'];
        const Q_ALIGN_ICONS = {
            left: 'fa-align-left',
            'left-inline': 'fa-align-left',
            center: 'fa-align-center',
            'center-inline': 'fa-align-center',
            right: 'fa-align-right',
            'right-inline': 'fa-align-right',
        };
        const Q_ALIGN_LABELS = {
            left: 'alignLeft',
            'left-inline': 'alignLeftInline',
            center: 'alignCenter',
            'center-inline': 'alignCenterInline',
            right: 'alignRight',
            'right-inline': 'alignRightInline',
        };

        const qAlignBtn = document.createElement('button');
        qAlignBtn.className = 'planner-config__toggle-btn is-active';
        qAlignBtn.type = 'button';

        function updateQAlignBtn() {
            const align = draftQuarterConfig!.titleAlign || 'center-inline';
            qAlignBtn.innerHTML = `<i class="fas ${Q_ALIGN_ICONS[align as keyof typeof Q_ALIGN_ICONS]}"></i><span>${t(Q_ALIGN_LABELS[align as keyof typeof Q_ALIGN_LABELS] || '')}</span>`;
        }
        updateQAlignBtn();

        if (!draftQuarterConfig!.showTitle) {
            qAlignBtn.disabled = true;
            qAlignBtn.classList.add('is-disabled');
        }

        titleBtn.addEventListener('click', () => {
            draftQuarterConfig!.showTitle = !draftQuarterConfig!.showTitle;
            titleBtn.classList.toggle('is-active', draftQuarterConfig!.showTitle);
            qAlignBtn.disabled = !draftQuarterConfig!.showTitle;
            qAlignBtn.classList.toggle('is-disabled', !draftQuarterConfig!.showTitle);
            setQuarterConfig(draftQuarterConfig!);
            render();
        });

        qAlignBtn.addEventListener('click', () => {
            const cur = draftQuarterConfig!.titleAlign || 'center-inline';
            const idx = Q_ALIGN_CYCLE.indexOf(cur);
            draftQuarterConfig!.titleAlign = Q_ALIGN_CYCLE[(idx + 1) % Q_ALIGN_CYCLE.length]!;
            updateQAlignBtn();
            setQuarterConfig(draftQuarterConfig!);
            render();
        });

        row0.appendChild(titleBtn);
        row0.appendChild(qAlignBtn);
        quarterToggles!.appendChild(row0);

        // ── Row 1: Día Semana + Nº Semana ──
        const row1 = document.createElement('div');
        row1.className = 'planner-config__toggle-row';

        const dayAbbrevBtn = document.createElement('button');
        dayAbbrevBtn.className = 'planner-config__toggle-btn';
        dayAbbrevBtn.type = 'button';
        dayAbbrevBtn.textContent = t('toggleDayAbbrev');
        if (draftQuarterConfig!.showDayAbbrev !== false) dayAbbrevBtn.classList.add('is-active');
        dayAbbrevBtn.addEventListener('click', () => {
            draftQuarterConfig!.showDayAbbrev = !draftQuarterConfig!.showDayAbbrev;
            dayAbbrevBtn.classList.toggle('is-active', draftQuarterConfig!.showDayAbbrev);
            setQuarterConfig(draftQuarterConfig!);
            render();
        });
        row1.appendChild(dayAbbrevBtn);

        const weekBtn = document.createElement('button');
        weekBtn.className = 'planner-config__toggle-btn';
        weekBtn.type = 'button';
        weekBtn.textContent = t('toggleWeekNum');
        if (draftQuarterConfig!.showWeekNumbers !== false) weekBtn.classList.add('is-active');
        weekBtn.addEventListener('click', () => {
            draftQuarterConfig!.showWeekNumbers = !draftQuarterConfig!.showWeekNumbers;
            weekBtn.classList.toggle('is-active', draftQuarterConfig!.showWeekNumbers);
            setQuarterConfig(draftQuarterConfig!);
            render();
        });
        row1.appendChild(weekBtn);
        quarterToggles!.appendChild(row1);

        // ── Row 2: Marca de agua + Festivos ──
        const row2 = document.createElement('div');
        row2.className = 'planner-config__toggle-row';

        const watermarkBtn = document.createElement('button');
        watermarkBtn.className = 'planner-config__toggle-btn';
        watermarkBtn.type = 'button';
        watermarkBtn.textContent = t('toggleWatermark');
        if (draftQuarterConfig!.showWatermark !== false) watermarkBtn.classList.add('is-active');
        watermarkBtn.addEventListener('click', () => {
            draftQuarterConfig!.showWatermark = !draftQuarterConfig!.showWatermark;
            watermarkBtn.classList.toggle('is-active', draftQuarterConfig!.showWatermark);
            setQuarterConfig(draftQuarterConfig!);
            render();
        });
        row2.appendChild(watermarkBtn);

        const holidaysBtn = document.createElement('button');
        holidaysBtn.className = 'planner-config__toggle-btn';
        holidaysBtn.type = 'button';
        holidaysBtn.textContent = t('toggleHolidays');
        if (draftQuarterConfig!.showHolidays !== false) holidaysBtn.classList.add('is-active');
        // Sin festivos del año NO se deshabilita: también enciende los días libres (✦), que sí existen.
        if (!hasHolidayData(getYear())) {
            holidaysBtn.title = t('holidaysNoData').replace('{year}', String(getYear()));
        }
        holidaysBtn.addEventListener('click', () => {
            draftQuarterConfig!.showHolidays = !draftQuarterConfig!.showHolidays;
            holidaysBtn.classList.toggle('is-active', draftQuarterConfig!.showHolidays);
            setQuarterConfig(draftQuarterConfig!);
            holidaysSection.build();
            render();
        });
        row2.appendChild(holidaysBtn);
        quarterToggles!.appendChild(row2);
    }

    // ── Weekly: day pills (row 1: L-V, row 2: S D T) ──
    function buildDaysPills() {
        const pills = t('dayPills');
        daysPills!.innerHTML = '';

        // Row 1: weekdays (indices 0-4)
        const row1 = document.createElement('div');
        row1.className = 'planner-config__pills-row';
        for (let idx = 0; idx < 5; idx++) {
            row1.appendChild(createDayPill(pills[idx]!, idx));
        }
        daysPills!.appendChild(row1);

        // Row 2: weekend (5,6) + hour alignment toggle
        const row2 = document.createElement('div');
        row2.className = 'planner-config__pills-row';
        for (let idx = 5; idx < pills.length; idx++) {
            row2.appendChild(createDayPill(pills[idx]!, idx));
        }

        // Separator + hour alignment pill (cycles top → middle → bottom)
        const ALIGN_STATES = ['top', 'middle', 'bottom'];
        const ALIGN_ICONS = { top: 'fa-arrow-up', middle: 'fa-arrows-up-down', bottom: 'fa-arrow-down' };
        const ALIGN_LABELS = { top: t('hourAlignTop'), middle: t('hourAlignMiddle'), bottom: t('hourAlignBottom') };

        const sep = document.createElement('span');
        sep.className = 'planner-config__pills-sep';
        row2.appendChild(sep);

        let currentAlign = (draftConfig!.hourAlign || 'middle') as keyof typeof ALIGN_ICONS;
        const alignPill = document.createElement('button');
        alignPill.className = 'planner-config__pill planner-config__pill--align';
        alignPill.type = 'button';
        alignPill.title = ALIGN_LABELS[currentAlign] || '';
        alignPill.innerHTML = `<i class="fas ${ALIGN_ICONS[currentAlign]}"></i>`;
        if (currentAlign !== 'middle') alignPill.classList.add('is-active');

        alignPill.addEventListener('click', () => {
            const idx = ALIGN_STATES.indexOf(currentAlign);
            currentAlign = ALIGN_STATES[(idx + 1) % ALIGN_STATES.length] as keyof typeof ALIGN_ICONS;
            alignPill.innerHTML = `<i class="fas ${ALIGN_ICONS[currentAlign]}"></i>`;
            alignPill.title = ALIGN_LABELS[currentAlign] || '';
            alignPill.classList.toggle('is-active', currentAlign !== 'middle');

            draftConfig!.hourAlign = currentAlign;
            setWeekConfig(draftConfig!);
            render();
        });
        row2.appendChild(alignPill);

        daysPills!.appendChild(row2);
    }

    // ── Weekly: title toggle (eye icon) + custom text ──
    function buildWeeklyTitle() {
        if (!weeklyTitleRow) return;
        weeklyTitleRow!.innerHTML = '';
        weeklyTitleRow!.className = 'planner-config__title-input-row';

        // Eye icon toggle (square, like reset buttons)
        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'planner-config__eye-btn';
        eyeBtn.type = 'button';
        const updateEye = () => {
            const visible = draftConfig!.showTitle !== false;
            eyeBtn.innerHTML = `<i class="fas ${visible ? 'fa-eye' : 'fa-eye-slash'}"></i>`;
            eyeBtn.classList.toggle('is-active', visible);
        };
        updateEye();
        eyeBtn.addEventListener('click', () => {
            draftConfig!.showTitle = !draftConfig!.showTitle;
            updateEye();
            titleInput.disabled = !draftConfig!.showTitle;
            setWeekConfig(draftConfig!);
            render();
        });
        weeklyTitleRow!.appendChild(eyeBtn);

        // Text input
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'planner-config__title-input';
        // El saneador corta ahí al cargar y al compartir: la UI no debe poder escribir más.
        titleInput.maxLength = TITLE_MAX;
        titleInput.placeholder = t('pageWeekly');
        titleInput.value = draftConfig!.titleText || '';
        titleInput.disabled = draftConfig!.showTitle === false;
        titleInput.addEventListener('input', () => {
            draftConfig!.titleText = titleInput.value;
            setWeekConfig(draftConfig!);
            render();
        });
        weeklyTitleRow!.appendChild(titleInput);
    }

    function createDayPill(letter: string, idx: number) {
        const pill = document.createElement('button');
        pill.className = 'planner-config__pill';
        pill.textContent = letter;
        pill.type = 'button';
        if (draftConfig!.days.includes(idx)) pill.classList.add('is-active');
        pill.addEventListener('click', () => {
            const pos = draftConfig!.days.indexOf(idx);
            if (pos >= 0) {
                draftConfig!.days.splice(pos, 1);
                pill.classList.remove('is-active');
            } else {
                draftConfig!.days.push(idx);
                pill.classList.add('is-active');
            }
            setWeekConfig(draftConfig!);
            render();
        });
        return pill;
    }

    // ── Weekly: hour inputs (2 per row grid, add/remove stay open & update reactively) ──
    // Parses user input that can be H:MM, decimal hours (1.5 → 1:30), or just hours
    function parseHourInput(val: string) {
        val = val.trim().replace(',', '.');
        // H:MM format
        if (val.includes(':')) {
            const parts = val.split(':').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]!) && !isNaN(parts[1]!)) {
                return { h: Math.max(0, parts[0]!), m: Math.max(0, Math.min(59, Math.round(parts[1]!))) };
            }
        }
        // Decimal hours (e.g. 1.5 → 1h30m, 1.25 → 1h15m, 1.33 → 1h20m)
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 0) {
            const totalMin = Math.round(num * 60);
            return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
        }
        return null;
    }

    function formatHM(h: number, m: number) {
        return `${h}:${String(m).padStart(2, '0')}`;
    }

    // State for contextual Aplicar (null = idle, number = focused hour index)
    let _activeHourIdx: number | null = null;
    let _cleanupApplyListener: (() => void) | null = null;

    function buildHoursInputs() {
        // Remove previous document listener before rebuilding
        if (_cleanupApplyListener) {
            _cleanupApplyListener();
            _cleanupApplyListener = null;
        }
        hoursInputs!.innerHTML = '';
        _activeHourIdx = null;

        // Collect references for contextual highlight
        const hourInputEls: HTMLInputElement[] = [];

        const topRow = document.createElement('div');
        topRow.className = 'planner-config__hour-top-row';

        const leftCell = document.createElement('div');
        leftCell.className = 'planner-config__hour-row';
        const setLabel = document.createElement('span');
        setLabel.className = 'planner-config__hour-label';
        // Icono y no palabra: la columna mide 18 px (la de los números de franja) y «Schritt» desalinearía la fila.
        setLabel.innerHTML = '<i class="fas fa-stopwatch" aria-hidden="true"></i>';
        setLabel.setAttribute('role', 'img');
        setLabel.setAttribute('aria-label', t('hourIncrementLabel'));
        setLabel.title = t('hourIncrementLabel');
        const incToggle = document.createElement('button');
        incToggle.type = 'button';
        incToggle.className = 'planner-config__hour-input planner-config__hour-inc-toggle';
        const inc = draftConfig!.hourIncrement || 90;
        incToggle.textContent = formatHM(Math.floor(inc / 60), inc % 60);
        incToggle.title = t('hourIncrementLabel');

        // Inline editing on click
        let incEditing = false;
        incToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (incEditing) return;
            incEditing = true;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'planner-config__hour-inc-inline';
            input.value = incToggle.textContent;
            input.maxLength = 5;
            incToggle.textContent = '';
            incToggle.appendChild(input);
            input.focus();
            input.select();
            const commit = () => {
                const parsed = parseHourInput(input.value);
                let totalMin = 90;
                if (parsed) {
                    totalMin = Math.min(HOUR_INCREMENT_MAX, Math.max(HOUR_INCREMENT_MIN, parsed.h * 60 + parsed.m));
                }
                draftConfig!.hourIncrement = totalMin;
                setWeekConfig(draftConfig!);
                incToggle.textContent = formatHM(Math.floor(totalMin / 60), totalMin % 60);
                incEditing = false;
            };
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    input.blur();
                }
                if (ev.key === 'Escape') {
                    incEditing = false;
                    const cur = draftConfig!.hourIncrement || 90;
                    incToggle.textContent = formatHM(Math.floor(cur / 60), cur % 60);
                }
            });
        });
        leftCell.appendChild(setLabel);
        leftCell.appendChild(incToggle);
        topRow.appendChild(leftCell);

        // Right cell: recalc icon + "Aplicar" button (styled like hour-input, starts disabled)
        const rightCell = document.createElement('div');
        rightCell.className = 'planner-config__hour-row';
        const recalcIcon = document.createElement('span');
        recalcIcon.className = 'planner-config__hour-label';
        recalcIcon.innerHTML = '<i class="fas fa-sync-alt" aria-hidden="true"></i>';
        const recalcBtn = document.createElement('button');
        recalcBtn.type = 'button';
        recalcBtn.className = 'planner-config__hour-input planner-config__hour-recalc-btn';
        recalcBtn.textContent = t('hourApplyAll') || 'Aplicar';
        recalcBtn.title = t('hourApplyAllTitle');

        // Helper: activate contextual state (focused hour)
        function activateApply(idx: number) {
            _activeHourIdx = idx;
            recalcBtn.classList.add('is-apply-active');
            hourInputEls.forEach((el, i) => {
                if (i > idx) {
                    el.classList.add('is-apply-target');
                } else {
                    el.classList.remove('is-apply-target');
                }
            });
        }

        // Helper: deactivate contextual state (back to idle)
        function deactivateApply() {
            _activeHourIdx = null;
            recalcBtn.classList.remove('is-apply-active');
            hourInputEls.forEach((el) => el.classList.remove('is-apply-target'));
        }

        recalcBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (draftConfig!.hours.length < 2) return;

            // Determine start index: focused hour or first hour
            const startIdx = _activeHourIdx !== null ? _activeHourIdx : 0;
            const baseHour = draftConfig!.hours[startIdx];
            const parsed = parseHourInput(baseHour || '');
            if (!parsed) return;
            const curInc = draftConfig!.hourIncrement || 90;
            let baseMin = parsed.h * 60 + parsed.m;
            for (let i = startIdx + 1; i < draftConfig!.hours.length; i++) {
                baseMin += curInc;
                const h = Math.floor(baseMin / 60) % 24;
                const m = baseMin % 60;
                draftConfig!.hours[i] = formatHM(h, m);
            }
            const wasIdle = _activeHourIdx === null;
            setWeekConfig(draftConfig!);
            buildHoursInputs();
            render();
            // Flash affected inputs only when fired from idle (no focus)
            if (wasIdle) {
                requestAnimationFrame(() => {
                    const inputs = hoursInputs!.querySelectorAll(
                        '.planner-config__hour-grid .planner-config__hour-input:not(.planner-config__hour-preview)'
                    );
                    inputs.forEach((el, i) => {
                        if (i >= 1) {
                            el.classList.add('is-flash');
                            el.addEventListener('animationend', () => el.classList.remove('is-flash'), { once: true });
                        }
                    });
                });
            }
        });
        rightCell.appendChild(recalcIcon);
        rightCell.appendChild(recalcBtn);
        topRow.appendChild(rightCell);

        hoursInputs!.appendChild(topRow);

        // ── Hour inputs in pairs of 2 ──
        const grid = document.createElement('div');
        grid.className = 'planner-config__hour-grid';

        draftConfig!.hours.forEach((hour, idx) => {
            const cell = document.createElement('div');
            cell.className = 'planner-config__hour-row';

            const label = document.createElement('span');
            label.className = 'planner-config__hour-label';
            label.textContent = `${idx + 1}`;

            // Show delete icon on hover (any row, if above minimum)
            if (draftConfig!.hours.length > MIN_HOURS) {
                cell.classList.add('planner-config__hour-row--deletable');
                label.addEventListener('mouseenter', () => {
                    label.dataset.num = label.textContent;
                    label.innerHTML = '<i class="fas fa-times"></i>';
                    label.classList.add('planner-config__hour-label--remove');
                });
                label.addEventListener('mouseleave', () => {
                    label.textContent = label.dataset.num || `${idx + 1}`;
                    label.classList.remove('planner-config__hour-label--remove');
                });
                label.style.cursor = 'pointer';
                label.addEventListener('click', (e) => {
                    e.stopPropagation();
                    draftConfig!.hours.splice(idx, 1);
                    // En el borrador: Guardar lo deja como UNA entrada del historial y Cancelar lo devuelve.
                    draftConfig!.cellTexts = dropWeekSlot(draftConfig!.cellTexts || {}, idx);
                    setWeekConfig(draftConfig!);
                    buildHoursInputs();
                    render();
                });
            }

            const input = document.createElement('input');
            input.className = 'planner-config__hour-input';
            input.type = 'text';
            input.value = hour;
            input.maxLength = 5;
            hourInputEls.push(input);

            // On focus: activate contextual Aplicar from this hour
            input.addEventListener('focus', () => activateApply(idx));

            input.addEventListener('change', () => {
                const parsed = parseHourInput(input.value);
                if (parsed) {
                    const formatted = formatHM(parsed.h, parsed.m);
                    input.value = formatted;
                    draftConfig!.hours[idx] = formatted;
                } else {
                    draftConfig!.hours[idx] = input.value.trim();
                }
            });

            cell.appendChild(label);
            cell.appendChild(input);
            grid.appendChild(cell);
        });

        // Preview slot: shows next hour as a ghost input; click to commit
        if (draftConfig!.hours.length < MAX_HOURS) {
            const lastHour = draftConfig!.hours[draftConfig!.hours.length - 1] || '';
            const parsed = parseHourInput(lastHour);
            const curInc = draftConfig!.hourIncrement || 90;
            let nextHour = '';
            if (parsed) {
                const totalMin = parsed.h * 60 + parsed.m + curInc;
                nextHour = formatHM(Math.floor(totalMin / 60) % 24, totalMin % 60);
            }

            const addCell = document.createElement('div');
            addCell.className = 'planner-config__hour-row';

            const addIcon = document.createElement('span');
            addIcon.className = 'planner-config__hour-label planner-config__hour-label--add';
            addIcon.innerHTML = '<i class="fas fa-plus"></i>';
            addIcon.style.cursor = 'pointer';
            addIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                draftConfig!.hours.push(nextHour);
                setWeekConfig(draftConfig!);
                buildHoursInputs();
                render();
            });

            const preview = document.createElement('input');
            preview.type = 'text';
            preview.className = 'planner-config__hour-input planner-config__hour-preview';
            preview.value = nextHour;
            preview.maxLength = 5;
            preview.readOnly = true;
            preview.addEventListener('click', (e) => {
                e.stopPropagation();
                draftConfig!.hours.push(nextHour);
                setWeekConfig(draftConfig!);
                buildHoursInputs();
                render();
                // Focus the newly added input
                const lastInput = hoursInputs!.querySelector<HTMLInputElement>(
                    '.planner-config__hour-grid .planner-config__hour-row:nth-last-child(2) .planner-config__hour-input'
                );
                if (lastInput) lastInput.focus();
            });

            addCell.appendChild(addIcon);
            addCell.appendChild(preview);
            grid.appendChild(addCell);
        }

        hoursInputs!.appendChild(grid);

        // Deactivate contextual Aplicar when clicking/focusing anywhere
        // outside an hour input (works across the entire document)
        const onOutsideClick = (e: MouseEvent) => {
            if (_activeHourIdx === null) return;
            const target = e.target as HTMLElement;
            if (target.closest('.planner-config__hour-input') || target.closest('.planner-config__hour-label--remove'))
                return;
            deactivateApply();
        };
        document.addEventListener('click', onOutsideClick, true);
        _cleanupApplyListener = () => document.removeEventListener('click', onOutsideClick, true);
    }

    // ── Close on outside mousedown ──
    document.addEventListener('mousedown', (e) => {
        if (!panelStore.isOpen('config')) return;
        const inPanel = configPanel!.contains(e.target as Node);
        const inToolbar = $id('plannerToolbar')?.contains(e.target as Node);
        // El panel del widget compartido se cuelga de <body>, o sea FUERA de #configPanel: sin
        // este guard, elegir una comunidad cerraría el panel de config (y cancelaría).
        const inDropdown = (e.target as HTMLElement | null)?.closest('.edt-ss-panel');
        if (!inPanel && !inToolbar && !inDropdown) {
            closeConfig();
        }
    });

    // ── Escape key ──
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelStore.isOpen('config')) closeConfig();
    });
    // Expose the text-edit handles and closeConfig back to the controller.
    return {
        closeConfig,
        enterWeeklyCellEditMode: _textEdit.enterWeeklyCellEditMode,
        enterPlannerTextEditMode: _textEdit.enterPlannerTextEditMode,
        enterMonthlyCellEditMode: _textEdit.enterMonthlyCellEditMode,
        enterQuarterlyCellEditMode: _textEdit.enterQuarterlyCellEditMode,
        exitTextEditFn: _textEdit.exitCurrentMode,
    };
}
