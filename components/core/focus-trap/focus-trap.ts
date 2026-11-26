// NO gestiona Escape a propósito: el cierre lo maneja quien abre el diálogo
export interface FocusTrap {
    activate: () => void;
    deactivate: () => void;
    refresh: () => void;
}

export interface FocusTrapOptions {
    /**
     * Qué enfocar al activar. Por defecto, el primer enfocable del contenedor.
     * Pasa un selector o un elemento para forzar otro (p.ej. el botón "Aceptar").
     */
    initialFocus?: string | HTMLElement | null;
}

// `[contenteditable="true"]` lo aporta el mini-editor del planner al adoptarlo: su campo de
// texto ES un contenteditable, y sin esto el ciclo de Tab se lo saltaba entero.
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const esRadio = (el: HTMLElement): el is HTMLInputElement =>
    el instanceof HTMLInputElement && el.type === 'radio' && !!el.name;

function _visibleFocusables(container: HTMLElement): HTMLElement[] {
    const visibles = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
    // ⚠️ El Tab solo se para en el radio marcado de cada grupo: contarlos todos dejaba escapar el foco del último
    return visibles.filter((el) => {
        if (!esRadio(el)) return true;
        const grupo = visibles.filter(
            (o): o is HTMLInputElement => esRadio(o) && o.name === el.name && o.form === el.form
        );
        return el === (grupo.find((o) => o.checked) ?? grupo[0]);
    });
}

// Tope del reintento del foco inicial: cubre las transiciones de apertura del sitio (≤ 0,3 s) con holgura.
const INITIAL_FOCUS_RETRY_MS = 1000;

const aunOculto = (el: HTMLElement): boolean =>
    el.getClientRects().length === 0 || getComputedStyle(el).visibility !== 'visible';

export function createFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}): FocusTrap {
    let active = false;
    let previouslyFocused: HTMLElement | null = null;
    let initialTimer = 0;
    let retryRaf = 0;

    function cancelInitialFocus(): void {
        clearTimeout(initialTimer);
        cancelAnimationFrame(retryRaf);
        initialTimer = 0;
        retryRaf = 0;
    }

    // ⚠️ focus() en un nodo aún `visibility:hidden` falla EN SILENCIO, y un selector puede no casar aún: se reintenta
    function focusInitial(deadline: number): void {
        retryRaf = 0;
        if (!active) return;
        const target = _resolveInitial();
        if (target) {
            target.focus({ preventScroll: true });
            if (document.activeElement === target || !aunOculto(target)) return;
        }
        if (performance.now() > deadline) return;
        retryRaf = requestAnimationFrame(() => {
            if (!container.contains(document.activeElement)) focusInitial(deadline);
        });
    }

    function onKeydown(e: KeyboardEvent): void {
        if (e.key !== 'Tab') return;
        const focusables = _visibleFocusables(container);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) {
            e.preventDefault();
            return;
        }
        const activeEl = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
            // ⚠️ También desde el CONTENEDOR, que es donde nace el foco de un diálogo sin `initialFocus` propio (el
            // visor): no es `first` y `contains` lo da por dentro, así que Mayús+Tab se escapaba a la página de detrás
            if (activeEl === first || activeEl === container || !container.contains(activeEl)) {
                e.preventDefault();
                last.focus();
            }
        } else if (activeEl === last || !container.contains(activeEl)) {
            e.preventDefault();
            first.focus();
        }
    }

    function _resolveInitial(): HTMLElement | null {
        const { initialFocus } = options;
        if (typeof initialFocus === 'string') return container.querySelector<HTMLElement>(initialFocus);
        if (initialFocus instanceof HTMLElement) return initialFocus;
        return _visibleFocusables(container)[0] || container;
    }

    return {
        activate() {
            if (active) return;
            active = true;
            previouslyFocused = document.activeElement as HTMLElement | null;
            document.addEventListener('keydown', onKeydown, true);
            cancelInitialFocus();
            initialTimer = window.setTimeout(() => focusInitial(performance.now() + INITIAL_FOCUS_RETRY_MS), 0);
        },
        deactivate() {
            if (!active) return;
            active = false;
            cancelInitialFocus();
            document.removeEventListener('keydown', onKeydown, true);
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus({ preventScroll: true });
            }
            previouslyFocused = null;
        },
        refresh() {
            /* no-op: los enfocables se consultan en cada Tab (dinámico). */
        },
    };
}
