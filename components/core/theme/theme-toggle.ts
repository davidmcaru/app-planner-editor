import type { Theme } from '@core/types.ts';
import { applyTheme, paintToggleButtons, resolveTheme, setPreference, vigilarTema } from './theme-core.ts';

function toggleTheme(): void {
    setPreference(resolveTheme() === 'dark' ? 'light' : 'dark');
}

function initTheme(): void {
    const theme = resolveTheme();
    applyTheme(theme);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupToggleButton(theme);
            vigilarTema();
        });
    } else {
        setupToggleButton(theme);
        vigilarTema();
    }
}

function setupToggleButton(currentTheme: Theme): void {
    const buttons = [document.getElementById('theme-toggle')];

    buttons.forEach((button) => {
        if (!button) return;

        paintToggleButtons(currentTheme);

        button.addEventListener('click', toggleTheme);

        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleTheme();
            }
        });
    });
}

const ThemeToggle: ThemeToggleAPI = {
    toggle: toggleTheme,
    getTheme: resolveTheme,
    // 'auto' también vale: antes se aplicaba como si fuera un tema y la página quedaba en claro
    setTheme: (theme: string) => setPreference(theme === 'light' || theme === 'dark' ? theme : 'auto'),
    reset: () => setPreference('auto'),
    reinit: () => {
        setupToggleButton(resolveTheme());
    },
};

// Compatibilidad global (scripts tradicionales)
window.ThemeToggle = ThemeToggle;

initTheme();

export { ThemeToggle };
