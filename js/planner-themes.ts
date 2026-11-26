export type ThemeFont = { heading: string; body: string; headingWeight: number; lineWeight: number };
export type Theme = { labelKey: string; bg: string; text: string; months: string[]; font: ThemeFont };
export type TextStyle = { label: string; heading: string; body: string; headingWeight: number; lineWeight: number };
export type FontDefault = { titleSize: number; textSize: number; titleSizeOffset: number; textSizeOffset: number };

const _THEMES = {
    // 0 — Blanco
    mono: {
        labelKey: 'themeMono',
        bg: '#ffffff',
        text: '#111111',
        months: [
            '#616161',
            '#757575',
            '#555555',
            '#888888',
            '#9E9E9E',
            '#6E6E6E',
            '#616161',
            '#757575',
            '#4E4E4E',
            '#616161',
            '#757575',
            '#555555',
        ],
        font: {
            heading: "'Noto Serif', Georgia, serif",
            body: "'Noto Serif', Georgia, serif",
            headingWeight: 700,
            lineWeight: 1,
        },
    },
    // 1 — Clásico
    classic: {
        labelKey: 'themeClassic',
        bg: '#faf9f6',
        text: '#3d3a34',
        months: [
            '#1976D2',
            '#5DADE2',
            '#48C9B0',
            '#52BE80',
            '#27AE60',
            '#D4AC0D',
            '#F39C12',
            '#E74C3C',
            '#E67E22',
            '#C0392B',
            '#8E44AD',
            '#5B2C6F',
        ],
        font: {
            heading: "'Noto Serif', Georgia, serif",
            body: "'Noto Serif', Georgia, serif",
            headingWeight: 700,
            lineWeight: 1,
        },
    },
    // 2 — Océano
    ocean: {
        labelKey: 'themeOcean',
        bg: '#e8f0fe',
        text: '#1a3c6e',
        months: [
            '#0D47A1',
            '#1976D2',
            '#0288D1',
            '#0097A7',
            '#00838F',
            '#00796B',
            '#2E7D32',
            '#1565C0',
            '#0277BD',
            '#01579B',
            '#283593',
            '#1A237E',
        ],
        font: {
            heading: "'Indie Flower', cursive",
            body: "'Indie Flower', cursive",
            headingWeight: 700,
            lineWeight: 1,
        },
    },
    // 3 — Menta
    mint: {
        labelKey: 'themeMint',
        bg: '#e0f7f5',
        text: '#00695c',
        months: [
            '#00796B',
            '#00897B',
            '#009688',
            '#26A69A',
            '#4DB6AC',
            '#00796B',
            '#00695C',
            '#004D40',
            '#00838F',
            '#006064',
            '#00796B',
            '#004D40',
        ],
        font: {
            heading: "'Roboto', -apple-system, sans-serif",
            body: "'Roboto', -apple-system, sans-serif",
            headingWeight: 700,
            lineWeight: 0.7,
        },
    },
    // 4 — Pizarra
    slate: {
        labelKey: 'themeSlate',
        bg: '#ECEFF1',
        text: '#263238',
        months: [
            '#607D8B',
            '#546E7A',
            '#78909C',
            '#8C9DA6',
            '#7B8D99',
            '#6D7B8D',
            '#78909C',
            '#546E7A',
            '#607D8B',
            '#546E7A',
            '#6D7B8D',
            '#455A64',
        ],
        font: {
            heading: "'Lato', -apple-system, sans-serif",
            body: "'Lato', -apple-system, sans-serif",
            headingWeight: 700,
            lineWeight: 0.7,
        },
    },
    // 5 — Plomo
    lead: {
        labelKey: 'themeLead',
        bg: '#D8E1E5',
        text: '#424242',
        months: [
            '#4E4E4E',
            '#3E3E3E',
            '#5C5C5C',
            '#6E6E6E',
            '#4E4E4E',
            '#3E3E3E',
            '#333333',
            '#4E4E4E',
            '#5C5C5C',
            '#3E3E3E',
            '#4E4E4E',
            '#333333',
        ],
        font: {
            heading: "'Courier Prime', 'Courier New', monospace",
            body: "'Courier Prime', 'Courier New', monospace",
            headingWeight: 700,
            lineWeight: 0.8,
        },
    },
    // 6 — Cian
    cyan: {
        labelKey: 'themeCyan',
        bg: '#E8F9FB',
        text: '#006064',
        months: [
            '#00838F',
            '#006064',
            '#0097A7',
            '#00ACC1',
            '#00838F',
            '#006064',
            '#00697A',
            '#005662',
            '#00838F',
            '#006064',
            '#0097A7',
            '#005662',
        ],
        font: { heading: "'Caveat', cursive", body: "'Caveat', cursive", headingWeight: 700, lineWeight: 1 },
    },
    // 7 — Arcilla
    clay: {
        labelKey: 'themeClay',
        bg: '#F0EBE6',
        text: '#3E2723',
        months: [
            '#00838F',
            '#006064',
            '#0097A7',
            '#00ACC1',
            '#00838F',
            '#006064',
            '#004D40',
            '#00838F',
            '#0097A7',
            '#006064',
            '#00838F',
            '#004D40',
        ],
        font: {
            heading: "'Playfair Display', Georgia, serif",
            body: "'Playfair Display', Georgia, serif",
            headingWeight: 900,
            lineWeight: 1,
        },
    },
    // 8 — Bosque
    forest: {
        labelKey: 'themeForest',
        bg: '#e6f4ea',
        text: '#1b5e20',
        months: [
            '#2E7D32',
            '#388E3C',
            '#43A047',
            '#4CAF50',
            '#66BB6A',
            '#558B2F',
            '#689F38',
            '#7CB342',
            '#33691E',
            '#2E7D32',
            '#1B5E20',
            '#004D40',
        ],
        font: {
            heading: "'Open Sans', -apple-system, sans-serif",
            body: "'Open Sans', -apple-system, sans-serif",
            headingWeight: 700,
            lineWeight: 0.7,
        },
    },
    // 9 — Lavanda
    lavender: {
        labelKey: 'themeLavender',
        bg: '#F7EFFD',
        text: '#4a148c',
        months: [
            '#6A1B9A',
            '#7B1FA2',
            '#8E24AA',
            '#9C27B0',
            '#AB47BC',
            '#7B1FA2',
            '#6A1B9A',
            '#4A148C',
            '#5E35B1',
            '#512DA8',
            '#4527A0',
            '#311B92',
        ],
        font: { heading: "'Caveat', cursive", body: "'Caveat', cursive", headingWeight: 700, lineWeight: 1 },
    },
    // 10 — Rojo
    red: {
        labelKey: 'themeRed',
        bg: '#FDF0EE',
        text: '#9A0007',
        months: [
            '#9A0007',
            '#C62828',
            '#D32F2F',
            '#E53935',
            '#EF5350',
            '#D32F2F',
            '#C62828',
            '#9A0007',
            '#B71C1C',
            '#C62828',
            '#9A0007',
            '#880E4F',
        ],
        font: {
            heading: "'Indie Flower', cursive",
            body: "'Indie Flower', cursive",
            headingWeight: 700,
            lineWeight: 1,
        },
    },
    // 11 — Melocotón
    peach: {
        labelKey: 'themePeach',
        bg: '#FFF8F0',
        text: '#BF4400',
        months: [
            '#BF4400',
            '#C75A00',
            '#D06A10',
            '#D87A20',
            '#C75A00',
            '#BF4400',
            '#A83A00',
            '#9E3000',
            '#BF4400',
            '#C75A00',
            '#D06A10',
            '#A83A00',
        ],
        font: {
            heading: "'Merriweather', Georgia, serif",
            body: "'Merriweather', Georgia, serif",
            headingWeight: 700,
            lineWeight: 0.8,
        },
    },
    // 12 — Oliva
    olive: {
        labelKey: 'themeOlive',
        bg: '#F5FAF0',
        text: '#33691E',
        months: [
            '#4E7A27',
            '#3D6B1E',
            '#5C8A30',
            '#6B9A3C',
            '#4E7A27',
            '#3D6B1E',
            '#2E5A15',
            '#33691E',
            '#4E7A27',
            '#3D6B1E',
            '#5C8A30',
            '#2E5A15',
        ],
        font: { heading: "'Pacifico', cursive", body: "'Pacifico', cursive", headingWeight: 400, lineWeight: 1 },
    },
    // 13 — Rosa
    pink: {
        labelKey: 'themePink',
        bg: '#FFF7F8',
        text: '#C2185B',
        months: [
            '#EC407A',
            '#E91E63',
            '#F06292',
            '#F48FB1',
            '#EC407A',
            '#E91E63',
            '#D81B60',
            '#C2185B',
            '#EC407A',
            '#E91E63',
            '#F06292',
            '#C2185B',
        ],
        font: {
            heading: "'Dancing Script', cursive",
            body: "'Dancing Script', cursive",
            headingWeight: 700,
            lineWeight: 1,
        },
    },
    // 14 — Magenta
    magenta: {
        labelKey: 'themeMagenta',
        bg: '#FDEDF2',
        text: '#AD1457',
        months: [
            '#D81B60',
            '#C2185B',
            '#E91E63',
            '#F06292',
            '#D81B60',
            '#C2185B',
            '#AD1457',
            '#880E4F',
            '#D81B60',
            '#C2185B',
            '#E91E63',
            '#AD1457',
        ],
        font: { heading: "'Caveat', cursive", body: "'Caveat', cursive", headingWeight: 700, lineWeight: 1 },
    },
    // 15 — Café
    coffee: {
        labelKey: 'themeCoffee',
        bg: '#E6DDD9',
        text: '#4E342E',
        months: [
            '#6D4C41',
            '#5D4037',
            '#795548',
            '#8D6E63',
            '#A1887F',
            '#795548',
            '#6D4C41',
            '#5D4037',
            '#4E342E',
            '#6D4C41',
            '#795548',
            '#5D4037',
        ],
        font: {
            heading: "'Playfair Display', Georgia, serif",
            body: "'Playfair Display', Georgia, serif",
            headingWeight: 900,
            lineWeight: 1,
        },
    },
    // 16 — Lila (pastel lavender)
    lilac: {
        labelKey: 'themeLilac',
        bg: '#F3ECF8',
        text: '#5E3580',
        months: [
            '#9575CD',
            '#7E57C2',
            '#B39DDB',
            '#CE93D8',
            '#BA68C8',
            '#AB47BC',
            '#9575CD',
            '#7E57C2',
            '#B39DDB',
            '#AB47BC',
            '#9575CD',
            '#7E57C2',
        ],
        font: {
            heading: "'Caveat', cursive",
            body: "'Caveat', cursive",
            headingWeight: 700,
            lineWeight: 1,
        },
    },
};

/**
 * Display order for theme cards, text-color, and bg-color swatches in the UI.
 * Maps visual grid position → theme key.
 */
export const DISPLAY_ORDER = [
    'mono',
    'classic',
    'slate',
    'lead',
    'clay',
    'coffee',
    'peach',
    'lavender',
    'ocean',
    'cyan',
    'mint',
    'forest',
    'olive',
    'red',
    'magenta',
    'pink',
];

/**
 * Display order for accent swatches (quarterly/monthly/weekly/planner).
 * Grouped by temperature/tone.
 */
export const DISPLAY_ORDER_ACCENT = [
    'mono',
    'classic',
    'slate',
    'lead',
    'coffee',
    'ocean',
    'cyan',
    'mint',
    'lavender',
    'lilac',
    'red',
    'peach',
    'magenta',
    'pink',
    'forest',
    'olive',
];

/**
 * Text style presets: heading font, body font, heading weight, line-weight factor.
 */
const _TEXT_STYLES = {
    notoSerif: {
        label: 'Noto Serif',
        heading: "'Noto Serif', Georgia, serif",
        body: "'Noto Serif', Georgia, serif",
        headingWeight: 700,
        lineWeight: 1,
    },
    playfair: {
        label: 'Playfair',
        heading: "'Playfair Display', Georgia, serif",
        body: "'Playfair Display', Georgia, serif",
        headingWeight: 900,
        lineWeight: 1,
    },
    roboto: {
        label: 'Roboto',
        heading: "'Roboto', -apple-system, sans-serif",
        body: "'Roboto', -apple-system, sans-serif",
        headingWeight: 700,
        lineWeight: 0.7,
    },
    lato: {
        label: 'Lato',
        heading: "'Lato', -apple-system, sans-serif",
        body: "'Lato', -apple-system, sans-serif",
        headingWeight: 700,
        lineWeight: 0.7,
    },
    merriweather: {
        label: 'Merriweather',
        heading: "'Merriweather', Georgia, serif",
        body: "'Merriweather', Georgia, serif",
        headingWeight: 700,
        lineWeight: 0.8,
    },
    openSans: {
        label: 'Open Sans',
        heading: "'Open Sans', -apple-system, sans-serif",
        body: "'Open Sans', -apple-system, sans-serif",
        headingWeight: 700,
        lineWeight: 0.7,
    },
    dancingScript: {
        label: 'Dancing Script',
        heading: "'Dancing Script', cursive",
        body: "'Dancing Script', cursive",
        headingWeight: 700,
        lineWeight: 1,
    },
    indieFlower: {
        label: 'Indie Flower',
        heading: "'Indie Flower', cursive",
        body: "'Indie Flower', cursive",
        headingWeight: 700,
        lineWeight: 1,
    },
    caveat: {
        label: 'Caveat',
        heading: "'Caveat', cursive",
        body: "'Caveat', cursive",
        headingWeight: 700,
        lineWeight: 1,
    },
    pacifico: {
        label: 'Pacifico',
        heading: "'Pacifico', cursive",
        body: "'Pacifico', cursive",
        headingWeight: 400,
        lineWeight: 1,
    },
    courierPrime: {
        label: 'Courier Prime',
        heading: "'Courier Prime', 'Courier New', monospace",
        body: "'Courier Prime', 'Courier New', monospace",
        headingWeight: 700,
        lineWeight: 0.8,
    },
};

/** Per-font default title/text size offsets (display = 8 for all; internal = 8 + offset) */
const _FONT_DEFAULTS = {
    notoSerif: { titleSize: 8, textSize: 8, titleSizeOffset: 2, textSizeOffset: 0 },
    playfair: { titleSize: 8, textSize: 8, titleSizeOffset: 3, textSizeOffset: 2 },
    roboto: { titleSize: 8, textSize: 8, titleSizeOffset: 3, textSizeOffset: 0 },
    lato: { titleSize: 8, textSize: 8, titleSizeOffset: 3, textSizeOffset: 0 },
    merriweather: { titleSize: 8, textSize: 8, titleSizeOffset: 0, textSizeOffset: 0 },
    openSans: { titleSize: 8, textSize: 8, titleSizeOffset: 3, textSizeOffset: 1 },
    dancingScript: { titleSize: 8, textSize: 8, titleSizeOffset: 2, textSizeOffset: 9 },
    indieFlower: { titleSize: 8, textSize: 8, titleSizeOffset: 8, textSizeOffset: 6 },
    caveat: { titleSize: 8, textSize: 8, titleSizeOffset: 10, textSizeOffset: 16 },
    pacifico: { titleSize: 8, textSize: 8, titleSizeOffset: 4, textSizeOffset: 4 },
    courierPrime: { titleSize: 8, textSize: 8, titleSizeOffset: 2, textSizeOffset: 0 },
};

/** Resolve the effective font key from explicit textStyle or theme default */
export function getEffectiveFontKey(config: { textStyle?: string | null; theme?: string | null }): string {
    if (config.textStyle && TEXT_STYLES[config.textStyle]) return config.textStyle;
    const theme = THEMES[config.theme || 'classic'];
    const heading = theme?.font?.heading || '';
    for (const [key, style] of Object.entries(TEXT_STYLES)) {
        if (style.heading === heading) return key;
    }
    return 'notoSerif';
}

// Acceso con nombre → tipo exacto; acceso dinámico (config.theme) → | undefined, como pide
// noUncheckedIndexedAccess. La intersección da las dos cosas sin castear en los consumidores.
export const THEMES: Record<string, Theme> & typeof _THEMES = _THEMES;
export const TEXT_STYLES: Record<string, TextStyle> & typeof _TEXT_STYLES = _TEXT_STYLES;
export const FONT_DEFAULTS: Record<string, FontDefault> & typeof _FONT_DEFAULTS = _FONT_DEFAULTS;
