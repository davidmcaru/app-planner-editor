export interface SavedEntryBase {
    id: string;
    name: string;
    createdAt: number;
}

export interface SavedStoreOptions<T extends SavedEntryBase> {
    lsKey: string;
    idPrefix: string;
    max?: number;
    matchDup: (existing: T, incoming: Omit<T, 'id' | 'createdAt'>) => boolean;
    refreshDup: (existing: T, incoming: Omit<T, 'id' | 'createdAt'>) => void;
    // Solo puede soltar datos derivados (miniaturas), nunca entradas: si ni así cabe, devuelve false y la app avisa.
    quotaFallback?: (list: T[], keepId: string, persist: (l: T[]) => boolean) => boolean;
}

export type SavedAddResult<T> = { ok: true; entry: T; persisted: boolean } | { ok: false; reason: 'full' };

export interface SavedStore<T extends SavedEntryBase> {
    readonly max: number;
    list(): T[];
    get(id: string): T | null;
    canAdd(input: Omit<T, 'id' | 'createdAt'>): boolean;
    // Llena y sin duplicado NO inserta ({ ok: false }); `persisted` = false si ni la cuota logró hacerle sitio.
    add(input: Omit<T, 'id' | 'createdAt'>): SavedAddResult<T>;
    remove(id: string): void;
    rename(id: string, name: string): void;
    // Ids desconocidos se ignoran; las entradas que no vengan en `ids` van al final.
    reorder(ids: string[]): void;
}

export function createSavedStore<T extends SavedEntryBase>(opts: SavedStoreOptions<T>): SavedStore<T> {
    const MAX = opts.max || 50;

    function _load(): T[] {
        try {
            const a = JSON.parse(localStorage.getItem(opts.lsKey) || '[]');
            return Array.isArray(a) ? a : [];
        } catch {
            return [];
        }
    }
    function _persist(list: T[]): boolean {
        try {
            localStorage.setItem(opts.lsKey, JSON.stringify(list));
            return true;
        } catch (_e) {
            return false;
        }
    }
    function _persistWithQuota(list: T[], keepId: string): boolean {
        if (_persist(list)) return true;
        return opts.quotaFallback ? opts.quotaFallback(list, keepId, _persist) : false;
    }

    function _newId(): string {
        return opts.idPrefix + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    }

    function list(): T[] {
        return _load();
    }
    function get(id: string): T | null {
        return _load().find((x) => x && x.id === id) || null;
    }
    function remove(id: string): void {
        _persist(_load().filter((x) => x && x.id !== id));
    }
    function rename(id: string, name: string): void {
        const l = _load();
        const it = l.find((x) => x && x.id === id);
        if (it) {
            it.name = String(name || '').slice(0, 60) || it.name;
            _persist(l);
        }
    }
    function reorder(ids: string[]): void {
        if (!Array.isArray(ids)) return;
        const byId = new Map(_load().map((x): [string, T] => [x && x.id, x]));
        const next: T[] = [];
        ids.forEach((id) => {
            const it = byId.get(id);
            if (it) {
                next.push(it);
                byId.delete(id);
            }
        });
        byId.forEach((x) => {
            if (x) next.push(x);
        });
        _persist(next);
    }

    function _dupIndex(l: T[], input: Omit<T, 'id' | 'createdAt'>): number {
        return l.findIndex((x) => x && opts.matchDup(x, input));
    }
    function canAdd(input: Omit<T, 'id' | 'createdAt'>): boolean {
        const l = _load();
        return l.length < MAX || _dupIndex(l, input) !== -1;
    }
    function add(input: Omit<T, 'id' | 'createdAt'>): SavedAddResult<T> {
        const l = _load();
        const dupIdx = _dupIndex(l, input);
        if (dupIdx !== -1) {
            const ex = l.splice(dupIdx, 1)[0]!;
            opts.refreshDup(ex, input);
            ex.createdAt = Date.now();
            l.unshift(ex);
            return { ok: true, entry: ex, persisted: _persistWithQuota(l, ex.id) };
        }
        if (l.length >= MAX) return { ok: false, reason: 'full' };
        const item = { ...input, id: _newId(), createdAt: Date.now() } as T;
        l.unshift(item);
        return { ok: true, entry: item, persisted: _persistWithQuota(l, item.id) };
    }

    return { max: MAX, list, get, canAdd, add, remove, rename, reorder };
}

export function uniqueName(
    base: string | null | undefined,
    existing: readonly (string | undefined)[],
    fallback: string
): string {
    const nombre = String(base || '').trim() || fallback;
    const set = new Set(existing);
    if (!set.has(nombre)) return nombre;
    let n = 2;
    while (set.has(nombre + ' (' + n + ')')) n++;
    return nombre + ' (' + n + ')';
}
