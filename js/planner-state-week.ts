import { setItemDebounced } from '@core/storage/debounced-storage.ts';
import { keepText, sanWeek, WEEK_CELL_KEY } from './planner-sanitize.ts';
import type { CellTexts, WeekConfig } from './planner-types.ts';

const DEFAULT_WEEK_CONFIG: WeekConfig = {
    days: [0, 1, 2, 3, 4], // 0=Mon ... 6=Sun
    hours: ['8:00', '9:30', '11:30', '13:00', '15:00', '16:30'],
    hourIncrement: 90, // minutes to add when creating a new hour range
    showTitle: true,
    titleText: '',
    hourAlign: 'middle', // 'top' | 'middle' | 'bottom'
    accentColor: null, // null = use theme default, or hex string
    cellTexts: {}, // keyed by "dayIdx-hourIdx", value: { text, color, bold }
};

let weekConfig: WeekConfig = {
    ...DEFAULT_WEEK_CONFIG,
    days: [...DEFAULT_WEEK_CONFIG.days],
    hours: [...DEFAULT_WEEK_CONFIG.hours],
    cellTexts: {},
};

// localStorage no pasa por el códec: días, alineación y colores acaban en atributos del HTML del horario.
export function loadWeekConfig() {
    try {
        const saved = localStorage.getItem('planner-week-config');
        if (saved) {
            const parsed = JSON.parse(saved) as Record<string, unknown> | null;
            if (parsed && Array.isArray(parsed.days) && Array.isArray(parsed.hours)) {
                weekConfig = sanWeek(parsed, getDefaultWeekConfig(), keepText);
            }
        }
    } catch {
        /* ignore */
    }
}

// Las claves son «día-franja» por POSICIÓN: al borrar una franja se van sus textos y los de debajo suben con ella.
export function dropWeekSlot(cellTexts: CellTexts, slot: number): CellTexts {
    const out: CellTexts = {};
    for (const [key, cell] of Object.entries(cellTexts)) {
        const [day, s] = key.split('-').map(Number);
        if (!WEEK_CELL_KEY.test(key) || s === undefined || s < slot) out[key] = cell;
        else if (s > slot) out[`${day}-${s - 1}`] = cell;
    }
    return out;
}

export function saveWeekConfig() {
    setItemDebounced('planner-week-config', JSON.stringify(weekConfig));
}

export function getWeekConfig() {
    return weekConfig;
}

export function setWeekConfig(config: WeekConfig) {
    weekConfig = config;
    saveWeekConfig();
}

export function getDefaultWeekConfig() {
    return {
        ...DEFAULT_WEEK_CONFIG,
        days: [...DEFAULT_WEEK_CONFIG.days],
        hours: [...DEFAULT_WEEK_CONFIG.hours],
        cellTexts: {},
    };
}
