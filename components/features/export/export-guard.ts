export type ExportGuardOptions = {
    /** Qué hacer si salta el watchdog: avisar al usuario, log, restaurar lo que haga falta. */
    onTimeout?: () => void;
    timeoutMs?: number;
    className?: string;
};

export type ExportGuard = {
    start: () => void;
    end: () => void;
};

// La clase `is-exporting` bloquea el repintado y esconde los asideros de edición mientras se
// captura. Si la promesa de html-to-image NUNCA resuelve (el cuelgue clásico en móvil), el
// `finally` no corre y esa clase se queda pegada: el editor deja de repintar y no hay forma de
// recuperarlo sin recargar. El watchdog la quita pase lo que pase.
export function createExportGuard(opts: ExportGuardOptions = {}): ExportGuard {
    const { onTimeout, timeoutMs = 30_000, className = 'is-exporting' } = opts;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    return {
        start() {
            clear();
            document.body.classList.add(className);
            timer = setTimeout(() => {
                timer = null;
                document.body.classList.remove(className);
                onTimeout?.();
            }, timeoutMs);
        },
        end() {
            clear();
            document.body.classList.remove(className);
        },
    };
}

// Un <img> que no carga (CORS, red lenta) hace que html-to-image RECHACE la promesa y aborte la
// captura entera. Con este placeholder de 1×1 transparente se genera el resto de la imagen.
export const TRANSPARENT_PIXEL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Iframes ocultos y scripts externos fuera del clon; el root nunca se filtra y los nodos de
// texto (sin tagName) pasan.
export function excludeNonVisualNodes(root: HTMLElement) {
    return (node: HTMLElement): boolean => {
        if (node === root) return true;
        const tag = node.tagName;
        if (!tag) return true;
        return tag !== 'IFRAME' && tag !== 'SCRIPT';
    };
}
