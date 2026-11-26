import { enhanceSelect, destroySelect } from '@widgets/searchable-select/searchable-select.ts';
import { getCCAAList, getProvinceList, hasHolidayData } from './planner-holidays.ts';
import { getDefaultHolidaysConfig, setHolidaysConfig, getYear } from './planner-state.ts';
import { t } from './planner-i18n.ts';
import { SS_HOOK, ssOpts, ssSelect } from './planner-config-builders.ts';
import type { HolidaysConfig } from './planner-types.ts';

// Sección FIJA de Festivos del panel Config, compartida por mensual y trimestral.
// El DRAFT vive en el panel (se revierte con su Cancelar): aquí llega por accessor y se MUTA.
export function createHolidaysSection(deps: {
    container: HTMLElement | null;
    render: () => void;
    getDraft: () => HolidaysConfig | null;
    showHolidaysOff: () => boolean;
}) {
    const { container, render } = deps;

    function holidaysNoDataNotice() {
        const note = document.createElement('p');
        note.className = 'planner-config__nodata';
        note.textContent = t('holidaysNoData').replace('{year}', String(getYear()));
        return note;
    }

    function build() {
        if (!container) return;
        // innerHTML='' NO dispara el observer del widget (vigila al PADRE del wrapper, y aquí muere
        // el abuelo): sin este destroy cada reconstrucción deja un .edt-ss-panel huérfano en <body>.
        container.querySelectorAll<HTMLSelectElement>(SS_HOOK).forEach(destroySelect);
        container.innerHTML = '';

        if (!hasHolidayData(getYear())) {
            container.appendChild(holidaysNoDataNotice());
            return;
        }

        const draftHolidaysConfig = deps.getDraft()!;
        const holidaysDefaults = getDefaultHolidaysConfig();

        // ── Row: CCAA selector + reset ──
        const ccaaWrap = document.createElement('div');
        ccaaWrap.className = 'planner-config__select-row';

        const ccaaLabel = document.createElement('label');
        ccaaLabel.className = 'planner-config__select-label';
        ccaaLabel.textContent = t('labelCCAA');
        ccaaWrap.appendChild(ccaaLabel);

        const ccaaOptions = [
            { value: '__ALL__', label: t('optionAllHolidays') },
            ...getCCAAList().map((c) => ({ value: c.code, label: c.name })),
        ];

        const ccaaSelect = ssSelect('holidaysCcaaSelect', ccaaOptions, draftHolidaysConfig.ccaa, t('placeholderNoneF'));
        ccaaLabel.htmlFor = ccaaSelect.id;
        // ⚠️ Con ↑/↓ el widget aplica el valor EN VIVO: esto corre una vez por flecha.
        ccaaSelect.addEventListener('change', () => {
            const val = ccaaSelect.value;
            draftHolidaysConfig.ccaa = val || null;
            // Solo se anula la provincia si deja de ser válida. Anularla siempre haría que
            // recorrer la lista con las flechas la perdiese, y Escape no la devolvería.
            if (!getProvinceList(val).some((p) => p.code === draftHolidaysConfig.province)) {
                draftHolidaysConfig.province = null;
            }
            ccaaReset.disabled = (val || null) === holidaysDefaults.ccaa;
            setHolidaysConfig(draftHolidaysConfig);
            rebuildHolidaysProvinceSelector();
            render();
        });
        ccaaWrap.appendChild(ccaaSelect);

        const ccaaReset = document.createElement('button');
        ccaaReset.type = 'button';
        ccaaReset.className = 'planner-config__num-reset';
        ccaaReset.title = t('btnReset');
        ccaaReset.setAttribute('aria-label', `${t('btnReset')} ${t('labelCCAA')}`);
        ccaaReset.innerHTML = '<i class="fas fa-undo"></i>';
        ccaaReset.disabled = draftHolidaysConfig.ccaa === holidaysDefaults.ccaa;
        ccaaReset.addEventListener('click', () => {
            draftHolidaysConfig.ccaa = holidaysDefaults.ccaa;
            draftHolidaysConfig.province = holidaysDefaults.province;
            ccaaReset.disabled = true;
            setHolidaysConfig(draftHolidaysConfig);
            rebuildHolidaysProvinceSelector();
            render();
            // Rebuild to update dropdown display
            build();
        });
        ccaaWrap.appendChild(ccaaReset);
        container.appendChild(ccaaWrap);
        enhanceSelect(ccaaSelect, ssOpts());

        // La fila de la capital: el rótulo dice «Capital», pero el campo sigue siendo `province` (viaja en PLN1)
        const provWrap = document.createElement('div');
        provWrap.className = 'planner-config__select-row';

        const provLabel = document.createElement('label');
        provLabel.className = 'planner-config__select-label';
        provLabel.textContent = t('labelProvince');
        provWrap.appendChild(provLabel);

        let provDropdown: HTMLSelectElement | null = null;

        function rebuildHolidaysProvinceSelector() {
            const provinces = getProvinceList(draftHolidaysConfig.ccaa);
            if (provDropdown) {
                destroySelect(provDropdown);
                provDropdown.remove();
            }

            const provOptions =
                provinces.length > 0
                    ? [
                          { value: '__ALL__', label: t('optionAllHolidays') },
                          ...provinces.map((p) => ({ value: p.code, label: p.name, alias: p.alias })),
                      ]
                    : [];

            provDropdown = ssSelect(
                'holidaysProvinceSelect',
                provOptions,
                draftHolidaysConfig.province,
                t('placeholderNoneF')
            );
            provLabel.htmlFor = provDropdown.id;
            provDropdown.addEventListener('change', () => {
                const val = provDropdown!.value;
                draftHolidaysConfig.province = val || null;
                provReset.disabled =
                    draftHolidaysConfig.ccaa === holidaysDefaults.ccaa
                        ? (val || null) === holidaysDefaults.province
                        : (val || null) === null;
                setHolidaysConfig(draftHolidaysConfig);
                render();
            });
            provWrap.insertBefore(provDropdown, provReset);
            if (provWrap.isConnected) enhanceSelect(provDropdown, ssOpts());
            provWrap.style.display = provinces.length > 0 ? '' : 'none';
        }

        const provReset = document.createElement('button');
        provReset.type = 'button';
        provReset.className = 'planner-config__num-reset';
        provReset.title = t('btnReset');
        provReset.setAttribute('aria-label', `${t('btnReset')} ${t('labelProvince')}`);
        provReset.innerHTML = '<i class="fas fa-undo"></i>';
        provReset.disabled =
            draftHolidaysConfig.ccaa === holidaysDefaults.ccaa
                ? draftHolidaysConfig.province === holidaysDefaults.province
                : draftHolidaysConfig.province === null;
        provReset.addEventListener('click', () => {
            draftHolidaysConfig.province =
                draftHolidaysConfig.ccaa === holidaysDefaults.ccaa ? holidaysDefaults.province : null;
            rebuildHolidaysProvinceSelector();
            provReset.disabled = true;
            setHolidaysConfig(draftHolidaysConfig);
            render();
        });
        provWrap.appendChild(provReset);
        container.appendChild(provWrap);
        rebuildHolidaysProvinceSelector();

        // Siempre visibles; deshabilitados cuando el toggle Festivos del estilo activo esta OFF
        const holidaysOff = deps.showHolidaysOff();
        ccaaWrap.classList.toggle('is-disabled', holidaysOff);
        provWrap.classList.toggle('is-disabled', holidaysOff);
    }

    return { build };
}
