import { createSavedStore, type SavedAddResult } from '@features/utils/saved-store.ts';
import type { PlannerSavedEntry } from './planner-types.ts';

function _dropThumb(x: PlannerSavedEntry | null | undefined) {
    if (x) x.thumb = null;
}

// La clave CON el idioma de los textos, solo para emparejar: la llevan las tarjetas guardadas antes de ignorarlo
let _keyWithLang = '';

const store = createSavedStore<PlannerSavedEntry>({
    lsKey: 'planner-saved-v1',
    idPrefix: 'pl',
    max: 25,
    matchDup: (x, inc) =>
        inc.key
            ? x.key === inc.key || (!!_keyWithLang && x.key === _keyWithLang)
            : inc.code
              ? x.code === inc.code
              : false,
    refreshDup: (ex, inc) => {
        if (inc.code) ex.code = inc.code;
        if (inc.key) ex.key = inc.key;
        if (inc.thumb) ex.thumb = inc.thumb;
    },
    // Anti-cuota: solo suelta miniaturas, de la cola a la recién guardada; nunca borra una entrada.
    quotaFallback: (list, keepId, persist) => {
        for (let i = list.length - 1; i >= 0; i--) {
            const x = list[i];
            if (x && x.id !== keepId && x.thumb) {
                _dropThumb(x);
                if (persist(list)) return true;
            }
        }
        _dropThumb(list.find((x) => x && x.id === keepId));
        return persist(list);
    },
});

function _normalize(entry: Partial<PlannerSavedEntry>): Omit<PlannerSavedEntry, 'id' | 'createdAt'> {
    const bg = entry.bgSwatch || '';
    return {
        name: String(entry.name || 'Planner').slice(0, 60),
        bgSwatch: /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : '#ffffff',
        thumb: typeof entry.thumb === 'string' && entry.thumb.startsWith('data:') ? entry.thumb : null,
        code: String(entry.code || ''),
        key: String(entry.key || ''),
    };
}

function withKeyWithLang<T>(keyWithLang: string, fn: () => T): T {
    _keyWithLang = keyWithLang;
    try {
        return fn();
    } finally {
        _keyWithLang = '';
    }
}

function add(entry: Partial<PlannerSavedEntry>, keyWithLang = ''): SavedAddResult<PlannerSavedEntry> {
    return withKeyWithLang(keyWithLang, () => store.add(_normalize(entry || {})));
}

function canAdd(entry: Partial<PlannerSavedEntry>, keyWithLang = ''): boolean {
    return withKeyWithLang(keyWithLang, () => store.canAdd(_normalize(entry || {})));
}

export const PlannerSaved = {
    max: store.max,
    list: store.list,
    get: store.get,
    add,
    canAdd,
    remove: store.remove,
    rename: store.rename,
    reorder: store.reorder,
};
