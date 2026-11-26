/** Congela los botones Guardar/Cancelar del footer draft mientras un guardado async está
 *  en curso (aplicar código en vivo + generar miniatura + añadir a guardados). Impide
 *  commitear o revertir el borrador a mitad, que dejaría la entrada recién creada con la
 *  miniatura/clave de un estado distinto al de su código. `footerSelector` es el footer
 *  de paneles de cada app. Devuelve la
 *  función que restaura el estado previo de cada botón. */
export function freezeDraftFooter(footerSelector: string): () => void {
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('.edt-action--save, .edt-action--cancel'));
    const prev = btns.map((b) => b.disabled);
    btns.forEach((b) => (b.disabled = true));
    // Marcar los footers afectados para el cursor not-allowed: los navegadores lo ignoran sobre
    // botones disabled, así que (con pointer-events:none en el botón) lo pinta el footer contenedor
    // vía la clase compartida .edt-action-frozen (components/core/styles/editor-actions.css).
    const footers = new Set<HTMLElement>();
    btns.forEach((b) => {
        const f = b.closest<HTMLElement>(footerSelector);
        if (f) footers.add(f);
    });
    footers.forEach((f) => f.classList.add('edt-action-frozen'));
    return () => {
        btns.forEach((b, i) => (b.disabled = prev[i]!));
        footers.forEach((f) => f.classList.remove('edt-action-frozen'));
    };
}

export interface SavedReorderOptions {
    gridId: string;
    onReorder: (ids: string[]) => void;
}

function _dragAfterElement(grid: HTMLElement, x: number, y: number): HTMLElement | null {
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.edt-saved-card[data-id]:not(.is-dragging)'));
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card) continue;
        const box = card.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const sameRow = Math.abs(y - cy) <= box.height / 2;
        if (y < cy - box.height / 2 || (sameRow && x < cx)) return card;
    }
    return null;
}

/** Reordenar tarjetas arrastrando por el asa (.edt-saved-card__drag). El arrastre SOLO se
 *  activa al pulsar el asa, para no romper "clic en miniatura = aplicar/cargar". */
export function initSavedReorder(opts: SavedReorderOptions): void {
    const grid = document.getElementById(opts.gridId);
    if (!grid) {
        document.addEventListener('DOMContentLoaded', () => initSavedReorder(opts), { once: true });
        return;
    }
    // Activar draggable SOLO al pulsar el asa.
    grid.addEventListener('pointerdown', (e) => {
        const target = e.target as HTMLElement | null;
        const card = target?.closest('.edt-saved-card');
        if (!card) return;
        if (target?.closest('.edt-saved-card__drag')) card.setAttribute('draggable', 'true');
        else card.removeAttribute('draggable');
    });
    // Al soltar (con o sin arrastre) quitar draggable para no arrastrar por accidente luego.
    document.addEventListener('pointerup', () => {
        grid.querySelectorAll('.edt-saved-card[draggable="true"]').forEach((c) => c.removeAttribute('draggable'));
    });
    grid.addEventListener('dragstart', (e) => {
        const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.edt-saved-card');
        if (!card || card.getAttribute('draggable') !== 'true') {
            e.preventDefault();
            return;
        }
        card.classList.add('is-dragging');
        try {
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.id || '');
            }
        } catch (_err) {}
    });
    grid.addEventListener('dragover', (e) => {
        const dragging = grid.querySelector('.edt-saved-card.is-dragging');
        if (!dragging) return;
        e.preventDefault();
        const after = _dragAfterElement(grid, e.clientX, e.clientY);
        if (!after) grid.appendChild(dragging);
        else if (after !== dragging) grid.insertBefore(dragging, after);
    });
    grid.addEventListener('dragend', () => {
        const dragging = grid.querySelector('.edt-saved-card.is-dragging');
        if (dragging) dragging.classList.remove('is-dragging');
        grid.querySelectorAll('.edt-saved-card[draggable="true"]').forEach((c) => c.removeAttribute('draggable'));
        // Sin la tarjeta "añadir" (--add, sin data-id): solo ids reales del store.
        const ids = Array.from(grid.querySelectorAll<HTMLElement>('.edt-saved-card'))
            .map((c) => c.dataset.id || '')
            .filter((id) => id);
        opts.onReorder(ids);
    });
}
