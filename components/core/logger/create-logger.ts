export interface AppLogger {
    debug: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

function _isDevEnvironment(): boolean {
    // `import.meta.env.DEV` es constante de compilación: en el build de prod queda `false` y las
    // llamadas a debug/warn se van por tree-shaking. Lo aporta el planner al unificar.
    if (import.meta.env?.DEV) return true;
    if (typeof window === 'undefined') return false;
    const { hostname, search } = window.location;
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.local') ||
        search.includes('debug=1')
    );
}

export function createLogger(prefix: string): AppLogger {
    const dev = _isDevEnvironment();
    return {
        debug(...args: unknown[]) {
            if (dev) console.log(prefix, ...args);
        },
        warn(...args: unknown[]) {
            if (dev) console.warn(prefix, ...args);
        },
        error(...args: unknown[]) {
            console.error(prefix, ...args);
        },
    };
}
