import { attachHoldRepeat } from '@features/utils/hold-repeat.ts';
import { getBp } from '@core/breakpoint/get-bp.ts';
import { enhanceSelect, destroySelect } from '@widgets/searchable-select/searchable-select.ts';
import { onLangChange } from './planner-i18n.ts';
import { THEMES, TEXT_STYLES, FONT_DEFAULTS, getEffectiveFontKey } from './planner-themes.ts';
import { applyDesignConfig } from './planner-design-panel.ts';
import { preloadFont } from './planner-font-preload.ts';
import { SIZE_MAX, SIZE_MIN } from './planner-sanitize.ts';
import type { PlannerContext } from './planner-context.ts';
import type { BoldMode, DesignConfig, TextConfig } from './planner-types.ts';

// ── APPLY — Set text-related CSS custom properties ──

// Opciones del searchable-select compartido. Se rehacen en cada enhance: `t` depende del idioma
// vivo. 't' cuenta como táctil para no robarle el foco al buscador (el corte de LAYOUT es 728).
function ssOpts(t: (key: string) => string) {
    return {
        t,
        searchPlaceholder: t('placeholderSearchFont'),
        isMobile: () => getBp() !== 'd',
        syncEventName: 'planner-ss:sync',
    };
}

/**
 * Guarda el estado (fuente + tamaño) al empezar a interactuar con el desplegable, para poder
 * devolver el tamaño si el usuario vuelve al valor de partida — que es lo que hace Escape.
 */
function recordarAlAbrir(
    select: HTMLSelectElement,
    setter: (v: { style: string | null; size: number | null }) => void,
    leer: () => { style: string | null; size: number | null }
) {
    const outer = select.nextElementSibling;
    if (!outer) return;
    for (const ev of ['pointerdown', 'keydown']) {
        outer.addEventListener(ev, () => setter(leer()));
    }
}

export function applyTextConfig(textCfg: TextConfig, designCfg: DesignConfig) {
    const root = document.documentElement;
    const theme = THEMES[designCfg.theme] || THEMES.classic;

    // Month palette: designConfig accent, fallback to theme
    const accentKey = designCfg.accentPalette;
    const accentTheme = accentKey ? THEMES[accentKey] || theme : theme;
    accentTheme.months.forEach((c, i) => {
        root.style.setProperty(`--planner-month-${i}`, c);
    });

    // Text factor (proportional scaling: step × 0.03)
    const bodyFontKey = getEffectiveFontKey({ ...designCfg, textStyle: textCfg.textStyle });
    const textSizeOffset = FONT_DEFAULTS[bodyFontKey]?.textSizeOffset || 0;
    const textOffset = (textCfg.textSize !== null ? textCfg.textSize : 8) + textSizeOffset;
    root.style.setProperty('--planner-text-factor', String(1 + textOffset * 0.03));

    // Body font: textConfig.textStyle overrides theme default
    const style = textCfg.textStyle ? TEXT_STYLES[textCfg.textStyle] : null;
    const font = style || theme.font;
    root.style.setProperty('--planner-font-body', font.body);

    // Body text bold (3-state: null = font default, 'bold' = 700, 'light' = 400)
    const bodyWeight =
        textCfg.boldText === 'bold'
            ? 700
            : textCfg.boldText === 'light'
              ? 400
              : ('bodyWeight' in font && typeof font.bodyWeight === 'number' ? font.bodyWeight : null) || 400;
    root.style.setProperty('--planner-body-weight', String(bodyWeight));

    // Preload de la fuente activa para acelerar primer pintado.
    // Idempotente — solo añade `<link rel="preload">` la primera vez por sesión.
    preloadFont(bodyFontKey);
}

// ── INIT — Wire up all text panel controls ──

export function initTextPanel(deps: PlannerContext) {
    const { render, t, getDesignConfig, onAfterRender } = deps;

    // ── Title typography DOM ──
    const titleSizeInput = document.getElementById('textTitleSizeInput') as HTMLInputElement | null;
    const titleSizeMinus = document.getElementById('textTitleSizeMinus');
    const titleSizePlus = document.getElementById('textTitleSizePlus');
    const titleBoldBtn = document.getElementById('textTitleBoldBtn');

    // ── Text typography DOM ──
    const sizeInput = document.getElementById('textSizeInput') as HTMLInputElement | null;
    const sizeMinus = document.getElementById('textSizeMinus');
    const sizePlus = document.getElementById('textSizePlus');
    const boldBtn = document.getElementById('textBoldBtn');
    const fontSelect = document.getElementById('textFontSelect') as HTMLSelectElement | null;

    let _cuerpoAlAbrir: { style: string | null; size: number | null } | null = null;
    let _rearmarCuerpo: (() => void) | null = null;

    let draftText: TextConfig | null = null; // textConfig draft
    let draftTitle: { titleSize: number; boldTitle: BoldMode; textStyle: string | null } | null = null;

    const clampSize = (v: number) => Math.max(SIZE_MIN, Math.min(SIZE_MAX, v));
    for (const input of [titleSizeInput, sizeInput]) {
        if (!input) continue;
        input.min = String(SIZE_MIN);
        input.max = String(SIZE_MAX);
    }

    /* ── Apply drafts (live preview) ── */

    function applyTextDraft() {
        applyTextConfig(draftText!, getDesignConfig());
        render();
        onAfterRender?.();
    }

    function applyTitleDraft() {
        const merged = { ...getDesignConfig(), ...draftTitle };
        applyDesignConfig(merged);
        render();
        onAfterRender?.();
    }

    // ── TITLE TYPOGRAPHY (moved from design panel) ──

    /* ── Title size ── */

    function buildTitleSizeControl() {
        if (!titleSizeInput) return;
        titleSizeInput.value = String(draftTitle!.titleSize || 0);
        updateTitleBoldBtn();
    }

    function changeTitleSize(delta: number) {
        const current = draftTitle!.titleSize || 0;
        const next = clampSize(current + delta);
        draftTitle!.titleSize = next;
        if (titleSizeInput) titleSizeInput.value = String(next);
        applyTitleDraft();
    }

    if (titleSizeMinus) attachHoldRepeat(titleSizeMinus, () => changeTitleSize(-1));
    if (titleSizePlus) attachHoldRepeat(titleSizePlus, () => changeTitleSize(1));
    if (titleSizeInput) {
        titleSizeInput.addEventListener('change', () => {
            let val = parseInt(titleSizeInput.value, 10);
            if (isNaN(val)) val = 0;
            val = clampSize(val);
            draftTitle!.titleSize = val;
            titleSizeInput.value = String(val);
            applyTitleDraft();
        });
    }

    /* ── Title bold 2-state (null → 'light' → null) ── */

    const TITLE_BOLD_CYCLE: BoldMode[] = [null, 'light'];

    function cycleTitleBold(currentValue: BoldMode): BoldMode {
        const idx = TITLE_BOLD_CYCLE.indexOf(currentValue);
        return TITLE_BOLD_CYCLE[(idx + 1) % TITLE_BOLD_CYCLE.length] ?? null;
    }

    function updateTitleBoldBtn() {
        if (!titleBoldBtn) return;
        titleBoldBtn.classList.remove('is-bold', 'is-light');
        if (draftTitle!.boldTitle === 'light') {
            titleBoldBtn.classList.add('is-light');
            titleBoldBtn.title = t('boldLight');
        } else {
            titleBoldBtn.title = t('boldDefault');
        }
    }

    if (titleBoldBtn) {
        titleBoldBtn.addEventListener('click', () => {
            draftTitle!.boldTitle = cycleTitleBold(draftTitle!.boldTitle);
            updateTitleBoldBtn();
            applyTitleDraft();
        });
    }

    /** `<option>` con la familia en `data-ss-font`: el value es una CLAVE, no una font-family. */
    function fontOption(value: string, label: string, familia: string) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        if (familia) o.dataset.ssFont = familia;
        return o;
    }

    // ── TEXT TYPOGRAPHY (body text — size + font) ──

    /* ── Text size controls ── */

    function buildSizeControl() {
        if (!sizeInput) return;
        sizeInput.value = String(draftText!.textSize !== null ? draftText!.textSize : 8);
        updateBoldBtn();
    }

    function changeSize(delta: number) {
        const current = draftText!.textSize !== null ? draftText!.textSize : 8;
        const next = clampSize(current + delta);
        draftText!.textSize = next;
        if (sizeInput) sizeInput.value = String(next);
        applyTextDraft();
    }

    if (sizeMinus) attachHoldRepeat(sizeMinus, () => changeSize(-1));
    if (sizePlus) attachHoldRepeat(sizePlus, () => changeSize(1));
    if (sizeInput) {
        sizeInput.addEventListener('change', () => {
            let val = parseInt(sizeInput.value, 10);
            if (isNaN(val)) val = 8;
            val = clampSize(val);
            draftText!.textSize = val;
            sizeInput.value = String(val);
            applyTextDraft();
        });
    }

    /* ── Body text bold 3-state (null → 'bold' → 'light' → null) ── */

    function updateBoldBtn() {
        if (!boldBtn) return;
        boldBtn.classList.remove('is-bold', 'is-light');
        if (draftText!.boldText === 'bold') {
            boldBtn.classList.add('is-bold');
            boldBtn.title = t('boldForced');
        } else if (draftText!.boldText === 'light') {
            boldBtn.classList.add('is-light');
            boldBtn.title = t('boldLight');
        } else {
            boldBtn.title = t('boldDefault');
        }
    }

    if (boldBtn) {
        boldBtn.addEventListener('click', () => {
            const BOLD_CYCLE: BoldMode[] = [null, 'bold', 'light'];
            const idx = BOLD_CYCLE.indexOf(draftText!.boldText as BoldMode);
            draftText!.boldText = BOLD_CYCLE[(idx + 1) % BOLD_CYCLE.length] ?? null;
            updateBoldBtn();
            applyTextDraft();
        });
    }

    /* ── Text font dropdown ── */
    function updateFontDisplay() {
        if (!fontSelect) return;
        fontSelect.value = draftText?.textStyle || '';
        fontSelect.dispatchEvent(new CustomEvent('planner-ss:sync'));
    }

    function buildFontDropdown() {
        if (!fontSelect) return;
        if (fontSelect.options.length === 0) {
            const temaBody = THEMES[getDesignConfig()?.theme || 'classic']?.font?.body || '';
            fontSelect.appendChild(fontOption('', t('designFontDefault'), temaBody));
            Object.entries(TEXT_STYLES).forEach(([key, style]) => {
                fontSelect.appendChild(fontOption(key, style.label, style.body));
            });

            // Mismo guard que el de títulos: sin él, recorrer la lista con las flechas destruiría
            // un tamaño personalizado y Escape no lo devolvería.
            fontSelect.addEventListener('change', () => {
                const key = fontSelect.value;
                draftText!.textStyle = key || null;
                if (_cuerpoAlAbrir && (key || null) === _cuerpoAlAbrir.style) {
                    draftText!.textSize = _cuerpoAlAbrir.size ?? 8;
                } else {
                    const defaults = FONT_DEFAULTS[key || getEffectiveFontKey(getDesignConfig())];
                    if (defaults) draftText!.textSize = defaults.textSize;
                }
                // Un solo selector para TODO el texto: los 17 temas usan la misma familia en
                // títulos y cuerpo, así que separarlos solo servía para desparejarlos a mano.
                if (draftTitle) {
                    draftTitle.textStyle = key || null;
                    const dt = FONT_DEFAULTS[key || getEffectiveFontKey(getDesignConfig())];
                    if (dt) draftTitle.titleSize = dt.titleSize;
                    buildTitleSizeControl();
                    applyTitleDraft();
                }
                updateFontDisplay();
                buildSizeControl();
                applyTextDraft();
            });

            _rearmarCuerpo = () => {
                enhanceSelect(fontSelect, ssOpts(t));
                recordarAlAbrir(
                    fontSelect,
                    (v) => (_cuerpoAlAbrir = v),
                    () => ({
                        style: draftText?.textStyle ?? null,
                        size: draftText?.textSize ?? null,
                    })
                );
            };
            _rearmarCuerpo();
        }

        updateFontDisplay();
    }

    function buildPanel() {
        buildTitleSizeControl();
        buildSizeControl();
        buildFontDropdown();
    }

    // El dropdown se monta UNA vez y el widget fotografía labels y placeholder al enhance: sin
    // este re-enhance, «Predeterminada» y el buscador quedarían en el idioma del boot.
    onLangChange(() => {
        if (!fontSelect || fontSelect.options.length === 0 || !_rearmarCuerpo) return;
        const opt0 = fontSelect.options[0];
        if (opt0) opt0.textContent = t('designFontDefault');
        destroySelect(fontSelect);
        _rearmarCuerpo();
    });

    /* ── Public API ── */

    return {
        buildPanel,
        setDraft(cfg: TextConfig | null) {
            draftText = cfg;
        },
        setTitleDraft(cfg: { titleSize: number; boldTitle: BoldMode; textStyle: string | null } | null) {
            draftTitle = cfg;
        },
        getDraft() {
            return draftText;
        },
        getTitleDraft() {
            return draftTitle;
        },
        clearDraft() {
            draftText = null;
            draftTitle = null;
        },
    };
}
