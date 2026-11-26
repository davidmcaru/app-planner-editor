import { setItemDebounced } from '@core/storage/debounced-storage.ts';
import { sanMonthlyCal } from './planner-sanitize.ts';
import type { MonthlyCalConfig } from './planner-types.ts';

const DEFAULT_MONTHLY_CAL_CONFIG: MonthlyCalConfig = {
    showTitle: true,
    showMiniCalLeft: false,
    showMiniCalRight: true,
    showNotes: true,
    monthYearAlign: 'center',
    showWatermark: true,
    showOverflow: true,
    showDayAbbrev: true,
    showWeekNumbers: true,
    showHolidays: true,
    weekendShading: true,
};

let monthlyCalConfig = { ...DEFAULT_MONTHLY_CAL_CONFIG };

export function loadMonthlyCalConfig() {
    try {
        const saved = localStorage.getItem('planner-monthly-cal-config');
        if (saved) {
            const parsed = JSON.parse(saved) as Partial<MonthlyCalConfig> & Record<string, unknown>;
            // Purga de basura de runtime ya persistida: ccaa/province viven en
            // holidaysConfig y los _campos se inyectan en cada render.
            const sucio =
                'ccaa' in parsed || 'province' in parsed || Object.keys(parsed).some((k) => k.startsWith('_'));
            delete parsed.ccaa;
            delete parsed.province;
            Object.keys(parsed).forEach((k) => {
                if (k.startsWith('_')) delete parsed[k];
            });
            // Migrate old showMiniCal → showMiniCalLeft/showMiniCalRight
            if ('showMiniCal' in parsed && !('showMiniCalLeft' in parsed)) {
                parsed.showMiniCalLeft = parsed.showMiniCal as boolean;
                parsed.showMiniCalRight = false;
                delete parsed.showMiniCal;
            }
            // Listas cerradas: monthYearAlign acaba en el HTML del folio y localStorage no pasa por el códec.
            monthlyCalConfig = sanMonthlyCal(parsed, DEFAULT_MONTHLY_CAL_CONFIG);
            // Re-escribir limpio: sin esto la clave sirve la basura de vuelta en cada arranque.
            if (sucio) saveMonthlyCalConfig();
        }
    } catch {
        /* ignore */
    }
}

export function saveMonthlyCalConfig() {
    // Strip props prefixed with `_` (runtime injections like _vacationDays).
    const clean: Record<string, unknown> = {};
    Object.keys(monthlyCalConfig).forEach((k) => {
        if (!k.startsWith('_')) clean[k] = (monthlyCalConfig as Record<string, unknown>)[k];
    });
    setItemDebounced('planner-monthly-cal-config', JSON.stringify(clean));
}

export function getMonthlyCalConfig() {
    return monthlyCalConfig;
}

export function setMonthlyCalConfig(config: MonthlyCalConfig) {
    monthlyCalConfig = config;
    saveMonthlyCalConfig();
}

export function getDefaultMonthlyCalConfig() {
    return { ...DEFAULT_MONTHLY_CAL_CONFIG };
}
