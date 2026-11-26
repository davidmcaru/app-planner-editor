import { setItemDebounced } from '@core/storage/debounced-storage.ts';
import { sanHolidays } from './planner-sanitize.ts';
import { saveQuarterConfig } from './planner-state-quarter.ts';
import type { HolidaysConfig } from './planner-types.ts';

const DEFAULT_HOLIDAYS_CONFIG: HolidaysConfig = {
    ccaa: 'AND',
    province: 'AND-MA',
};

let holidaysConfig = { ...DEFAULT_HOLIDAYS_CONFIG };

export function loadHolidaysConfig() {
    try {
        const saved = localStorage.getItem('planner-holidays-config');
        if (saved) {
            const parsed = JSON.parse(saved);
            holidaysConfig = sanHolidays({ ...DEFAULT_HOLIDAYS_CONFIG, ...parsed }, DEFAULT_HOLIDAYS_CONFIG);
        } else {
            // Migrate from old quarterConfig if holidays not yet saved
            const oldQc = localStorage.getItem('planner-quarter-config');
            if (oldQc) {
                const parsed = JSON.parse(oldQc);
                if (parsed.ccaa || parsed.province) {
                    holidaysConfig = sanHolidays(
                        {
                            ccaa: parsed.ccaa || DEFAULT_HOLIDAYS_CONFIG.ccaa,
                            province: parsed.province || DEFAULT_HOLIDAYS_CONFIG.province,
                        },
                        DEFAULT_HOLIDAYS_CONFIG
                    );
                    saveHolidaysConfig();
                    // Purge legacy ccaa/province from quarter-config so this
                    // migration branch is never re-entered on subsequent loads.
                    // `quarterConfig` (in memory) was already stripped by
                    // loadQuarterConfig(), so a plain save persists the cleanup.
                    saveQuarterConfig();
                }
            }
        }
    } catch {
        /* ignore */
    }
}

export function saveHolidaysConfig() {
    setItemDebounced('planner-holidays-config', JSON.stringify(holidaysConfig));
}

export function getHolidaysConfig() {
    return holidaysConfig;
}

export function setHolidaysConfig(config: HolidaysConfig) {
    holidaysConfig = config;
    saveHolidaysConfig();
}

export function getDefaultHolidaysConfig() {
    return { ...DEFAULT_HOLIDAYS_CONFIG };
}
