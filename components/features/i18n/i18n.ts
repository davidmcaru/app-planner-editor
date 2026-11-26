export type I18nDict = Record<string, string>;

export interface CreateI18nOptions {
    dicts: Record<string, I18nDict>;
    getLang: () => string;
    /** Idioma de reserva cuando el activo no tiene una clave (p. ej. `'ES'`). */
    fallbackLang: string;
    root?: () => ParentNode;
}

export interface I18n {
    /**
     * Traduce `key` al idioma activo, con interpolación `{var}` opcional.
     * Fallback: activo → `fallbackLang` → la propia clave (clave visible = bug).
     */
    t: (key: string, vars?: Record<string, string | number>) => string;
    /**
     * Aplica las claves a los `[data-i18n*]` del DOM. `langOverride` fuerza un idioma
     * concreto (útil si la app llama ANTES de actualizar su estado de idioma).
     */
    apply: (langOverride?: string) => void;
    onApplied: (fn: () => void) => () => void;
}

export function createI18n(opts: CreateI18nOptions): I18n {
    const { dicts, getLang, fallbackLang } = opts;
    const getRoot = opts.root ?? ((): ParentNode => document);
    const subscribers = new Set<() => void>();

    const dictFor = (lang: string): I18nDict => dicts[lang] || dicts[fallbackLang] || {};
    const resolve = (dict: I18nDict, key: string | null): string | undefined =>
        key ? (dict[key] ?? dicts[fallbackLang]?.[key]) : undefined;

    function t(key: string, vars?: Record<string, string | number>): string {
        const out = resolve(dictFor(getLang()), key) ?? key;
        if (!vars) return out;
        // Una sola pasada y con función: con replaceAll y una cadena, los $$, $& o $' del texto del usuario se
        // interpretaban («Ahorro $$» salía «Ahorro $»), y un valor con el hueco de otra variable se volvía a sustituir
        return out.replace(/\{(\w+)\}/g, (hueco: string, nombre: string) =>
            Object.hasOwn(vars, nombre) ? String(vars[nombre]) : hueco
        );
    }

    function apply(langOverride?: string): void {
        const dict = dictFor(langOverride ?? getLang());
        const root = getRoot();

        root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
            const val = resolve(dict, el.getAttribute('data-i18n'));
            if (val === undefined) return;
            if (el instanceof HTMLInputElement && el.type === 'button') {
                el.value = val;
            } else if (
                (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
                !el.hasAttribute('value')
            ) {
                el.placeholder = val;
            } else if (el instanceof HTMLOptGroupElement) {
                el.label = val;
            } else {
                // Solo textContent: los iconos viven en nodos hermanos <i>/<svg>.
                el.textContent = val;
            }
        });

        root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
            const val = resolve(dict, el.getAttribute('data-i18n-title'));
            if (val !== undefined) el.setAttribute('title', val);
        });

        root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
            const val = resolve(dict, el.getAttribute('data-i18n-aria'));
            if (val !== undefined) el.setAttribute('aria-label', val);
        });

        subscribers.forEach((fn) => {
            try {
                fn();
            } catch (err) {
                console.warn('[i18n] subscriber error:', err);
            }
        });
    }

    function onApplied(fn: () => void): () => void {
        subscribers.add(fn);
        return () => {
            subscribers.delete(fn);
        };
    }

    return { t, apply, onApplied };
}
