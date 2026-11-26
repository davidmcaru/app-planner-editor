const DEBOUNCE_MS = 250;
const _pendingWrites = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();
const _flushHandlers = new Set<() => void>();
let _cerradas = false;

export function setItemDebounced(key: string, value: string) {
    if (_cerradas) return;
    const existing = _pendingWrites.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* quota / private mode */
        }
        _pendingWrites.delete(key);
    }, DEBOUNCE_MS);
    _pendingWrites.set(key, { value, timer });
}

// Quien relee lo que otra pestaña escribió no debe pisar lo que él mismo tiene aún por escribir
export const hasPendingWrite = (key: string): boolean => _pendingWrites.has(key);

// Obligado antes de un removeItem: sin esto, el flush del `pagehide` de un reload posterior
// re-escribiría la clave y resucitaría lo que se acababa de borrar.
export function cancelPendingWrite(key: string) {
    const existing = _pendingWrites.get(key);
    if (!existing) return;
    clearTimeout(existing.timer);
    _pendingWrites.delete(key);
}

// Borrados los datos de una app en su propia página, antes del reload: lo pendiente ajeno se escribe ya, lo suyo
// se tira, y ni los handlers (el autosave) ni una escritura nueva vuelven a escribir de camino a la recarga
export function cerrarEscrituras(esDeLaApp: (key: string) => boolean): void {
    _flushHandlers.clear();
    _pendingWrites.forEach(({ value, timer }, key) => {
        clearTimeout(timer);
        if (esDeLaApp(key)) return;
        try {
            localStorage.setItem(key, value);
        } catch {
            /* ignore */
        }
    });
    _pendingWrites.clear();
    _cerradas = true;
}

// Para el que difiere la LLAMADA y no la escritura: así cuelga del mismo
// pagehide/visibilitychange en vez de cablear su propio listener.
export function registerFlushHandler(fn: () => void): () => void {
    _flushHandlers.add(fn);
    return () => _flushHandlers.delete(fn);
}

export function flushPendingWrites() {
    // Los handlers primero: pueden encolar escrituras que esta misma pasada debe vaciar.
    _flushHandlers.forEach((fn) => {
        try {
            fn();
        } catch {
            /* un handler roto no puede impedir que se vacíe la cola */
        }
    });
    _pendingWrites.forEach(({ value, timer }, key) => {
        clearTimeout(timer);
        try {
            localStorage.setItem(key, value);
        } catch {
            /* ignore */
        }
    });
    _pendingWrites.clear();
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushPendingWrites);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPendingWrites();
    });
}
