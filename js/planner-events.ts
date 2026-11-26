import { isMobile } from '@core/breakpoint/get-bp.ts';
import { getWeeksInMonth } from './planner-core.ts';
import {
    getYear,
    getMonth,
    getStyle,
    getWeek,
    setWeek,
    goToPrevMonth,
    goToNextMonth,
    goToPrevQuarter,
    goToNextQuarter,
} from './planner-state.ts';
import { panelStore } from './planner-panel-store.ts';
import { render } from './planner-render.ts';
import { PlannerHistory } from './planner-history.ts';
import { isTranslating } from './planner-toolbar-i18n.ts';

// Por el hueco del store y no por nombres: una lista de paneles se queda corta en cuanto nace uno nuevo.
// La hamburguesa del header tapa el folio en móvil y tableta; en su modo Ajustes no cuenta: aplazaría su Idioma
export function chromeAbierto(): boolean {
    return (
        panelStore.anyOpen() ||
        !!document.getElementById('exportModal')?.classList.contains('is-open') ||
        !!document.querySelector('.edt-dlg-overlay') ||
        !!document.querySelector('.mobile-nav-panel.open:not(.is-ajustes)')
    );
}

// Los Ajustes abiertos (modal, popover, panel móvil) paran el teclado aunque el foco caiga en <body> o siga en el
// engranaje. Por lo abierto y no en chromeAbierto, que aplazaría el Idioma elegido en ellos
const AJUSTES_ABIERTOS = 'dialog[open], #ajustes-pop:not([hidden]), .mobile-nav-panel.open.is-ajustes';

// ── Atajos de teclado globales ──
// ←/→  : navegar mes (todos) / semana (weekly) / trimestre (quarterly)
export function initGlobalKeys() {
    document.addEventListener('keydown', (e) => {
        if (document.querySelector(AJUSTES_ABIERTOS)) return;
        // Ignorar si el foco está en un input editable
        const tgt = e.target as HTMLElement | null;
        if (
            tgt &&
            (tgt.isContentEditable || tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')
        ) {
            return;
        }
        if (e.isComposing) return;

        // Undo/redo: con panel o modal abiertos mandan sus propios flujos (Cancelar/draft).
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            const key = e.key.toLowerCase();
            if (key === 'z' || key === 'y') {
                if (chromeAbierto()) return;
                // En vuelo, applySnapshot re-leería el estado YA deshecho y absorb lo hornearía.
                if (isTranslating()) return;
                e.preventDefault();
                if (key === 'y' || e.shiftKey) PlannerHistory.redo();
                else PlannerHistory.undo();
                return;
            }
        }

        if (chromeAbierto()) return;

        if (e.key === 'ArrowLeft') {
            const style = getStyle();
            if (style === 'weekly') {
                const w = getWeek();
                if (w > 1) {
                    setWeek(w - 1);
                    render();
                } else {
                    goToPrevMonth();
                }
            } else if (style === 'quarterly') {
                goToPrevQuarter();
            } else {
                goToPrevMonth();
            }
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            const style = getStyle();
            if (style === 'weekly') {
                const w = getWeek();
                const maxW = getWeeksInMonth(getYear(), getMonth());
                if (w < maxW) {
                    setWeek(w + 1);
                    render();
                } else {
                    goToNextMonth();
                }
            } else if (style === 'quarterly') {
                goToNextQuarter();
            } else {
                goToNextMonth();
            }
            e.preventDefault();
        }
    });
}

// ── Guardas móviles: los paneles no sobreviven al pie visible ni a la nav del header ──
export function initMobilePanelGuards() {
    const footer = document.querySelector('site-footer') || document.querySelector('.footer');
    if (footer) {
        const footerObserver = new IntersectionObserver(
            (entries) => {
                if (!isMobile()) return;
                const isVisible = entries.some((e) => e.isIntersecting);
                if (isVisible) {
                    panelStore.closeIfOpen('config');
                    panelStore.closeIfOpen('design');
                    panelStore.closeIfOpen('temas');
                    panelStore.closeIfOpen('mas');
                    panelStore.closeIfOpen('saved');
                }
            },
            { threshold: 0.1 }
        );
        footerObserver.observe(footer);
    }

    document.addEventListener(
        'header:ready',
        () => {
            const mobileNavPanel = document.getElementById('mobile-nav-panel');
            if (!mobileNavPanel) return;
            const toolbar = document.getElementById('plannerToolbar');
            const navObserver = new MutationObserver(() => {
                const isNavOpen = mobileNavPanel.classList.contains('open');
                if (toolbar) toolbar.style.display = isNavOpen ? 'none' : '';
                // El sheet pinta por ENCIMA de la nav (z 1010 vs 999): ninguno sobrevive.
                if (isNavOpen) panelStore.closeAll();
            });
            navObserver.observe(mobileNavPanel, { attributes: true, attributeFilter: ['class'] });
        },
        { once: true }
    );
}
