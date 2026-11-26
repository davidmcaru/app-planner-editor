export interface PanelSheetOptions {
    panelIds: string[];
    isOpen: (panel: HTMLElement) => boolean;
    subscribe: (onChange: () => void) => void;
    /** ¿Móvil? Debe leer --bp (estándar del proyecto), no innerWidth. */
    isMobile: () => boolean;
    // Función, no texto: se relee al abrir cada panel y en refresh() para seguir el cambio de idioma.
    handleLabel: () => string;
    pinnedTop?: string;
    pinnedBottom?: string;
    /** Si el panel YA trae su propio scroller flex, no se envuelve el cuerpo (evita anidar). */
    ownScroller?: string;
    /** Alto mínimo del sheet al encoger (px). Es un SUELO: el mínimo real es el
     *  chrome medido (asa + fijados), que garantiza el footer visible. Def. 120. */
    minVisiblePx?: number;
    maxVh?: number;
    /** ⚠️ Solo las de PINTAR son configurables; las de estado (is-drag-live, is-grabbing,
     * edt-sheet-open, edt-sheet__footer) las fija el motor y no se pueden renombrar. */
    classes?: { handle?: string; handleBar?: string; body?: string };
}

export interface PanelSheet {
    refresh(): void;
    destroy(): void;
}

const LIVE_CLASS = 'is-drag-live';
const GRABBING_CLASS = 'is-grabbing';
const OPEN_BODY_CLASS = 'edt-sheet-open';
const FOOTER_CLASS = 'edt-sheet__footer';

export function initPanelSheet(opts: PanelSheetOptions): PanelSheet {
    const minVisible = opts.minVisiblePx ?? 120;
    const maxVh = opts.maxVh ?? 0.9;
    const pinnedTopSel = opts.pinnedTop || '';
    const pinnedBottomSel = opts.pinnedBottom || '';
    const HANDLE_CLASS = opts.classes?.handle ?? 'edt-sheet__handle';
    const HANDLE_BAR_CLASS = opts.classes?.handleBar ?? 'edt-sheet__handle-bar';
    const BODY_CLASS = opts.classes?.body ?? 'edt-sheet__body';

    function panels(): HTMLElement[] {
        return opts.panelIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    }

    function hasOwnScroller(panel: HTMLElement): boolean {
        return !!(opts.ownScroller && panel.querySelector(`:scope > :is(${opts.ownScroller})`));
    }

    /** El scroller del panel: el wrapper creado o el propio de la app (ownScroller). */
    function getScroller(panel: HTMLElement): HTMLElement | null {
        return (
            panel.querySelector<HTMLElement>(`:scope > .${BODY_CLASS}`) ||
            (opts.ownScroller ? panel.querySelector<HTMLElement>(`:scope > :is(${opts.ownScroller})`) : null)
        );
    }

    // Fija (flex-shrink:0) cabecera/asa arriba y footer abajo; el resto va a un wrapper
    // scrolleable `.edt-sheet__body`. Idempotente y omitido si el panel ya tiene scroller.
    function ensurePanelStructure(panel: HTMLElement): void {
        if (panel.querySelector(`:scope > .${BODY_CLASS}`)) return;
        if (hasOwnScroller(panel)) return;

        const isPinnedTop = (el: Element) =>
            el.classList.contains(HANDLE_CLASS) || (pinnedTopSel !== '' && el.matches(pinnedTopSel));
        const isPinnedBottom = (el: Element) => pinnedBottomSel !== '' && el.matches(pinnedBottomSel);

        const children = Array.prototype.slice.call(panel.children) as Element[];
        const body = document.createElement('div');
        body.className = BODY_CLASS;

        let firstBodyChild: Element | null = null;
        for (const el of children) {
            if (isPinnedTop(el) || isPinnedBottom(el)) continue;
            firstBodyChild = el;
            break;
        }
        if (!firstBodyChild) return;

        panel.insertBefore(body, firstBodyChild);
        for (const el of children) {
            if (isPinnedTop(el) || isPinnedBottom(el)) continue;
            body.appendChild(el);
        }
    }

    // Marca los fijados de abajo con la clase compartida del skin (fondo sólido +
    // safe-area). Idempotente; sin efecto visual fuera de paneles `.edt-sheet`.
    function tagPinnedBottom(panel: HTMLElement): void {
        if (pinnedBottomSel === '') return;
        panel
            .querySelectorAll<HTMLElement>(`:scope > :is(${pinnedBottomSel})`)
            .forEach((el) => el.classList.add(FOOTER_CLASS));
    }

    function ensureHandle(panel: HTMLElement): HTMLElement {
        let handle = panel.querySelector<HTMLElement>(`:scope > .${HANDLE_CLASS}`);
        if (!handle) {
            handle = document.createElement('div');
            handle.className = HANDLE_CLASS;
            handle.setAttribute('role', 'button');
            handle.setAttribute('tabindex', '-1');
            const bar = document.createElement('span');
            bar.className = HANDLE_BAR_CLASS;
            bar.setAttribute('aria-hidden', 'true');
            handle.appendChild(bar);
            panel.insertBefore(handle, panel.firstChild);
        }
        handle.setAttribute('aria-label', opts.handleLabel());
        return handle;
    }

    function getHandle(panel: HTMLElement | null): HTMLElement | null {
        return panel ? panel.querySelector<HTMLElement>(`:scope > .${HANDLE_CLASS}`) : null;
    }

    let currentPanel: HTMLElement | null = null;
    let gestureAbort: AbortController | null = null;
    let startY = 0;
    let startH = 0; // alto del sheet al empezar el gesto
    let minH = 0; // mínimo del gesto: chrome medido (asa + fijados), suelo minVisible
    let maxH = 0; // máximo del gesto: min(alto del contenido, maxVh)
    let dragH = 0; // alto objetivo del frame en curso
    let dragRaf = 0;
    let transitionRaf = 0; // doble rAF pendiente que re-arma la transición tras soltar

    function clearInlineStyles(panel: HTMLElement): void {
        panel.style.height = '';
        panel.style.maxHeight = '';
        panel.style.transition = '';
    }

    // ⚠️ Un frame DESPUÉS de que pinte la geometría final: en el mismo frame, al soltar se veía
    // el replay de la animación de entrada
    function restoreTransitionSoon(panel: HTMLElement): void {
        if (transitionRaf) cancelAnimationFrame(transitionRaf);
        transitionRaf = requestAnimationFrame(() => {
            transitionRaf = requestAnimationFrame(() => {
                transitionRaf = 0;
                if (!gestureAbort) panel.style.transition = '';
            });
        });
    }

    function onPointerDown(ev: PointerEvent | TouchEvent): void {
        if (!opts.isMobile() || !currentPanel) return;
        if (gestureAbort) return; // dedup touchstart+pointerdown
        if ('button' in ev && ev.button !== 0) return;

        const point = 'touches' in ev ? ev.touches[0] : ev;
        if (!point) return;
        const panel = currentPanel;
        startY = point.clientY;

        if (transitionRaf) {
            cancelAnimationFrame(transitionRaf);
            transitionRaf = 0;
        }

        // ⚠️ ORDEN deliberado: leer con el árbol limpio, luego escribir+medir de una, y las escrituras
        // sin lectura después AL FINAL — is-drag-live antes invalida el subárbol y cuesta otro recalc
        const vhNow = window.innerHeight || document.documentElement.clientHeight;
        startH = panel.getBoundingClientRect().height;
        panel.style.height = 'auto';
        panel.style.maxHeight = Math.round(vhNow * maxVh) + 'px';
        maxH = panel.getBoundingClientRect().height;
        const scroller = getScroller(panel);
        const chrome = scroller ? Math.max(0, maxH - scroller.getBoundingClientRect().height) : 0;
        minH = Math.min(Math.max(chrome, minVisible), maxH);
        // Congelar el alto actual: a partir de aquí el gesto solo escribe `height`.
        dragH = startH;
        panel.style.height = Math.round(startH) + 'px';
        panel.classList.add(LIVE_CLASS);
        panel.style.transition = 'none';

        gestureAbort = new AbortController();
        const signal = gestureAbort.signal;
        if (ev.type === 'touchstart') {
            document.addEventListener('touchmove', onPointerMove, { passive: false, signal });
            document.addEventListener('touchend', onPointerUp, { signal });
            document.addEventListener('touchcancel', onPointerUp, { signal });
        } else {
            document.addEventListener('pointermove', onPointerMove, { passive: false, signal });
            document.addEventListener('pointerup', onPointerUp, { signal });
            document.addEventListener('pointercancel', onPointerUp, { signal });
        }

        const handle = getHandle(panel);
        if (handle) handle.classList.add(GRABBING_CLASS);
    }

    function onPointerMove(ev: PointerEvent | TouchEvent): void {
        if (!currentPanel) return;
        const point = 'touches' in ev ? ev.touches[0] : ev;
        if (!point) return;
        // Dedo hacia arriba = crecer; hacia abajo = encoger (el borde inferior no se mueve).
        let next = startH + (startY - point.clientY);
        if (next < minH) next = minH;
        if (next > maxH) next = maxH;

        dragH = next;
        if (!dragRaf) {
            dragRaf = requestAnimationFrame(() => {
                dragRaf = 0;
                if (currentPanel) currentPanel.style.height = Math.round(dragH) + 'px';
            });
        }
        // preventDefault SIEMPRE síncrono (nunca dentro del rAF) para bloquear el scroll fantasma.
        if (ev.cancelable) ev.preventDefault();
    }

    function onPointerUp(): void {
        const wasDragging = !!gestureAbort;
        if (dragRaf) {
            cancelAnimationFrame(dragRaf);
            dragRaf = 0;
        }
        if (gestureAbort) {
            gestureAbort.abort();
            gestureAbort = null;
        }
        if (currentPanel && wasDragging) {
            // Asentar el último frame; el alto y el maxHeight (tope del gesto) quedan
            // inline hasta cambiar/reabrir panel o salir de móvil (clearInlineStyles).
            currentPanel.style.height = Math.round(dragH) + 'px';
            currentPanel.classList.remove(LIVE_CLASS);
            restoreTransitionSoon(currentPanel);
            const handle = getHandle(currentPanel);
            if (handle) handle.classList.remove(GRABBING_CLASS);
        }
    }

    function bindHandle(panel: HTMLElement): void {
        const handle = getHandle(panel);
        if (!handle || handle.dataset.dragBound === '1') return;
        handle.dataset.dragBound = '1';
        handle.addEventListener('pointerdown', onPointerDown, { passive: true });
        handle.addEventListener('touchstart', onPointerDown, { passive: true });
    }

    function prepare(panel: HTMLElement): void {
        ensureHandle(panel);
        ensurePanelStructure(panel);
        tagPinnedBottom(panel);
        bindHandle(panel);
    }

    function prepareAll(): void {
        panels().forEach(prepare);
    }

    function onActivePanelChange(): void {
        onPointerUp(); // abortar gesto en curso al cambiar de panel
        let openPanel: HTMLElement | null = null;
        for (const el of panels()) {
            if (opts.isOpen(el)) openPanel = el;
        }
        if (currentPanel && currentPanel !== openPanel) clearInlineStyles(currentPanel);
        currentPanel = openPanel;
        if (currentPanel) {
            prepare(currentPanel); // por si se pobló/rehidrató tarde
            clearInlineStyles(currentPanel);
        }
        // Con un sheet abierto, el CSS compartido oculta la bottom bar (≤728px) y el
        // footer del sheet ocupa esa franja. Fuera de móvil la clase es inerte.
        document.body.classList.toggle(OPEN_BODY_CLASS, currentPanel !== null);
    }

    const mq = window.matchMedia('(max-width: 728px)');
    const onBpChange = () => {
        onPointerUp();
        if (!opts.isMobile() && currentPanel) clearInlineStyles(currentPanel);
    };

    prepareAll();
    opts.subscribe(() => Promise.resolve().then(onActivePanelChange));
    onActivePanelChange();
    try {
        mq.addEventListener('change', onBpChange);
    } catch (_e) {}

    return {
        refresh: prepareAll,
        destroy() {
            onPointerUp();
            if (transitionRaf) {
                cancelAnimationFrame(transitionRaf);
                transitionRaf = 0;
            }
            document.body.classList.remove(OPEN_BODY_CLASS);
            try {
                mq.removeEventListener('change', onBpChange);
            } catch (_e) {}
        },
    };
}
