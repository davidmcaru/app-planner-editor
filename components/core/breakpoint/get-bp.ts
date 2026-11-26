export type Breakpoint = 'd' | 't' | 'm';

/** Lee `--bp` (con fallback matchMedia si no estuviera definida). */
export function getBp(): Breakpoint {
    try {
        const bp = getComputedStyle(document.documentElement).getPropertyValue('--bp').trim();
        if (bp) return bp as Breakpoint; // 'd' | 't' | 'm'
    } catch (_e) {
        /* getComputedStyle no disponible */
    }
    // Fallback si --bp no está definida (mismo criterio que las media queries del head).
    try {
        if (window.matchMedia('(max-width: 728px)').matches) return 'm';
        if (window.matchMedia('(max-width: 1024px)').matches) return 't';
    } catch (_e) {}
    return 'd';
}

export function isMobile(): boolean {
    return getBp() === 'm';
}

export function isDesktop(): boolean {
    return getBp() === 'd';
}
