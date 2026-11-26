import type { Theme, ThemePreference } from '@core/types.ts';

export const THEME_STORAGE_KEY = 'theme-preference';
// Si el navegador no deja guardar (datos bloqueados, cuota), la preferencia vive aquí o la luna dejaría de cambiar
let enMemoria: ThemePreference | null = null;

export function getSystemTheme(): Theme {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ⚠️ localStorage es texto arbitrario: un cast propagaba un tema inexistente al DOM sin un error
export function readPreference(): ThemePreference {
    if (enMemoria) return enMemoria;
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        return saved === 'light' || saved === 'dark' ? saved : 'auto';
    } catch (_e) {
        console.warn('[Theme] localStorage not available:', _e);
        return 'auto';
    }
}

export const resolveTheme = (): Theme => {
    const pref = readPreference();
    return pref === 'auto' ? getSystemTheme() : pref;
};

// ⚠️ El mismo color que applyTheme pone en el <html>: si divergen, la barra no casa con la página
const THEME_COLORS: Record<Theme, string> = {
    light: '#ffffff',
    dark: '#0a0a0a',
};

// ⚠️ Por JS y no con <meta media>: la media query solo ve el sistema, no el toggle (README del tema)
function syncThemeColorMeta(theme: Theme): void {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.content = THEME_COLORS[theme];
}

export function applyTheme(theme: Theme): void {
    const root = document.documentElement;
    const body = document.body;
    const dark = theme === 'dark';
    for (const el of [root, body]) {
        el.classList.toggle('dark-mode', dark);
        el.classList.toggle('force-dark', dark);
        el.classList.toggle('force-light', !dark);
    }
    root.style.colorScheme = dark ? 'dark' : 'only light'; // sin 'only', Samsung Internet repinta la página con su modo oscuro
    root.style.backgroundColor = dark ? '#0a0a0a' : '';
    syncThemeColorMeta(theme);
    try {
        window.dispatchEvent(new CustomEvent<ThemeChangeDetail>('themechange', { detail: { theme } }));
    } catch (_e) {
        console.warn('[Theme] Could not dispatch event:', _e);
    }
}

// [aria-label, title] según el tema de AHORA. ⚠️ Castellano o, con otro <html lang>, inglés, como la cabecera
// (layout-i18n.ts), que la repinta al cambiar el idioma
const ETIQUETAS: Record<'es' | 'en', Record<Theme, [string, string]>> = {
    es: { dark: ['Cambiar a modo claro', 'Modo claro'], light: ['Cambiar a modo oscuro', 'Modo oscuro'] },
    en: { dark: ['Switch to light mode', 'Light mode'], light: ['Switch to dark mode', 'Dark mode'] },
};

// En oscuro, la bombilla y no el sol: junto al engranaje de Ajustes, el sol parecía otro
export function paintToggleButtons(theme: Theme): void {
    const button = document.getElementById('theme-toggle');
    const icon = button?.querySelector('i');
    if (!button || !icon) return;
    icon.classList.remove('fa-sun', 'fa-moon', 'fa-lightbulb');
    icon.classList.add(theme === 'dark' ? 'fa-lightbulb' : 'fa-moon');
    const [aria, title] = ETIQUETAS[document.documentElement.lang === 'es' ? 'es' : 'en'][theme];
    button.setAttribute('aria-label', aria);
    button.setAttribute('title', title);
}

export function setPreference(pref: ThemePreference): void {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, pref);
        enMemoria = null;
    } catch (_e) {
        enMemoria = pref;
    }
    const theme = resolveTheme();
    applyTheme(theme);
    paintToggleButtons(theme);
}

let vigilando = false;
export function vigilarTema(): void {
    if (vigilando) return;
    vigilando = true;
    const reaplicar = (): void => {
        const theme = resolveTheme();
        applyTheme(theme);
        paintToggleButtons(theme);
    };
    window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === THEME_STORAGE_KEY || e.key === null) reaplicar();
    });
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (readPreference() === 'auto') reaplicar();
    });
}
