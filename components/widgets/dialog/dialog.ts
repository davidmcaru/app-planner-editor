import { createFocusTrap } from '../../core/focus-trap/focus-trap.ts';

export interface ConfirmOptions {
    /** Título de la cabecera (sin él, el diálogo va sin cabecera). */
    title?: string;
    icon?: string;
    okLabel?: string;
    cancelLabel?: string;
    /** Acción destructiva: el foco inicial va a Cancelar (Enter no ejecuta por accidente).
     *  El OK conserva el verde estándar. */
    danger?: boolean;
    okIcon?: string;
    /** false = elección OBLIGATORIA: ni Escape ni el clic en el fondo cierran — solo los
     *  botones deciden. Para confirms cuya respuesta se PERSISTE: un dismiss no es una respuesta. Default true. */
    dismissible?: boolean;
    /** Clases del OK; sin ellas, el verde de guardar (el ámbar de «Cerrar la cartera»: `edt-action edt-action--restore`). */
    okClassName?: string;
    /** Clases de Cancelar; sin ellas, el rojo de siempre. Con un OK que borra en rojo, Cancelar va en gris (`edt-action edt-action--neutral`): dos rojos a la vez confunden. */
    cancelClassName?: string;
    /** Lo que va bajo el mensaje (un formulario pequeño): quien llama lee sus valores cuando resuelve a true. */
    content?: Node;
    /** Se consulta al aceptar: si devuelve un texto, sale como error y el diálogo sigue abierto. */
    check?: () => string | null;
}

export interface PromptOptions extends ConfirmOptions {
    defaultValue?: string;
    placeholder?: string;
    type?: string;
    /** Textarea monoespaciado (estilo .edt-saved-paste); Enter NO envía. */
    multiline?: boolean;
    /** Solo lectura (p. ej. mostrar un código para copiarlo). */
    readOnly?: boolean;
}

function _buildShell(
    opts: ConfirmOptions,
    labelledBy: string
): {
    overlay: HTMLDivElement;
    box: HTMLDivElement;
    body: HTMLDivElement;
    footer: HTMLDivElement;
    cancelBtn: HTMLButtonElement;
    okBtn: HTMLButtonElement;
} {
    const overlay = document.createElement('div');
    overlay.className = 'edt-dlg-overlay active';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', labelledBy);

    const box = document.createElement('div');
    box.className = 'edt-dlg';

    if (opts.title) {
        const header = document.createElement('div');
        header.className = 'edt-dlg__header';
        if (opts.icon) {
            const iconWrap = document.createElement('span');
            iconWrap.className = 'edt-dlg__icon';
            const i = document.createElement('i');
            i.className = 'fas ' + opts.icon;
            i.setAttribute('aria-hidden', 'true');
            iconWrap.appendChild(i);
            header.appendChild(iconWrap);
        }
        const h3 = document.createElement('h3');
        h3.textContent = opts.title;
        header.appendChild(h3);
        box.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'edt-dlg__body';
    box.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'edt-dlg__footer';

    const mkBtn = (classes: string, extra: string, faIcon: string, label: string): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = classes + ' ' + extra;
        const i = document.createElement('i');
        i.className = 'fas ' + faIcon;
        i.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.textContent = label;
        b.appendChild(i);
        b.appendChild(document.createTextNode(' '));
        b.appendChild(span);
        return b;
    };

    const okClasses = opts.okClassName || 'edt-action edt-action--save';
    const cancelBtn = mkBtn(
        opts.cancelClassName || 'edt-action edt-action--cancel',
        'edt-dlg__cancel',
        'fa-times',
        opts.cancelLabel || 'Cancelar'
    );
    const okBtn = mkBtn(okClasses, 'edt-dlg__ok', opts.okIcon || 'fa-check', opts.okLabel || 'Aceptar');
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    box.appendChild(footer);
    overlay.appendChild(box);
    return { overlay, box, body, footer, cancelBtn, okBtn };
}

/**
 * Diálogo de confirmación accesible (modal in-page). Reemplaza window.confirm —
 * promesa que resuelve a boolean. Focus-trap; Enter respeta el foco (con foco en
 * Cancelar NO ejecuta — clave en los danger, cuyo foco inicial es Cancelar).
 */
export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
        const { overlay, box, body, cancelBtn, okBtn } = _buildShell(opts, 'edt-dlg-msg');
        const dismissible = opts.dismissible !== false;
        const msg = document.createElement('p');
        msg.id = 'edt-dlg-msg';
        msg.textContent = message;
        body.appendChild(msg);
        if (opts.content) body.appendChild(opts.content);
        const error = document.createElement('p');
        error.className = 'edt-dlg__error';
        error.setAttribute('role', 'alert');
        error.hidden = true;
        if (opts.check) body.appendChild(error);
        document.body.appendChild(overlay);

        const trap = createFocusTrap(box, { initialFocus: opts.danger ? cancelBtn : okBtn });
        trap.activate();

        const close = (result: boolean): void => {
            trap.deactivate();
            overlay.remove();
            document.removeEventListener('keydown', onKey, true);
            resolve(result);
        };
        const aceptar = (): void => {
            const fallo = opts.check?.() ?? null;
            if (!fallo) return close(true);
            error.textContent = fallo;
            error.hidden = false;
        };
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                if (!dismissible) return; // elección obligatoria: Escape no responde por ti
                e.preventDefault();
                close(false);
            } else if (e.key === 'Enter') {
                const activo = document.activeElement;
                // Un botón del contenido se pulsa con Intro, como siempre, y un
                // enlace (el de la política en el permiso de traducción) se abre: Intro ahí no es aceptar
                if (activo instanceof HTMLButtonElement && activo !== okBtn && activo !== cancelBtn) return;
                if (activo instanceof HTMLAnchorElement) return;
                e.preventDefault();
                if (activo === cancelBtn) close(false);
                else aceptar();
            }
        };
        cancelBtn.addEventListener('click', () => close(false));
        okBtn.addEventListener('click', aceptar);
        overlay.addEventListener('click', (e) => {
            if (dismissible && e.target === overlay) close(false);
        });
        document.addEventListener('keydown', onKey, true);
    });
}

/**
 * Diálogo de prompt accesible (modal in-page) — sustituye a window.prompt.
 * Resuelve a string con el valor o `null` si se cancela.
 */
export function promptDialog(message: string, opts: PromptOptions = {}): Promise<string | null> {
    return new Promise((resolve) => {
        const { overlay, box, body, cancelBtn, okBtn } = _buildShell(opts, 'edt-dlg-msg');
        const dismissible = opts.dismissible !== false;
        const msg = document.createElement('p');
        msg.id = 'edt-dlg-msg';
        msg.textContent = message;
        body.appendChild(msg);

        let input: HTMLInputElement | HTMLTextAreaElement;
        if (opts.multiline) {
            input = document.createElement('textarea');
            (input as HTMLTextAreaElement).rows = 4;
            input.spellcheck = false;
            input.className = 'edt-dlg__input edt-saved-paste';
        } else {
            input = document.createElement('input');
            (input as HTMLInputElement).type = opts.type || 'text';
            input.className = 'edt-dlg__input';
        }
        input.value = opts.defaultValue || '';
        if (opts.placeholder) input.placeholder = opts.placeholder;
        if (opts.readOnly) input.readOnly = true;
        input.setAttribute('aria-label', message);
        body.appendChild(input);
        document.body.appendChild(overlay);

        const trap = createFocusTrap(box, { initialFocus: input });
        trap.activate();
        input.select();

        const close = (result: string | null): void => {
            trap.deactivate();
            overlay.remove();
            document.removeEventListener('keydown', onKey, true);
            resolve(result);
        };
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                if (!dismissible) return; // elección obligatoria: Escape no responde por ti
                e.preventDefault();
                close(null);
            } else if (e.key === 'Enter' && !opts.multiline) {
                // En multiline (textarea) Enter inserta salto de línea; se envía con el botón.
                // Enter respeta el foco: con foco en Cancelar equivale a cancelar.
                e.preventDefault();
                close(document.activeElement === cancelBtn ? null : input.value);
            }
        };
        cancelBtn.addEventListener('click', () => close(null));
        okBtn.addEventListener('click', () => close(input.value));
        overlay.addEventListener('click', (e) => {
            if (dismissible && e.target === overlay) close(null);
        });
        document.addEventListener('keydown', onKey, true);
    });
}
