import { createPanelStore } from '@core/panel-store/panel-store.ts';

export type PanelName = 'config' | 'design' | 'text' | 'temas' | 'mas' | 'saved';
export type PanelFn = ((...args: unknown[]) => unknown) | null;

export type PanelSnapshot = Record<PanelName, boolean>;
export type PanelSubscriber = (snapshot: PanelSnapshot) => void;

const PANEL_NAMES: PanelName[] = ['config', 'design', 'text', 'temas', 'mas', 'saved'];

const _store = createPanelStore();
const _mkMap = (): Record<PanelName, PanelFn> => ({
    config: null,
    design: null,
    text: null,
    temas: null,
    mas: null,
    saved: null,
});
const _closers = _mkMap();
const _openers = _mkMap();

function _snapshot(): PanelSnapshot {
    const active = _store.get();
    return {
        config: active === 'config',
        design: active === 'design',
        text: active === 'text',
        temas: active === 'temas',
        mas: active === 'mas',
        saved: active === 'saved',
    };
}

export const panelStore = {
    setOpen(name: PanelName, isOpen: boolean): void {
        const active = _store.get();
        if (isOpen) {
            if (active === name) return;
            // Al ABRIR se cierra el activo con su propio closer, que en el planner ES su Cancelar.
            if (active) {
                const closer = _closers[active as PanelName];
                if (typeof closer === 'function') closer();
            }
            _store.set(name);
        } else {
            if (active !== name) return;
            _store.set(null);
        }
    },
    isOpen(name: PanelName): boolean {
        return _store.get() === name;
    },
    anyOpen(): boolean {
        return _store.get() !== null;
    },
    setCloser(name: PanelName, fn: PanelFn): void {
        _closers[name] = fn;
    },
    getCloser(name: PanelName): PanelFn {
        return _closers[name];
    },
    setOpener(name: PanelName, fn: PanelFn): void {
        _openers[name] = fn;
    },
    getOpener(name: PanelName): PanelFn {
        return _openers[name];
    },
    closeIfOpen(name: PanelName): void {
        const closer = _closers[name];
        if (_store.get() === name && typeof closer === 'function') closer();
    },
    /** Cierra el que esté abierto, sea cual sea. */
    closeAll(): void {
        for (const name of PANEL_NAMES) {
            const closer = _closers[name];
            if (_store.get() === name && typeof closer === 'function') closer();
        }
    },
    onChange(cb: PanelSubscriber): () => void {
        return _store.subscribe(() => cb(_snapshot()));
    },
    snapshot: _snapshot,
};
