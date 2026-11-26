import { isMobile } from '@core/breakpoint/get-bp.ts';

// ── DOM CACHE — referencias a elementos estables consultadas con frecuencia. ──
const _domCache: Record<string, HTMLElement> = {};
export function $id(id: string): HTMLElement | null {
    let el: HTMLElement | null = _domCache[id] || null;
    if (el && el.isConnected) return el;
    el = document.getElementById(id);
    if (el) _domCache[id] = el;
    return el;
}

/**
 * Anuncia un mensaje al lector de pantalla mediante el live region oculto
 * `#plannerSrAnnouncer`. Pasar cadena vacía para limpiar.
 */
export function announceSr(message: string) {
    const region = document.getElementById('plannerSrAnnouncer');
    if (!region) return;
    // Forzar el cambio aunque el texto sea idéntico: muchos lectores no
    // re-anuncian si textContent no cambia. Limpiamos primero y reasignamos
    // en el siguiente tick.
    region.textContent = '';
    if (!message) return;
    setTimeout(() => {
        region.textContent = message;
    }, 50);
}

// ── Velo de escritorio de los paneles ──

let _backdrop: HTMLDivElement | null = null;
let _panel: HTMLElement | null = null;
let _opener: HTMLElement | null = null;

export function showBackdrop(onClose: () => void, panel: HTMLElement | null = null) {
    // Reabrir el mismo panel (cambiar de vista en Config) conserva el botón al que devolver el foco.
    const opener = panel && panel === _panel ? _opener : null;
    removeBackdrop();
    // En movil no hay ni recogeclics: el sheet compartido deja ver el folio a proposito, y su
    // footer Guardar/Cancelar es la via de cierre tactil.
    if (isMobile()) return;
    // Invisible: existe SOLO para recoger el clic fuera que cierra el panel (ver su CSS).
    _backdrop = document.createElement('div');
    _backdrop.className = 'planner-config-backdrop';
    document.body.appendChild(_backdrop);
    _backdrop.addEventListener('mousedown', onClose);
    const toolbar = document.getElementById('plannerToolbar');
    const activo = document.activeElement;
    // El velo para el raton pero NO el foco: sin `inert` se llegaba al toggle de idioma con Tab.
    toolbar?.setAttribute('inert', '');
    if (!panel) return;
    _panel = panel;
    _opener = opener;
    if (!(activo instanceof HTMLElement) || !toolbar?.contains(activo)) return;
    // Con la barra inerte, el foco del botón que abrió el panel caería a <body> (README js, punto 29).
    _opener = activo;
    panel.tabIndex = -1;
    panel.focus({ preventScroll: true });
}

export function removeBackdrop() {
    document.getElementById('plannerToolbar')?.removeAttribute('inert');
    if (_backdrop) {
        _backdrop.remove();
        _backdrop = null;
    }
    const activo = document.activeElement;
    // Solo si el foco se iba a perder con el panel: un clic fuera ya lo ha llevado a su sitio.
    const perdido = !activo || activo === document.body || (!!_panel?.hidden && _panel.contains(activo));
    if (perdido && _opener?.isConnected) _opener.focus({ preventScroll: true });
    _panel = null;
    _opener = null;
}
