const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/**
 * Escapa un valor para interpolarlo de forma segura dentro de HTML,
 * tanto en contexto de contenido como de atributo entre comillas dobles.
 */
export function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Alias: mismo saneado, nombre que deja claro que el destino es un atributo. */
export const escapeAttr = escapeHtml;

/**
 * Como `escapeHtml` pero preservando `<br>`. Solo se re-permite `<br>`/`<br/>` — ninguna otra etiqueta
 * ni atributos —, así que sigue siendo seguro para texto de autor.
 */
export function escapeAllowBr(value: unknown): string {
    return escapeHtml(value).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}

const SAFE_URL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:', 'sms:'];

/**
 * Devuelve true si la URL es segura (esquema en lista blanca; sin javascript:/data:/vbscript:).
 * Acepta rutas relativas (`./foo`, `../foo`, `/foo`, `#anchor`, `?query`).
 */
export function isSafeUrl(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return true; // se permite como "vacío"
    if (
        trimmed.startsWith('#') ||
        trimmed.startsWith('?') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('./') ||
        trimmed.startsWith('../')
    ) {
        return true;
    }
    const colonIdx = trimmed.indexOf(':');
    const slashIdx = trimmed.indexOf('/');
    // Sin esquema explícito (o la primera `/` va antes del `:`) → relativa
    if (colonIdx === -1 || (slashIdx !== -1 && slashIdx < colonIdx)) {
        return true;
    }
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
        const url = new URL(trimmed, base);
        return SAFE_URL_SCHEMES.includes(url.protocol);
    } catch (_e) {
        return false;
    }
}

/** Sanitiza una URL: devuelve la original si es segura, `#` si no. */
export function safeUrl(value: unknown): string {
    return isSafeUrl(value) ? String(value).trim() : '#';
}
