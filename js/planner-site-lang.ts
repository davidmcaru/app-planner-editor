import { AJUSTE_IDIOMA } from '@core/ajustes/ajustes-general.ts';
import { leerAjuste, observarAjuste } from '@core/ajustes/ajustes-sync.ts';
import { chromeAbierto } from './planner-events.ts';
import { setLang } from './planner-i18n.ts';
import { isTranslating } from './planner-toolbar-i18n.ts';
import { isExporting } from './planner-translation.ts';

const RETRY_MS = 300;
let site = 'es';
let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

// Lo ya pintado se quedaría en el idioma de antes, y a mitad de traducción su setLang final pisaría este
const busy = (): boolean =>
    chromeAbierto() || isTranslating() || isExporting() || !!document.querySelector('.planner-cell-editor');

// Por temporizador y no en panelStore.onChange: Guardar cierra el panel ANTES de su commitHistory, que fija textsLang
function applyPending(): void {
    clearTimeout(timer);
    if (pending === null) return;
    if (busy()) {
        timer = setTimeout(applyPending, RETRY_MS);
        return;
    }
    const lang = pending;
    pending = null;
    setLang(lang);
}

// Solo la interfaz: traducir, textsLang y el historial son del botón y de «Traducir mis textos», que piden permiso
export function followSiteLang(): void {
    site = leerAjuste(AJUSTE_IDIOMA);
    observarAjuste(AJUSTE_IDIOMA, (value) => {
        // pageshow y el storage de clave null repiten el aviso sin que el ajuste de idioma haya cambiado
        if (value === site) return;
        site = value;
        pending = value;
        applyPending();
    });
    // En captura, antes que su handler (que ignora el clic en vuelo): el botón es posterior al aplazado y manda él
    document.getElementById('langToggle')?.addEventListener(
        'click',
        () => {
            if (isTranslating()) return;
            clearTimeout(timer);
            pending = null;
        },
        true
    );
}
