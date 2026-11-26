export type PanelName = string | null;
export type PanelSubscriber = (panel: PanelName) => void;

export interface PanelStore {
    get: () => PanelName;
    /** Cambia el panel activo y notifica (mismo valor no notifica). */
    set: (name: PanelName) => void;
    subscribe: (fn: PanelSubscriber) => () => void;
}

export function createPanelStore(): PanelStore {
    const _subs = new Set<PanelSubscriber>();
    let _panel: PanelName = null;

    return {
        get() {
            return _panel;
        },
        set(name: PanelName) {
            if (_panel === name) return;
            _panel = name;
            _subs.forEach((fn) => {
                try {
                    fn(_panel);
                } catch (err) {
                    console.warn('[panel-store] subscriber error:', err);
                }
            });
        },
        subscribe(fn: PanelSubscriber) {
            _subs.add(fn);
            return () => {
                _subs.delete(fn);
            };
        },
    };
}
