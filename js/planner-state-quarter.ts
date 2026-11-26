import { setItemDebounced } from '@core/storage/debounced-storage.ts';
import { sanQuarter } from './planner-sanitize.ts';
import type { QuarterConfig } from './planner-types.ts';

const DEFAULT_QUARTER_CONFIG: QuarterConfig = {
    showTitle: true,
    titleText: '',
    titleAlign: 'center',
    showWatermark: true,
    showDayAbbrev: true,
    showHolidays: true,
    showWeekNumbers: true,
};

let quarterConfig = { ...DEFAULT_QUARTER_CONFIG };

export function loadQuarterConfig() {
    try {
        const saved = localStorage.getItem('planner-quarter-config');
        // Listas cerradas: titleAlign acaba en el HTML del folio, y localStorage no pasa por el códec.
        if (saved) quarterConfig = sanQuarter(JSON.parse(saved), DEFAULT_QUARTER_CONFIG);
    } catch {
        /* ignore */
    }
}

export function saveQuarterConfig() {
    // Strip props prefixed with `_` (runtime injections like _vacationDays, _quarterlyTexts).
    const clean: Record<string, unknown> = {};
    Object.keys(quarterConfig).forEach((k) => {
        if (!k.startsWith('_')) clean[k] = (quarterConfig as Record<string, unknown>)[k];
    });
    setItemDebounced('planner-quarter-config', JSON.stringify(clean));
}

export function getQuarterConfig() {
    return quarterConfig;
}

export function setQuarterConfig(config: QuarterConfig) {
    quarterConfig = config;
    saveQuarterConfig();
}

export function getDefaultQuarterConfig() {
    return { ...DEFAULT_QUARTER_CONFIG };
}
