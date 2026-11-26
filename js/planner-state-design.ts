import { setItemDebounced } from '@core/storage/debounced-storage.ts';
import { sanDesign } from './planner-sanitize.ts';
import type { BoldMode, DesignConfig } from './planner-types.ts';

const DEFAULT_DESIGN_CONFIG: DesignConfig = {
    theme: 'classic',
    bgColor: null, // null = use theme's background
    textColor: null, // null = use theme default
    textStyle: null, // null = use theme's font
    accentPalette: null, // null = use theme's own month palette for quarterly accents
    weeklyAccent: '#1976D2', // hex string for weekly schedule accent (matches classic.months[0])
    weeklyAccentKey: null, // theme key for disambiguation when multiple themes share months[0]
    plannerAccent: '#1976D2', // hex string for planner section text accent (matches classic.months[0])
    plannerAccentKey: null, // theme key for disambiguation when multiple themes share months[0]
    titleSize: 10, // offset for headings/labels (default matches classic/notoSerif)
    textSize: 8, // offset for body text/numbers (default matches classic/notoSerif)
    boldTitle: null, // null = font default, 'bold' = force 700, 'light' = force 400
    boldText: null, // null = font default, 'bold' = force 700, 'light' = force 400
};

let designConfig = { ...DEFAULT_DESIGN_CONFIG };

export function loadDesignConfig() {
    try {
        const saved = localStorage.getItem('planner-design-config');
        if (saved) {
            const parsed = JSON.parse(saved) as Omit<Partial<DesignConfig>, 'boldText'> & {
                boldText?: BoldMode | boolean;
            };
            let migrated = false;
            // Solo la era boldText-booleano tenía defaults 0/0: hoy 0 es un tamaño elegible.
            const legacyEra = typeof parsed.boldText === 'boolean';
            // Migrate old boolean boldText → 3-state string
            if (parsed.boldText === true) {
                parsed.boldText = 'bold';
                migrated = true;
            } else if (parsed.boldText === false) {
                parsed.boldText = null;
                migrated = true;
            }
            // Migrate old default sizes (0/0 → 10/8 for notoSerif/classic)
            if (legacyEra && parsed.titleSize === 0) {
                parsed.titleSize = 10;
                migrated = true;
            }
            if (legacyEra && parsed.textSize === 0) {
                parsed.textSize = 8;
                migrated = true;
            }
            // Migrate null/legacy weeklyAccent → default classic blue
            if (!parsed.weeklyAccent || parsed.weeklyAccent === '#4A90D9') {
                parsed.weeklyAccent = '#1976D2';
                migrated = true;
            }
            // Migrate null/legacy plannerAccent → default classic blue
            if (!parsed.plannerAccent || parsed.plannerAccent === '#4A90D9') {
                parsed.plannerAccent = '#1976D2';
                migrated = true;
            }
            designConfig = sanDesign(parsed, DEFAULT_DESIGN_CONFIG);
            if (migrated) saveDesignConfig();
        }
    } catch {
        /* ignore */
    }
}

export function saveDesignConfig() {
    setItemDebounced('planner-design-config', JSON.stringify(designConfig));
}

export function getDesignConfig() {
    return designConfig;
}

export function setDesignConfig(config: DesignConfig) {
    designConfig = config;
    saveDesignConfig();
}

export function getDefaultDesignConfig() {
    return { ...DEFAULT_DESIGN_CONFIG };
}
