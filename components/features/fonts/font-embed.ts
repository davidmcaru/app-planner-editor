import { facesFor, fontUrl } from './font-registry.ts';

export type FontLogger = { warn: (...args: unknown[]) => void };

const _base64Cache = new Map<string, string>();

// Cachea por archivo: el mismo archivo se pide una sola vez por sesión.
export async function loadFontAsBase64(file: string, logger?: FontLogger): Promise<string | null> {
    const cached = _base64Cache.get(file);
    if (cached) return cached;
    try {
        const response = await fetch(fontUrl(file), { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        _base64Cache.set(file, dataUri);
        return dataUri;
    } catch (err) {
        logger?.warn(`No se pudo precargar la fuente ${file}:`, err);
        return null;
    }
}

// Sin esto html-to-image rastrea TODAS las @font-face del documento,
// y la primera captura se pasa de los 15 s.
export async function buildFontEmbedCSS(families: string[], logger?: FontLogger): Promise<string> {
    const blocks: string[] = [];
    for (const family of families) {
        for (const face of facesFor(family)) {
            const dataUri = await loadFontAsBase64(face.file, logger);
            if (!dataUri) continue;
            blocks.push(
                `@font-face{font-family:'${family}';font-style:${face.style || 'normal'};font-weight:${face.weight};font-display:swap;src:url(${dataUri}) format('woff2');}`
            );
        }
    }
    return blocks.join('\n');
}

export type EnsureFontsOptions = {
    element?: HTMLElement | null;
    /** Margen tras el load para que el layout asiente antes de capturar. */
    settleMs?: number;
    logger?: FontLogger;
};

// Evita capturar con la fuente fallback todavía en pantalla.
export async function ensureFontsLoaded(families: string[], opts: EnsureFontsOptions = {}): Promise<void> {
    const { element, settleMs = 0, logger } = opts;
    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const text = element ? element.innerText || element.textContent || '' : '';
        for (const family of families) {
            try {
                await document.fonts.load(`400 16px "${family}"`, text || 'Aa');
                await document.fonts.load(`700 16px "${family}"`, text || 'Aa');
            } catch (err) {
                logger?.warn(`document.fonts.load("${family}") falló:`, err);
            }
        }
        if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
    } catch (err) {
        logger?.warn('ensureFontsLoaded falló (continuamos):', err);
    }
}
