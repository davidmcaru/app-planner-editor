import {
    THEMES,
    DISPLAY_ORDER,
    DISPLAY_ORDER_ACCENT,
    TEXT_STYLES,
    FONT_DEFAULTS,
    getEffectiveFontKey,
} from './planner-themes.ts';
import { logger } from './planner-logger.ts';
import { commitHistory } from './planner-persist.ts';
import type { PlannerContext } from './planner-context.ts';
import type { BoldMode, DesignConfig } from './planner-types.ts';

/* ── Color helpers ── */

/** Validate hex color #RGB / #RRGGBB / #RRGGBBAA. Returns sanitized hex or '' on invalid. */
function safeColor(c: unknown): string {
    return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c) ? c : '';
}

/** Expand #RGB to #RRGGBB so subsequent slice(...) operations are correct. */
function expandHex(hex: string): string {
    if (!hex) return '';
    if (hex.length === 4) {
        return '#' + hex[1]! + hex[1]! + hex[2]! + hex[2]! + hex[3]! + hex[3]!;
    }
    return hex;
}

function adjustOpacity(hex: string | null, opacity: number): string {
    const safe = expandHex(safeColor(hex));
    if (!safe) return `rgba(0, 0, 0, ${opacity})`;
    const r = parseInt(safe.slice(1, 3), 16);
    const g = parseInt(safe.slice(3, 5), 16);
    const b = parseInt(safe.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function blendColor(bg: string, fg: string, amount: number): string {
    const safeBg = expandHex(safeColor(bg));
    const safeFg = expandHex(safeColor(fg));
    if (!safeBg || !safeFg) return safeBg || safeFg || '#000000';
    const br = parseInt(safeBg.slice(1, 3), 16);
    const bg2 = parseInt(safeBg.slice(3, 5), 16);
    const bb = parseInt(safeBg.slice(5, 7), 16);
    const fr = parseInt(safeFg.slice(1, 3), 16);
    const fg2 = parseInt(safeFg.slice(3, 5), 16);
    const fb = parseInt(safeFg.slice(5, 7), 16);
    const r = Math.round(br + (fr - br) * amount);
    const g = Math.round(bg2 + (fg2 - bg2) * amount);
    const b = Math.round(bb + (fb - bb) * amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Apply the full design config to CSS custom properties */
export function applyDesignConfig(config: DesignConfig) {
    const root = document.documentElement;
    const themeKey = typeof config.theme === 'string' ? config.theme : null;
    const theme = (themeKey && THEMES[themeKey]) || THEMES.classic;
    if (themeKey && !THEMES[themeKey] && typeof console !== 'undefined') {
        logger.warn(`Tema desconocido "${themeKey}", usando "classic" como fallback.`);
    }
    // Validar overrides para evitar inyección CSS desde localStorage manipulado
    const textColor = safeColor(config.textColor) || theme.text;
    const bgColor = safeColor(config.bgColor) || theme.bg;

    root.style.setProperty('--planner-color-paper', bgColor);
    root.style.setProperty('--planner-color-ink', textColor);

    // Derive secondary colors.
    // El ink-light es TEXTO (títulos de sección, leyendas, ~29 elementos). A 0.55 de
    // opacidad el ink por defecto (#3d3a34) sobre el papel daba 3.03:1 → fallaba WCAG AA. A 0.72
    // da 4.73:1 y sigue leyéndose como "tinta suave". Las líneas de abajo NO se tocan: son bordes,
    // no texto, y no tienen requisito de contraste.
    root.style.setProperty('--planner-color-ink-light', adjustOpacity(textColor, 0.72));
    root.style.setProperty('--planner-color-line', adjustOpacity(textColor, 0.2));
    root.style.setProperty('--planner-color-line-light', adjustOpacity(textColor, 0.12));
    root.style.setProperty('--planner-color-notes-bg', blendColor(bgColor, textColor, 0.06));

    // Apply text style: manual override or theme's default font
    const style = config.textStyle ? TEXT_STYLES[config.textStyle] : null;
    const font = style || theme.font;
    root.style.setProperty('--planner-font-heading', font.heading);
    root.style.setProperty('--planner-line-weight', String(font.lineWeight));

    // Title factor (proportional scaling: step × 0.03)
    const fontKey = getEffectiveFontKey(config);
    const titleSizeOffset = FONT_DEFAULTS[fontKey]?.titleSizeOffset || 0;
    const titleOffset = (config.titleSize || 0) + titleSizeOffset;
    root.style.setProperty('--planner-title-factor', String(1 + titleOffset * 0.03));

    // Title bold override (3-state: null = font default, 'bold' = 700, 'light' = 400)
    function resolveBoldWeight(boldValue: BoldMode | boolean, fontDefault: number): number {
        if (boldValue === 'bold') return 700;
        if (boldValue === 'light') return 400;
        return fontDefault;
    }
    root.style.setProperty('--planner-heading-weight', String(resolveBoldWeight(config.boldTitle, font.headingWeight)));
}

export function initDesignPanel(deps: PlannerContext) {
    const {
        render,
        showBackdrop,
        removeBackdrop,
        closeExportModal,
        t,
        getStyle,
        getDesignConfig,
        setDesignConfig,
        getDefaultDesignConfig,
        getConfigIsOpen,
        getCloseConfigFn,
        getExitTextEditFn,
        getTextPanelIsOpen,
        getCloseTextPanelFn,
        applyTextCallback,
        resetBodyFont,
        setDesignIsOpen,
        setCloseDesignFn,
    } = deps;

    const designBtn = document.getElementById('designBtn');
    const designPanel = document.getElementById('designPanel');
    const themesContainer = document.getElementById('designThemes');
    const textSwatches = document.getElementById('designTextSwatches');
    const bgSwatches = document.getElementById('designBgSwatches');
    const accentSection = document.getElementById('designAccentSection');
    const accentSwatches = document.getElementById('designAccentSwatches');
    // Actions
    const saveBtn = document.getElementById('designSave');
    const cancelBtn = document.getElementById('designCancel');
    const resetBtn = document.getElementById('designReset');

    if (!designBtn || !designPanel || !themesContainer) {
        return {
            closeDesign: () => {},
            buildThemes: () => {},
            getDraftDesign: () => null,
            beginTemas: () => {},
            commitTemas: () => {},
            rollbackTemas: () => {},
        };
    }

    let draftDesign: DesignConfig | null = null;
    let _savedDesign: DesignConfig | null = null;
    let draftTemas: DesignConfig | null = null;
    let _savedTemas: DesignConfig | null = null;
    let _designIsOpen = false;
    let _resetBodyFont = false;

    /** Apply design + sync text CSS vars (text panel not open during design) */
    function applyAndSync(config: DesignConfig) {
        applyDesignConfig(config);
        if (applyTextCallback) applyTextCallback(config, { resetBodyFont: _resetBodyFont });
    }

    function buildPanel() {
        buildTextSwatches();
        buildBgSwatches();
        buildAccentSwatches();
    }

    // Los temas viven en SU panel, con SU draft: `beginTemas` lo abre, Guardar lo
    // persiste y Cancelar lo tira. `suelto` es la red por si alguien pinta la rejilla sin draft.
    function buildThemes() {
        const draft = draftDesign || draftTemas;
        const suelto = !draft;
        const cfg: DesignConfig = draft || { ...getDesignConfig() };
        themesContainer!.innerHTML = '';
        DISPLAY_ORDER.forEach((key) => {
            const theme = THEMES[key]!;
            const card = document.createElement('button');
            card.className = 'planner-design__theme-card';
            card.type = 'button';
            card.title = t(theme.labelKey);
            card.setAttribute('aria-label', t(theme.labelKey));
            if (cfg.theme === key) card.classList.add('is-active');

            // Preview: bg + text color + 3 month dots
            card.style.background = theme.bg;
            const fontKey = getEffectiveFontKey({ theme: key });
            const estilo = TEXT_STYLES[fontKey];
            const tam = FONT_DEFAULTS[fontKey];
            card.innerHTML = `
                <span class="planner-design__theme-label" style="color: ${theme.text}">${t(theme.labelKey)}</span>
                <span class="planner-design__theme-dots">
                    ${theme.months
                        .slice(0, 4)
                        .map((c) => `<span class="planner-design__theme-dot" style="background:${c}"></span>`)
                        .join('')}
                </span>
                <span class="planner-design__theme-sizes" style="color: ${theme.text}">${t('lblTitle')} ${tam ? tam.titleSize : ''} · ${t('lblText')} ${tam ? tam.textSize : ''}</span>
                <span class="planner-design__theme-font" style="color: ${theme.text}">${estilo ? estilo.label : ''}</span>
            `;

            card.addEventListener('click', () => {
                const destino: DesignConfig = draft || { ...getDesignConfig() };
                destino.theme = key;
                destino.bgColor = null; // reset background override to theme default
                destino.textColor = null; // reset text override to theme default
                destino.textStyle = null; // reset font override to theme default
                destino.accentPalette = null; // reset accent to theme default
                destino.weeklyAccent = theme.months[0]!; // sync weekly accent to new theme
                destino.weeklyAccentKey = key; // sync key for disambiguation
                destino.plannerAccent = theme.months[0]!; // sync planner accent to new theme
                destino.plannerAccentKey = key; // sync key for disambiguation
                _resetBodyFont = true; // body font follows theme
                if (suelto) {
                    setDesignConfig(destino);
                    // applyAndSync solo PINTA la fuente del tema; sin esto el override de cuerpo
                    // sigue persistido y vuelve al recargar (con Diseño abierto lo hace saveDesign).
                    if (resetBodyFont) resetBodyFont();
                }
                applyAndSync(destino);
                if (draftDesign) buildPanel();
                buildThemes();
                render();
                if (suelto) commitHistory();
            });

            themesContainer!.appendChild(card);
        });
    }

    function buildBgSwatches() {
        if (!bgSwatches) return;
        bgSwatches.innerHTML = '';

        const theme = THEMES[draftDesign!.theme] || THEMES.classic;
        const activeBg = draftDesign!.bgColor || theme.bg;

        DISPLAY_ORDER.forEach((key) => {
            const c = THEMES[key]!;
            const btn = document.createElement('button');
            btn.className = 'planner-design__swatch';
            btn.type = 'button';
            btn.style.background = c.bg;
            btn.title = t(c.labelKey);
            btn.setAttribute('aria-label', t(c.labelKey));

            if (activeBg === c.bg) btn.classList.add('is-active');
            btn.addEventListener('click', () => {
                draftDesign!.bgColor = c.bg === theme.bg ? null : c.bg;
                applyAndSync(draftDesign!);
                markActive(bgSwatches, c.bg);
                render();
            });
            bgSwatches.appendChild(btn);
        });
    }

    function buildTextSwatches() {
        if (!textSwatches) return;
        textSwatches.innerHTML = '';

        const theme = THEMES[draftDesign!.theme] || THEMES.classic;
        const activeText = draftDesign!.textColor || theme.text;

        DISPLAY_ORDER.forEach((key) => {
            const c = THEMES[key]!;
            const btn = document.createElement('button');
            btn.className = 'planner-design__swatch planner-design__swatch--dark';
            btn.type = 'button';
            btn.style.background = c.text;
            btn.title = t(c.labelKey);
            btn.setAttribute('aria-label', t(c.labelKey));
            if (activeText === c.text) btn.classList.add('is-active');
            btn.addEventListener('click', () => {
                draftDesign!.textColor = c.text === theme.text ? null : c.text;
                applyAndSync(draftDesign!);
                markActive(textSwatches, c.text);
                render();
            });
            textSwatches.appendChild(btn);
        });
    }

    function buildAccentSwatches() {
        if (!accentSection || !accentSwatches) return;

        // Show accent swatches for quarterly, monthly, weekly, and planner
        const currentStyle = getStyle();
        const showAccent =
            currentStyle === 'quarterly' ||
            currentStyle === 'monthly' ||
            currentStyle === 'weekly' ||
            currentStyle === 'planner';
        accentSection.hidden = !showAccent;
        if (!showAccent) return;

        // El rótulo es fijo, «Color de acento»: el de antes se reescribía
        // por vista inyectando un nodo de texto y, con la cabecera de sección del chrome
        // compartido, acababa pintado ENCIMA del título del markup.

        accentSwatches.innerHTML = '';

        if (currentStyle === 'weekly' || currentStyle === 'planner') {
            // Weekly / Planner: accent is a single hex color
            const propKey = currentStyle === 'planner' ? 'plannerAccent' : 'weeklyAccent';
            const keyProp = currentStyle === 'planner' ? 'plannerAccentKey' : 'weeklyAccentKey';
            const currentAccent = draftDesign![propKey];
            const currentAccentKey = draftDesign![keyProp] || null;

            // Theme-based gradient swatches — representative color = months[0]
            let matched = false;
            DISPLAY_ORDER_ACCENT.forEach((key) => {
                const themeEntry = THEMES[key]!;
                const btn = document.createElement('button');
                btn.className = 'planner-design__swatch planner-design__swatch--dark';
                btn.type = 'button';
                btn.title = t(themeEntry.labelKey);
                btn.setAttribute('aria-label', t(themeEntry.labelKey));

                const g = themeEntry.months.slice(0, 4);
                btn.style.background = `linear-gradient(135deg, ${g[0]} 25%, ${g[1]} 25%, ${g[1]} 50%, ${g[2]} 50%, ${g[2]} 75%, ${g[3]} 75%)`;

                const accentHex = themeEntry.months[0]!;
                // Use stored key for disambiguation; fall back to first hex match
                if (!matched && currentAccent === accentHex) {
                    if (!currentAccentKey || currentAccentKey === key) {
                        btn.classList.add('is-active');
                        matched = true;
                    }
                }

                btn.addEventListener('click', () => {
                    draftDesign![propKey] = accentHex;
                    draftDesign![keyProp] = key;
                    applyAndSync(draftDesign!);
                    buildAccentSwatches();
                    render();
                });
                accentSwatches.appendChild(btn);
            });
        } else {
            // Quarterly/Monthly: accent palette is a theme key
            const activeAccent = draftDesign!.accentPalette || draftDesign!.theme;

            DISPLAY_ORDER_ACCENT.forEach((key) => {
                const themeEntry = THEMES[key]!;
                const btn = document.createElement('button');
                btn.className = 'planner-design__swatch planner-design__swatch--dark';
                btn.type = 'button';
                btn.title = t(themeEntry.labelKey);
                btn.setAttribute('aria-label', t(themeEntry.labelKey));

                const g = themeEntry.months.slice(0, 4);
                btn.style.background = `linear-gradient(135deg, ${g[0]} 25%, ${g[1]} 25%, ${g[1]} 50%, ${g[2]} 50%, ${g[2]} 75%, ${g[3]} 75%)`;

                if (activeAccent === key) btn.classList.add('is-active');

                btn.addEventListener('click', () => {
                    draftDesign!.accentPalette = key === draftDesign!.theme ? null : key;
                    applyAndSync(draftDesign!);
                    buildAccentSwatches();
                    render();
                });
                accentSwatches.appendChild(btn);
            });
        }

        // Force accent toggle removed — now lives in text panel as overrideAccent toggle
    }

    function markActive(container: HTMLElement | null, value: string | null) {
        container?.querySelectorAll<HTMLElement>('.planner-design__swatch').forEach((s) => {
            s.classList.toggle('is-active', s.style.background === value || rgbToHex(s.style.background) === value);
        });
    }

    function rgbToHex(rgb: string): string {
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return rgb;
        return '#' + [match[1]!, match[2]!, match[3]!].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('');
    }

    function openDesign() {
        if (getConfigIsOpen() && getCloseConfigFn()) getCloseConfigFn()!();
        if (getTextPanelIsOpen() && getCloseTextPanelFn()) getCloseTextPanelFn()!();
        closeExportModal();
        _designIsOpen = true;
        setDesignIsOpen(true);
        _savedDesign = JSON.parse(JSON.stringify(getDesignConfig()));
        draftDesign = JSON.parse(JSON.stringify(getDesignConfig()));
        _resetBodyFont = false;
        buildPanel();
        designPanel!.hidden = false;
        showBackdrop(() => closeDesign(), designPanel);
    }

    function closeDesign() {
        if (_savedDesign) {
            setDesignConfig(_savedDesign);
            applyAndSync(_savedDesign);
        }
        _designIsOpen = false;
        setDesignIsOpen(false);
        draftDesign = null;
        _savedDesign = null;
        designPanel!.hidden = true;
        removeBackdrop();
        render();
    }

    setCloseDesignFn(closeDesign);

    function saveDesign() {
        if (_resetBodyFont && resetBodyFont) resetBodyFont();
        if (draftDesign) {
            setDesignConfig(draftDesign);
            applyAndSync(draftDesign!);
        }
        _savedDesign = null;
        _designIsOpen = false;
        setDesignIsOpen(false);
        draftDesign = null;
        designPanel!.hidden = true;
        removeBackdrop();
        render();
        commitHistory();
    }

    function beginTemas() {
        _savedTemas = JSON.parse(JSON.stringify(getDesignConfig()));
        draftTemas = JSON.parse(JSON.stringify(getDesignConfig()));
        _resetBodyFont = false;
    }

    function commitTemas() {
        if (_resetBodyFont && resetBodyFont) resetBodyFont();
        if (draftTemas) {
            setDesignConfig(draftTemas);
            applyAndSync(draftTemas);
        }
        draftTemas = null;
        _savedTemas = null;
        render();
        commitHistory();
    }

    function rollbackTemas() {
        if (_savedTemas) {
            setDesignConfig(_savedTemas);
            applyAndSync(_savedTemas);
        }
        draftTemas = null;
        _savedTemas = null;
        render();
    }

    function resetDesign() {
        draftDesign = getDefaultDesignConfig();
        applyAndSync(draftDesign!);
        buildPanel();
        render();
    }

    designBtn.addEventListener('click', () => {
        const exitFn = getExitTextEditFn();
        if (exitFn) exitFn('dismiss');
        if (_designIsOpen) closeDesign();
        else openDesign();
    });

    if (saveBtn) saveBtn.addEventListener('click', saveDesign);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDesign);
    if (resetBtn) resetBtn.addEventListener('click', resetDesign);

    document.addEventListener('mousedown', (e) => {
        if (!_designIsOpen) return;
        const inPanel = designPanel!.contains(e.target as Node);
        const inToolbar = document.getElementById('plannerToolbar')?.contains(e.target as Node);
        if (!inPanel && !inToolbar) closeDesign();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _designIsOpen) closeDesign();
    });

    // Apply saved design on init
    applyAndSync(getDesignConfig());

    return {
        closeDesign,
        buildThemes,
        getDraftDesign: () => (_designIsOpen ? draftDesign : null),
        beginTemas,
        commitTemas,
        rollbackTemas,
    };
}
