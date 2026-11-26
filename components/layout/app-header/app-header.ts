import { APP_CONFIG } from '@core/app-config/app.config.ts';
import { AJUSTE_TRADUCCION } from '@core/ajustes/ajustes-planner.ts';
import { escribirAjuste, leerAjuste, observarAjuste } from '@core/ajustes/ajustes-sync.ts';

// La cabecera y el pie mínimos de la app: el enlace al código, el permiso de traducción y el tema.
// El botón del tema (`#theme-toggle`) lo lleva `components/core/theme/theme-toggle.ts`.

function initRepoLinks(): void {
    document.querySelectorAll<HTMLAnchorElement>('[data-repo-link]').forEach((link) => {
        link.href = APP_CONFIG.repoUrl;
    });
}

function initSettingsMenu(): void {
    const toggle = document.getElementById('settingsToggle');
    const menu = document.getElementById('settingsMenu');
    if (!toggle || !menu) return;
    const radios = Array.from(menu.querySelectorAll<HTMLInputElement>('input[name="translationConsent"]'));

    const paint = (value: string): void => {
        for (const radio of radios) radio.checked = radio.value === value;
    };
    const close = (): void => {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    };
    const open = (): void => {
        paint(leerAjuste(AJUSTE_TRADUCCION));
        menu.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        // El menú va detrás de la cabecera en el DOM: sin esto, el Tab desde el engranaje pasaría antes por el tema
        (radios.find((radio) => radio.checked) || radios[0])?.focus();
    };

    toggle.addEventListener('click', () => {
        if (menu.hidden) open();
        else close();
    });
    for (const radio of radios) {
        radio.addEventListener('change', () => {
            if (radio.checked) escribirAjuste(AJUSTE_TRADUCCION, radio.value);
        });
    }
    // El permiso también cambia al contestar al diálogo de la primera traducción, y desde otra pestaña
    observarAjuste(AJUSTE_TRADUCCION, paint);

    document.addEventListener('click', (ev) => {
        if (menu.hidden || !(ev.target instanceof Node)) return;
        if (!menu.contains(ev.target) && !toggle.contains(ev.target)) close();
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape' || menu.hidden) return;
        close();
        toggle.focus();
    });
    // Si el foco sale del menú con el teclado, se cierra (al pulsar fuera ya lo cierra el clic)
    menu.addEventListener('focusout', (ev) => {
        const destino = ev.relatedTarget;
        if (menu.hidden || !(destino instanceof Node)) return;
        if (!menu.contains(destino) && !toggle.contains(destino)) close();
    });
}

initRepoLinks();
initSettingsMenu();
