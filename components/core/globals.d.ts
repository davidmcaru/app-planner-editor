interface ThemeToggleAPI {
    toggle: () => void;
    getTheme: () => 'light' | 'dark';
    setTheme: (theme: string) => void;
    reset: () => void;
    reinit: () => void;
}

interface ThemeChangeDetail {
    theme: 'light' | 'dark';
}

interface Window {
    // El único global de la app: lo deja `theme-toggle.ts` para quien quiera cambiar el tema desde fuera
    ThemeToggle?: ThemeToggleAPI;
}

interface WindowEventMap {
    themechange: CustomEvent<ThemeChangeDetail>;
    'ajustes:cambio': CustomEvent<{ clave: string; valor: string }>;
}
