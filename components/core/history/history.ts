export interface HistoryHooks {
    record: () => void;
    absorb: () => void;
}

export interface HistoryOptions<T = unknown> {
    /** Serializa el estado editable actual a un string, o `null` si aún no está listo. */
    snapshot: () => string | null;
    /**
     * Re-materializa un snapshot en el estado vivo: parsear ya lo hace el motor y
     * te pasa el objeto. La app debe aplicar + re-renderizar + persistir aquí.
     * Se ejecuta con el guard `applying` activo, así que las persistencias que
     * dispare (y que llamen a record/absorb) se auto-ignoran.
     */
    apply: (state: T) => void;
    onChange?: () => void;
    cap?: number;
}

export interface History {
    /** Fija la línea base (present = estado actual) y vacía las pilas. Idempotente:
     *  reutilizable como "reset" (p.ej. al cambiar de contexto/perfil). */
    init(): void;
    record(): void;
    /** Commit derivado: avanza el present SIN crear entrada de historial. */
    absorb(): void;
    /** Deshace una entrada. `false` si no hay nada que deshacer. */
    undo(): boolean;
    /** Rehace una entrada. `false` si no hay nada que rehacer. */
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
}

export function createHistory<T = unknown>(opts: HistoryOptions<T>): History {
    const cap = opts.cap ?? 30;

    let present: string | null = null;
    let undoStack: string[] = [];
    let redoStack: string[] = [];
    // Evita que la persistencia lanzada por el propio undo/redo se re-grabe como entrada.
    let applying = false;

    function snapshot(): string | null {
        return opts.snapshot();
    }

    function changed(): void {
        if (opts.onChange) opts.onChange();
    }

    function init(): void {
        present = snapshot();
        undoStack = [];
        redoStack = [];
        changed();
    }

    function absorb(): void {
        if (applying) return;
        const snap = snapshot();
        if (snap === null) return;
        present = snap;
        changed();
    }

    function record(): void {
        if (applying) return;
        const snap = snapshot();
        if (snap === null) return;
        if (present === null) {
            // Aún sin línea base (persistencia durante el arranque) → solo fijarla.
            present = snap;
            return;
        }
        if (snap === present) return; // dedupe: el estado no cambió
        undoStack.push(present);
        if (undoStack.length > cap) undoStack.shift();
        present = snap;
        redoStack.length = 0;
        changed();
    }

    // Re-aplica `present` al estado vivo (vía opts.apply) y re-sincroniza `present`
    // con el estado tal y como quedó materializado tras el re-render, evitando
    // entradas fantasma en el siguiente record() por normalizaciones que el
    // usuario nunca hizo.
    function applyPresent(): void {
        if (present === null) return;
        let parsed: T;
        try {
            parsed = JSON.parse(present) as T;
        } catch (_e) {
            return;
        }
        applying = true;
        try {
            opts.apply(parsed);
            present = snapshot() || present;
        } finally {
            applying = false;
        }
        changed();
    }

    function undo(): boolean {
        if (!undoStack.length || present === null) return false;
        redoStack.push(present);
        present = undoStack.pop() as string;
        applyPresent();
        return true;
    }

    function redo(): boolean {
        if (!redoStack.length || present === null) return false;
        undoStack.push(present);
        present = redoStack.pop() as string;
        applyPresent();
        return true;
    }

    function canUndo(): boolean {
        return undoStack.length > 0;
    }

    function canRedo(): boolean {
        return redoStack.length > 0;
    }

    return { init, record, absorb, undo, redo, canUndo, canRedo };
}
