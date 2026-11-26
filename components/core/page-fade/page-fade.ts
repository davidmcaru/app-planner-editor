'use strict';

/**
 * Page Fade — reveal elegante de página (componente global)
 * Gestiona el fade de entrada de la página: `body.page-preload` (opacity:0) →
 * `body.page-ready` (opacity:1 con transición breve). Ver `page-fade.css`.
 *
 * - Por DEFECTO revela solo: en cuanto el DOM está listo (doble rAF para que el
 *   navegador pinte el opacity:0 y la transición se vea).
 * - Opt-out con `<body data-page-fade="manual">`: la página controla el momento
 *   llamando `markPageReady()` (p.ej. tras cargar su catálogo, junto al spinner).
 * - Red de seguridad: un timeout revela igualmente si el trigger no llega, para
 *   que la página NUNCA se quede invisible ante un fallo de JS.
 */

let revealed = false;

/** Revela la página (idempotente): pasa de `page-preload` a `page-ready`. */
export function markPageReady(): void {
    if (revealed) return;
    revealed = true;
    const body = document.body;
    if (!body) return;
    body.classList.add('page-ready');
    body.classList.remove('page-preload');
}

function autoReveal(): void {
    // Doble rAF: garantiza que el opacity:0 se pinta antes de transicionar a 1.
    requestAnimationFrame(() => requestAnimationFrame(markPageReady));
}

const start = (): void => {
    if (document.body?.dataset.pageFade !== 'manual') autoReveal();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}

// Red de seguridad: nunca dejar la página invisible (JS que falla, trigger manual
// que no llega, etc.). 2 s es amplio para cualquier carga normal.
setTimeout(markPageReady, 2000);
