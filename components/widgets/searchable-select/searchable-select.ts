import { getBp } from '../../core/breakpoint/get-bp.ts';

export interface SearchableSelectOptions {
    t?: (key: string) => string;
    searchPlaceholder?: string;
    /** Por defecto `getBp() !== 'd'`, que es la regla --bp del proyecto. */
    isMobile?: () => boolean;
    syncEventName?: string;
}

export interface SearchableSelectHandle {
    destroy: () => void;
}

type SSItem =
    | { type: 'group'; label: string; i18n: string | null }
    | { type: 'option'; value: string; label: string; i18n: string | null; font: string | null; alias: string[] };

const _handles = new WeakMap<HTMLSelectElement, SearchableSelectHandle>();
let _labelSeq = 0;

// Sin tildes, sin mayúsculas y con guion, barra o espacios como un solo espacio: «san sebastian» encuentra
// «San Sebastián» y «Vitoria Gasteiz», «Vitoria-Gasteiz». La primera clase son las marcas combinantes
// U+0300–U+036F escritas tal cual, como en search-engine.ts: tras NFD son las tildes.
const fold = (s: string): string =>
    s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[\s/-]+/g, ' ');

function optionItem(opt: HTMLOptionElement): SSItem {
    return {
        type: 'option',
        value: opt.value,
        label: opt.text,
        i18n: opt.getAttribute('data-i18n'),
        font: opt.dataset.ssFont ?? null,
        alias: (opt.dataset.ssAlias ?? '')
            .split('|')
            .map((a) => a.trim())
            .filter(Boolean),
    };
}

// ⚠️ El <select> va con display:none: su <label for> y su aria-label no llegan al lector. El nombre se le da al
// combobox visible y a su lista, y por aria-labelledby a la etiqueta, que sigue al idioma sin volver a mejorarlo.
function nombrar(select: HTMLSelectElement, destinos: HTMLElement[]): void {
    const labels = Array.from(select.labels ?? []);
    const porId =
        select.getAttribute('aria-labelledby') ||
        labels.map((l) => l.id || (l.id = `edt-ss-label-${++_labelSeq}`)).join(' ');
    const texto = select.getAttribute('aria-label');
    for (const el of destinos) {
        if (porId) el.setAttribute('aria-labelledby', porId);
        else el.removeAttribute('aria-labelledby');
        if (!porId && texto) el.setAttribute('aria-label', texto);
        else el.removeAttribute('aria-label');
    }
}

export function enhanceSelect(
    select: HTMLSelectElement,
    options: SearchableSelectOptions = {}
): SearchableSelectHandle | null {
    if (select.dataset.ssUpgraded) return _handles.get(select) || null;
    select.dataset.ssUpgraded = '1';

    const { t, syncEventName = 'edt-ss:sync' } = options;
    const isMobile = options.isMobile || (() => getBp() !== 'd');
    const searchPlaceholder = options.searchPlaceholder || 'Buscar…';
    // data-ss-font-preview: opción y display se pintan CON su fuente. Sale del `value`; si el value es una CLAVE, la familia va en `data-ss-font`.
    const fontPreview = select.dataset.ssFontPreview != null;

    const items: SSItem[] = [];
    Array.from(select.children).forEach((child) => {
        if (child.tagName === 'OPTGROUP') {
            const group = child as HTMLOptGroupElement;
            items.push({ type: 'group', label: group.label, i18n: group.getAttribute('data-i18n') });
            Array.from(group.children).forEach((child2) => items.push(optionItem(child2 as HTMLOptionElement)));
        } else if (child.tagName === 'OPTION') {
            items.push(optionItem(child as HTMLOptionElement));
        }
    });

    const optionCount = items.filter((i) => i.type === 'option').length;

    select.style.display = 'none';

    const outer = document.createElement('div');
    outer.className = 'edt-ss-outer';

    const wrapper = document.createElement('div');
    wrapper.className = 'edt-ss-dropdown';
    outer.appendChild(wrapper);

    select.parentNode!.insertBefore(outer, select.nextSibling);

    const display = document.createElement('div');
    display.className = 'edt-ss-display';
    display.setAttribute('tabindex', '0');
    display.setAttribute('role', 'combobox');
    display.setAttribute('aria-haspopup', 'listbox');
    display.setAttribute('aria-expanded', 'false');

    const displayText = document.createElement('span');
    displayText.className = 'edt-ss-text';

    const chevron = document.createElement('span');
    chevron.className = 'edt-ss-chevron';
    chevron.textContent = '▾';

    display.appendChild(displayText);
    display.appendChild(chevron);
    wrapper.appendChild(display);

    const panel = document.createElement('div');
    panel.className = 'edt-ss-panel';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'edt-ss-search';
    searchInput.placeholder = searchPlaceholder;
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('spellcheck', 'false');
    panel.appendChild(searchInput);

    const list = document.createElement('div');
    list.className = 'edt-ss-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('tabindex', '-1');
    panel.appendChild(list);

    nombrar(select, [display, list]);
    // Un aria-label que la app traduce en el <select> después de mejorarlo también tiene que llegar al visible
    const nameObserver = new MutationObserver(() => nombrar(select, [display, list]));
    nameObserver.observe(select, { attributes: true, attributeFilter: ['aria-label', 'aria-labelledby'] });

    document.body.appendChild(panel);

    // Evitar que el mousedown o click en el panel cierre el dropdown ni el panel lateral
    panel.addEventListener('mousedown', (e) => e.stopPropagation());
    panel.addEventListener('click', (e) => e.stopPropagation());
    display.addEventListener('click', (e) => e.stopPropagation());

    let isOpen = false;
    let _originalValue: string | null = null; // valor al abrir (para revertir con Escape)

    function updateDisplay() {
        const opt = items.find((o) => o.type === 'option' && o.value === select.value);
        if (opt && opt.type === 'option') {
            displayText.textContent = opt.i18n && t ? t(opt.i18n) : opt.label;
            if (opt.i18n) {
                displayText.setAttribute('data-i18n', opt.i18n);
            } else {
                displayText.removeAttribute('data-i18n');
            }
            if (fontPreview) displayText.style.fontFamily = opt.font || opt.value;
        } else {
            displayText.textContent = '—';
            displayText.removeAttribute('data-i18n');
            if (fontPreview) displayText.style.fontFamily = '';
        }
    }

    function buildList(filter: string) {
        list.innerHTML = '';
        const f = fold(filter || '');
        items.forEach((item) => {
            if (item.type === 'group') {
                // Mostrar cabecera de grupo solo si no hay filtro activo
                if (!f) {
                    const divider = document.createElement('div');
                    divider.className = 'edt-ss-group';
                    divider.textContent = item.i18n && t ? t(item.i18n) : item.label;
                    list.appendChild(divider);
                }
            } else {
                if (f && ![item.label, ...item.alias].some((s) => fold(s).includes(f))) return;
                const opt = document.createElement('div');
                opt.className = 'edt-ss-option';
                opt.dataset.value = item.value;
                if (item.value === select.value) opt.classList.add('is-selected');
                opt.textContent = item.i18n && t ? t(item.i18n) : item.label;
                if (fontPreview) opt.style.fontFamily = item.font || item.value;
                opt.addEventListener('mousedown', (e) => {
                    e.preventDefault(); // Evitar pérdida de foco
                });
                opt.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    select.value = item.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    close();
                    updateDisplay();
                });
                list.appendChild(opt);
            }
        });
    }

    // El panel se voltea hacia arriba si no hay sitio abajo
    function positionPanel() {
        const rect = display.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const panelH = 220;
        panel.style.left = rect.left + 'px';
        panel.style.width = rect.width + 'px';
        if (spaceBelow < panelH && rect.top > panelH) {
            panel.style.top = rect.top - panelH - 4 + 'px';
        } else {
            panel.style.top = rect.bottom + 4 + 'px';
        }
    }

    function _onViewportResize() {
        if (isOpen) positionPanel();
    }

    function handleOutsideClick(e: MouseEvent) {
        const target = e.target as Node | null;
        if (!outer.contains(target) && !panel.contains(target)) close();
    }

    function open() {
        isOpen = true;
        _originalValue = select.value; // recordar para poder revertir con Escape
        if (isMobile()) panel.style.zIndex = '10000';
        positionPanel();
        panel.classList.add('is-open');
        display.setAttribute('aria-expanded', 'true');
        searchInput.value = '';
        buildList('');
        // ⚠️ El teclado arranca en la SELECCIONADA y no en la primera: si no, ↓ saltaba al principio
        const selectedOpt = list.querySelector<HTMLElement>('.edt-ss-option.is-selected');
        if (selectedOpt) {
            selectedOpt.classList.add('is-focused');
            selectedOpt.scrollIntoView({ block: 'nearest' });
        }
        searchInput.style.display = optionCount > 5 ? '' : 'none';
        panel.setAttribute('tabindex', '-1');
        requestAnimationFrame(() => {
            // ⚠️ El foco tiene que caer DENTRO del panel o las flechas hacen scroll de la página. Y va
            // por isMobile() (ancho), NO por «tiene táctil»: un escritorio táctil dejaba el foco fuera
            if (optionCount > 5 && !isMobile()) {
                searchInput.focus();
            } else {
                panel.focus();
            }
            document.addEventListener('mousedown', handleOutsideClick);
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', _onViewportResize);
            window.visualViewport.addEventListener('scroll', _onViewportResize);
        }
    }

    function close() {
        isOpen = false;
        searchInput.blur();
        panel.classList.remove('is-open');
        display.setAttribute('aria-expanded', 'false');
        list.querySelectorAll('.is-focused').forEach((o) => o.classList.remove('is-focused'));
        document.removeEventListener('mousedown', handleOutsideClick);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', _onViewportResize);
            window.visualViewport.removeEventListener('scroll', _onViewportResize);
        }
    }

    function getVisibleOpts() {
        return [...list.querySelectorAll<HTMLElement>('.edt-ss-option')];
    }
    function getFocusedIdx(opts: HTMLElement[]) {
        return opts.findIndex((o) => o.classList.contains('is-focused'));
    }
    function setFocusIdx(opts: HTMLElement[], idx: number) {
        opts.forEach((o) => o.classList.remove('is-focused'));
        const el = opts[idx];
        if (idx >= 0 && idx < opts.length && el) {
            el.classList.add('is-focused');
            el.scrollIntoView({ block: 'nearest' });
        }
    }

    // Aplica en vivo el valor de una opción (vista previa) SIN cerrar el desplegable,
    // para poder comparar tipografías/filtros/página al vuelo con las flechas del teclado.
    function applyValueLive(val: string | null | undefined) {
        if (val === undefined || val === null) return;
        if (select.value !== val) {
            select.value = val;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        updateDisplay();
        getVisibleOpts().forEach((o) => o.classList.toggle('is-selected', o.dataset.value === val));
    }

    panel.addEventListener('keydown', (e) => {
        if (!isOpen) return;
        const opts = getVisibleOpts();
        const cur = getFocusedIdx(opts);
        switch (e.key) {
            case 'ArrowDown': {
                e.preventDefault();
                const idx = cur < opts.length - 1 ? cur + 1 : 0;
                setFocusIdx(opts, idx);
                applyValueLive(opts[idx]?.dataset.value); // vista previa en vivo
                break;
            }
            case 'ArrowUp': {
                e.preventDefault();
                const idx = cur > 0 ? cur - 1 : opts.length - 1;
                setFocusIdx(opts, idx);
                applyValueLive(opts[idx]?.dataset.value); // vista previa en vivo
                break;
            }
            case 'Home': {
                e.preventDefault();
                setFocusIdx(opts, 0);
                applyValueLive(opts[0]?.dataset.value);
                break;
            }
            case 'End': {
                e.preventDefault();
                setFocusIdx(opts, opts.length - 1);
                applyValueLive(opts[opts.length - 1]?.dataset.value);
                break;
            }
            case 'Enter':
                e.preventDefault();
                // El valor ya está aplicado por la vista previa: Enter solo confirma y cierra.
                close();
                display.focus();
                break;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                applyValueLive(_originalValue); // revertir al valor que había al abrir
                close();
                display.focus();
                break;
            case 'Tab':
                close(); // mantiene el valor actual (confirmar)
                break;
        }
    });

    display.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) open();
        } else if (e.key === 'Escape' && isOpen) {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    });

    display.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen) close();
        else open();
    });

    searchInput.addEventListener('input', () => buildList(searchInput.value));
    searchInput.addEventListener('mousedown', (e) => e.stopPropagation());

    select.addEventListener('change', updateDisplay);
    // Sincronizar el display tras asignar select.value programáticamente
    // (bindControl / _setInputValue) sin disparar los callbacks de 'change'.
    select.addEventListener(syncEventName, updateDisplay);

    // ⚠️ El observer de respaldo va acotado al PADRE del wrapper: NUNCA uno de document.body por instancia
    let cleanupObserver: MutationObserver | null = null;
    const handle: SearchableSelectHandle = {
        destroy() {
            close();
            nameObserver.disconnect();
            panel.remove();
            outer.remove();
            select.style.display = '';
            delete select.dataset.ssUpgraded;
            _handles.delete(select);
            if (cleanupObserver) {
                cleanupObserver.disconnect();
                cleanupObserver = null;
            }
        },
    };
    _handles.set(select, handle);

    // El outer ya está insertado; configurar el observer en el siguiente frame
    // (por si el caller lo mueve) sobre su padre real.
    requestAnimationFrame(() => {
        const parent = outer.parentNode;
        if (!parent) return; // ya retirado; destroy() sigue disponible
        cleanupObserver = new MutationObserver(() => {
            if (!parent.contains(outer)) handle.destroy();
        });
        cleanupObserver.observe(parent, { childList: true });
    });

    updateDisplay();
    return handle;
}

/** Mejora todos los `<select>` que casen con el selector (idempotente por elemento). */
export function enhanceAll(selector: string, options: SearchableSelectOptions = {}): void {
    document.querySelectorAll<HTMLSelectElement>(selector).forEach((select) => {
        enhanceSelect(select, options);
    });
}

/** Retira la mejora de un `<select>` (no-op si no estaba mejorado). */
export function destroySelect(select: HTMLSelectElement): void {
    _handles.get(select)?.destroy();
}
