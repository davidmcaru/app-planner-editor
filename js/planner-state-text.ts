import { setItemDebounced } from '@core/storage/debounced-storage.ts';
import { getDesignConfig } from './planner-state-design.ts';
import { sanText } from './planner-sanitize.ts';
import type { TextConfig } from './planner-types.ts';

const DEFAULT_TEXT_CONFIG: TextConfig = {
    textColor: null, // null OR hex — color of user-added text
    bgColor: null, // null OR hex — background color (disabled for planner)
    textSize: 8, // offset numérico entre SIZE_MIN y SIZE_MAX (planner-sanitize.ts)
    boldText: null, // null | 'bold' | 'light'
    textStyle: null, // null OR string key from TEXT_STYLES
    overrideFormats: false, // ON = force default format (no bold/italic/underline/strike), OFF = respect cell formatting
    overrideAccent: false, // ON = force accent color on all cells, OFF = respect cell custom colors
    overrideLibres: false, // ON = hide all libre/vacation marks, OFF = respect cell vacation state
    overrideFestivos: false, // ON = OCULTA el nombre de todos los festivos; OFF = respeta el hideHoliday de cada celda
};

let textConfig = { ...DEFAULT_TEXT_CONFIG };

export function loadTextConfig() {
    try {
        const saved = localStorage.getItem('planner-text-config');
        if (saved) {
            const parsed = JSON.parse(saved) as Partial<TextConfig> | null;
            if (parsed && typeof parsed.boldText === 'boolean') parsed.boldText = parsed.boldText ? 'bold' : null;
            textConfig = sanText(parsed, DEFAULT_TEXT_CONFIG);
        } else {
            // ── Migration: copy text-related fields from the IN-MEMORY design
            // config (loadDesignConfig() runs before loadTextConfig()).
            // Re-reading `planner-design-config` from storage races the debounced
            // write and reads PRE-migration values — seeding boldText as a boolean
            // or textSize 0. The in-memory config is already migrated. ──
            const dc = getDesignConfig();
            if (dc) {
                const migrated = { ...DEFAULT_TEXT_CONFIG };
                if (dc.textSize !== undefined && dc.textSize !== null) migrated.textSize = dc.textSize;
                if (dc.boldText !== undefined && dc.boldText !== null) migrated.boldText = dc.boldText;
                if (dc.textStyle !== undefined && dc.textStyle !== null) migrated.textStyle = dc.textStyle;
                textConfig = migrated;
                saveTextConfig();
            }
        }
    } catch {
        /* ignore */
    }
}

export function saveTextConfig() {
    setItemDebounced('planner-text-config', JSON.stringify(textConfig));
}

export function getTextConfig() {
    return textConfig;
}

export function setTextConfig(config: TextConfig) {
    textConfig = config;
    saveTextConfig();
}

export function getDefaultTextConfig() {
    return { ...DEFAULT_TEXT_CONFIG };
}
