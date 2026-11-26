export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToasterOptions {
    containerId?: string;
}

export interface Toaster {
    show: (message: string, type?: ToastType, duration?: number) => void;
}

function _removeToast(toast: HTMLElement) {
    toast.classList.remove('is-visible');
    toast.addEventListener(
        'transitionend',
        function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        },
        { once: true }
    );
    // Fallback si la transición no dispara
    setTimeout(function () {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 400);
}

export function createToaster(options: ToasterOptions = {}): Toaster {
    const containerId = options.containerId || 'edt-toast-container';

    function _ensureContainer(): HTMLElement {
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.className = 'edt-toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'false');
            document.body.appendChild(container);
        }
        return container;
    }

    // Nodo assertive PERSISTENTE para errores (role=alert): visualmente oculto; el
    // texto se escribe ahí además del toast visible para que el SR interrumpa.
    function _ensureAlertNode(): HTMLElement {
        const id = containerId + '-alert';
        let node = document.getElementById(id);
        if (!node) {
            node = document.createElement('div');
            node.id = id;
            node.className = 'edt-toast-sr-alert';
            node.setAttribute('role', 'alert');
            document.body.appendChild(node);
        }
        return node;
    }

    function show(message: string, type: ToastType = 'info', duration?: number) {
        const ms = typeof duration === 'number' ? duration : 4000;
        const container = _ensureContainer();

        const toast = document.createElement('div');
        toast.className = 'edt-toast';
        if (type !== 'info') {
            toast.classList.add('edt-toast--' + type);
        }
        toast.textContent = message;
        container.appendChild(toast);

        if (type === 'error') {
            const alertNode = _ensureAlertNode();
            alertNode.textContent = ''; // re-anunciar aunque se repita el mismo texto
            alertNode.textContent = message;
        }

        void toast.offsetHeight;

        requestAnimationFrame(function () {
            toast.classList.add('is-visible');
        });

        let removeTimer = setTimeout(function () {
            _removeToast(toast);
        }, ms);
        toast.addEventListener('mouseenter', function () {
            clearTimeout(removeTimer);
        });
        toast.addEventListener('mouseleave', function () {
            removeTimer = setTimeout(function () {
                _removeToast(toast);
            }, 1500);
        });
    }

    return { show };
}
