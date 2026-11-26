import { getQuarter } from './planner-state.ts';
import { t } from './planner-i18n.ts';
import { renderPage1, renderPage2, renderPage3, renderPlannerHorizontal } from './planner-ui-planner.ts';
import { renderWeeklyPage } from './planner-ui-weekly.ts';
import { renderQuarterlyPage } from './planner-ui-quarterly.ts';
import { renderMonthlyCombinedPage } from './planner-ui-monthly.ts';
import type {
    MonthlyRenderConfig,
    PlannerRenderConfig,
    PlannerStyle,
    QuarterRenderConfig,
    WeekRenderConfig,
} from './planner-types.ts';

// ── API PÚBLICA — Vistas ──

/**
 * Renderiza las 3 páginas completas del planificador mensual
 */
export function renderMonthlyPages(year: number, month: number, config: PlannerRenderConfig = {}) {
    const page1 = document.getElementById('page1');
    const page2 = document.getElementById('page2');
    const page3 = document.getElementById('page3');

    if (page1) renderPage1(page1, year, month, config);
    if (page2) renderPage2(page2, year, month, config);
    if (page3) renderPage3(page3, year, month, config);

    updateModalTexts();
}

/**
 * Renderiza solo la página organizador (planner) en un contenedor dado.
 * Usado cuando style === 'planner' — muestra 1 página visible.
 */
export function renderPlannerView(year: number, month: number, config: PlannerRenderConfig = {}) {
    const page1 = document.getElementById('page1');
    if (page1) renderPage1(page1, year, month, config);
    updateModalTexts();
}

/**
 * Renderiza el organizador horizontal (A4 landscape).
 */
export function renderPlannerHorizontalView(year: number, month: number, config: PlannerRenderConfig = {}) {
    const page1 = document.getElementById('page1');
    if (page1) renderPlannerHorizontal(page1, year, month, config);
    updateModalTexts();
}

/**
 * Renderiza la página semanal
 */
export function renderWeeklyView(year: number, month: number, weekNumber: number, config: WeekRenderConfig) {
    const page1 = document.getElementById('page1');
    if (page1) {
        // Set dynamic row count CSS variable
        page1.style.setProperty('--weekly-row-count', String(config.hours.length));
        renderWeeklyPage(page1, year, month, weekNumber, config);
    }
    updateModalTexts();
}

/**
 * Renderiza la página trimestral
 */
export function renderQuarterlyView(year: number, quarter: number, config: QuarterRenderConfig) {
    const page1 = document.getElementById('page1');
    if (page1) renderQuarterlyPage(page1, year, quarter, config);
    updateModalTexts();
}

/**
 * Renderiza la vista mensual combinada (A4 landscape)
 */
export function renderMonthlyCombinedView(year: number, month: number, config: MonthlyRenderConfig) {
    const page1 = document.getElementById('page1');
    if (page1) renderMonthlyCombinedPage(page1, year, month, config);
    updateModalTexts();
}

/**
 * Ensures the correct number of page elements exist inside #plannerPages.
 * Planner needs 3, weekly/quarterly need 1.
 * Also sets the style class on the container (.planner-pages--planner, --weekly, --monthly, --quarterly).
 */
export function ensurePageSlots(count: number, style: PlannerStyle | 'planner-h' = 'planner') {
    const container = document.getElementById('plannerPages');
    if (!container) return;
    const existing = container.querySelectorAll('.planner-page');

    // Update style class
    container.classList.remove(
        'planner-pages--planner',
        'planner-pages--planner-h',
        'planner-pages--monthly',
        'planner-pages--weekly',
        'planner-pages--quarterly'
    );
    container.classList.add(`planner-pages--${style}`);

    if (existing.length === count) return;

    // Remove all existing
    existing.forEach((el) => el.remove());

    // Create the needed number
    for (let i = 0; i < count; i++) {
        const section = document.createElement('section');
        section.className = 'planner-page';
        section.id = `page${i + 1}`;
        container.appendChild(section);
    }
}

/**
 * Actualiza el texto del sidebar con el mes actual
 */
export function updateSidebarMonth(year: number) {
    const qEl = document.getElementById('configQuarterLabel');
    if (qEl) {
        const q = getQuarter();
        qEl.textContent = t('quarterOf').replace('{0}', String(q)).replace('{1}', String(year));
    }

    const downloadBtn = document.getElementById('exportBtn');
    if (downloadBtn) {
        const span = downloadBtn.querySelector('span');
        if (span) span.textContent = t('download');
    }
}

/**
 * Actualiza textos del sidebar según idioma
 */
export function updateSidebarTexts() {
    const labels = {
        sidebarLang: document.getElementById('langSectionLabel'),
        sidebarStyle: document.getElementById('styleSectionLabel'),
        sidebarMonth: document.getElementById('navSectionLabel'),
    };
    for (const [key, el] of Object.entries(labels)) {
        if (el) el.textContent = t(key);
    }
}

/**
 * Actualiza textos del modal de exportación según idioma.
 *
 * Se ejecuta tras cada render. Si el modal de export está ABIERTO, sus labels
 * ya reflejan el estilo activo (los pone `initExportModal.update()`), así que
 * NO debemos pisarlas aquí — bail out para no sobrescribirlas en caliente.
 */
function updateModalTexts() {
    const exportModal = document.getElementById('exportModal');
    if (exportModal && exportModal.classList.contains('is-open')) return;

    const title = document.getElementById('exportModalTitle');
    const desc = document.getElementById('exportModalDesc');
    const pdfBtn = document.getElementById('exportPDF');

    if (title) title.textContent = t('downloadTitle');
    if (desc) desc.textContent = t('downloadDesc');
    if (pdfBtn) {
        const span = pdfBtn.querySelector('span');
        const small = pdfBtn.querySelector('small');
        if (span) span.textContent = t('exportPDF');
        if (small) small.textContent = t('exportPDFDesc');
    }

    // Page buttons
    const pageLabels = ['pageOrganizer', 'pageCalLeft', 'pageCalRight'];
    const pageBtns = document.querySelectorAll('.planner-export-modal__page-btn');
    pageBtns.forEach((btn, i) => {
        const span = btn.querySelector('span');
        if (span && pageLabels[i]) span.textContent = t(pageLabels[i]);
    });
}

// ── RE-EXPORTS — utilidades / componentes externos ──

export { rgbToHex, sanitizeCellHTML } from './planner-ui-shared.ts';
