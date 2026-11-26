import { getBp } from '@core/breakpoint/get-bp.ts';
import { t } from './planner-i18n.ts';

export const SS_HOOK = 'select.planner-ss';

// Se reconstruyen en CADA enhance: `t` depende del idioma vivo y onLangChange no rehace el panel.
export function ssOpts() {
    return {
        t,
        searchPlaceholder: t('placeholderSearch'),
        // 't' cuenta como táctil para NO robarle el foco al buscador. El corte de LAYOUT es otro (728).
        isMobile: () => getBp() !== 'd',
        syncEventName: 'planner-ss:sync',
    };
}

/** `<select>` del widget compartido: opción vacía (sustituye al ✕ que el compartido no trae) + ítems. */
export function ssSelect(
    id: string,
    items: Array<{ value: string; label: string; alias?: readonly string[] }>,
    value: string | null | undefined,
    placeholder: string
): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.id = id;
    sel.className = 'planner-ss';
    const vacia = document.createElement('option');
    vacia.value = '';
    vacia.textContent = placeholder;
    sel.appendChild(vacia);
    for (const it of items) {
        const o = document.createElement('option');
        o.value = it.value;
        o.textContent = it.label;
        // Otros nombres por los que la encuentra el buscador del widget (data-ss-alias, separados por «|»)
        if (it.alias?.length) o.dataset.ssAlias = it.alias.join('|');
        sel.appendChild(o);
    }
    sel.value = value || '';
    return sel;
}
