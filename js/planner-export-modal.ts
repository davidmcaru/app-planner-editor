import { createFocusTrap, type FocusTrap } from '@core/focus-trap/focus-trap.ts';
import { getMonthName } from './planner-core.ts';
import { t } from './planner-i18n.ts';
import {
    exportWeeklyToPDF,
    exportWeeklyToJpeg,
    exportQuarterlyToJpeg,
    exportQuarterlyToPDF,
    exportMonthlyBookletPDF,
    exportPlannerToJpeg,
    exportPlannerToPDF,
    exportPlannerHorizontalToJpeg,
    exportPlannerHorizontalToPDF,
    exportMonthlyCalToJpeg,
    exportMonthlyCalToPDF,
} from './planner-export.ts';
import {
    getMonth,
    getYear,
    getStyle,
    getWeek,
    getQuarter,
    getPlannerConfig,
    getHolidaysConfig,
    getVacationDays,
} from './planner-state.ts';
import { ensurePageSlots, renderMonthlyPages } from './planner-ui.ts';
import type { PlannerConfig, RenderExtras } from './planner-types.ts';

export function initExportModal(deps: {
    getExitTextEditFn?: () => ((reason: string) => void) | null;
    repaint: () => void;
}) {
    const exportBtn = document.getElementById('exportBtn');
    const exportModal = document.getElementById('exportModal');
    const closeModal = document.getElementById('closeExportModal');

    const noop = { open: () => {}, close: () => {}, update: () => {} };
    if (!exportModal) return noop;
    let trap: FocusTrap | null = null;

    function close() {
        exportModal!.classList.remove('is-open');
        trap?.deactivate();
        trap = null;
    }

    function open() {
        const exit = deps.getExitTextEditFn?.();
        if (exit) exit('dismiss');
        update();
        exportModal!.classList.add('is-open');
        // Sin esto se tabula fuera del modal, hacia el lienzo y la toolbar de detrás. El
        // compartido no gestiona Escape: eso lo sigue haciendo el listener de este módulo.
        trap = createFocusTrap(exportModal!);
        trap.activate();
    }

    function update() {
        const exportPages = document.getElementById('exportPages');
        const exportPDFBtn = document.getElementById('exportPDF');
        const modalTitle = document.getElementById('exportModalTitle');
        const modalDesc = document.getElementById('exportModalDesc');
        if (!exportPages || !exportPDFBtn) return;

        const style = getStyle();
        const name = getMonthName(getMonth()).toLowerCase();

        if (style === 'weekly') {
            if (modalTitle) modalTitle.textContent = t('downloadWeekly');
            if (modalDesc) modalDesc.textContent = t('downloadWeeklyDesc');

            exportPages.innerHTML = '';
            const jpgBtn = document.createElement('button');
            jpgBtn.className = 'planner-export-modal__page-btn';
            jpgBtn.innerHTML = `<i class="fas fa-image"></i><span>${t('exportWeeklyLabel')}</span><small>JPG</small>`;
            jpgBtn.addEventListener('click', () => {
                close();
                exportWeeklyToJpeg(name, getYear(), getWeek());
            });
            exportPages.appendChild(jpgBtn);

            exportPDFBtn.querySelector('span')!.textContent = t('exportWeeklyLabel');
            exportPDFBtn.querySelector('small')!.textContent = '1 A4';
            exportPDFBtn.onclick = () => {
                close();
                exportWeeklyToPDF(name, getYear(), getWeek());
            };

            // Hide booklet button (monthly-only)
            const bookletHide = document.getElementById('exportBookletPDF');
            if (bookletHide) bookletHide.style.display = 'none';
        } else if (style === 'quarterly') {
            if (modalTitle) modalTitle.textContent = t('downloadQuarterly');
            if (modalDesc) modalDesc.textContent = t('downloadQuarterlyDesc');

            const q = getQuarter();
            exportPages.innerHTML = '';
            const jpgBtn = document.createElement('button');
            jpgBtn.className = 'planner-export-modal__page-btn';
            jpgBtn.innerHTML = `<i class="fas fa-image"></i><span>${t('exportQuarterlyLabel')}</span><small>JPG</small>`;
            jpgBtn.addEventListener('click', () => {
                close();
                exportQuarterlyToJpeg(getYear(), q);
            });
            exportPages.appendChild(jpgBtn);

            exportPDFBtn.querySelector('span')!.textContent = t('exportQuarterlyLabel');
            exportPDFBtn.querySelector('small')!.textContent = '1 A4';
            exportPDFBtn.onclick = () => {
                close();
                exportQuarterlyToPDF(getYear(), q);
            };

            // Hide booklet button (planner-only)
            const bookletHideQ = document.getElementById('exportBookletPDF');
            if (bookletHideQ) bookletHideQ.style.display = 'none';
        } else if (style === 'monthly') {
            if (modalTitle) modalTitle.textContent = t('downloadMonthly');
            if (modalDesc) modalDesc.textContent = t('downloadMonthlyDesc');

            // Monthly combined calendar — 1 JPG + 1 PDF A4 landscape
            exportPages.innerHTML = '';
            const jpgBtn = document.createElement('button');
            jpgBtn.className = 'planner-export-modal__page-btn';
            jpgBtn.innerHTML = `<i class="fas fa-image"></i><span>${t('exportMonthlyLabel')}</span><small>JPG</small>`;
            jpgBtn.addEventListener('click', () => {
                close();
                exportMonthlyCalToJpeg(name, getYear());
            });
            exportPages.appendChild(jpgBtn);

            exportPDFBtn.querySelector('span')!.textContent = t('exportMonthlyLabel');
            exportPDFBtn.querySelector('small')!.textContent = '1 A4h';
            exportPDFBtn.onclick = () => {
                close();
                exportMonthlyCalToPDF(name, getYear());
            };

            const bookletHideM = document.getElementById('exportBookletPDF');
            if (bookletHideM) bookletHideM.style.display = 'none';
        } else {
            if (modalTitle) modalTitle.textContent = t('downloadTitle');
            if (modalDesc) modalDesc.textContent = t('downloadDesc');
            const plannerCfg = getPlannerConfig();
            const isHoriz = plannerCfg.orientation === 'horizontal';

            exportPages.innerHTML = '';
            const jpgBtn = document.createElement('button');
            jpgBtn.className = 'planner-export-modal__page-btn';
            jpgBtn.innerHTML = `<i class="fas fa-image"></i><span>${t('exportPlannerJPG')}</span><small>JPG</small>`;
            jpgBtn.addEventListener('click', () => {
                close();
                if (isHoriz) {
                    exportPlannerHorizontalToJpeg(name, getYear());
                } else {
                    exportPlannerToJpeg(name, getYear());
                }
            });
            exportPages.appendChild(jpgBtn);

            // PDF solo planner
            exportPDFBtn.querySelector('span')!.textContent = t('exportPlannerOnly');
            exportPDFBtn.querySelector('small')!.textContent = isHoriz ? t('exportPlannerA4h') : t('exportPlannerA5');
            exportPDFBtn.onclick = () => {
                close();
                if (isHoriz) {
                    exportPlannerHorizontalToPDF(name, getYear());
                } else {
                    exportPlannerToPDF(name, getYear());
                }
            };

            // Booklet PDF button (only for vertical)
            let bookletBtn = document.getElementById('exportBookletPDF');
            if (isHoriz) {
                if (bookletBtn) bookletBtn.style.display = 'none';
            } else {
                if (!bookletBtn) {
                    bookletBtn = document.createElement('button');
                    bookletBtn.id = 'exportBookletPDF';
                    bookletBtn.className = 'planner-export-modal__pdf-btn';
                    exportPDFBtn.parentElement!.insertBefore(bookletBtn, exportPDFBtn.nextSibling);
                }
                bookletBtn.innerHTML = `<i class="fas fa-book-open"></i><span>${t('exportPlannerBook') || t('exportBookletPDF')}</span><small>${t('exportPlannerBookDesc') || t('exportBookletPDFDesc')}</small>`;
                bookletBtn.style.display = '';
                bookletBtn.onclick = () => {
                    close();
                    const year = getYear();
                    const month = getMonth();
                    // Enrich config with holidays/vacation for book calendar pages
                    const holidays = getHolidaysConfig();
                    const config: PlannerConfig & RenderExtras & { showHolidays?: boolean; weekendShading?: boolean } =
                        getPlannerConfig();
                    config.showHolidays = true;
                    config.ccaa = holidays.ccaa;
                    config.province = holidays.province;
                    config._vacationDays = getVacationDays(year);
                    config.weekendShading = true;
                    exportMonthlyBookletPDF(
                        name,
                        year,
                        () => {
                            // Before capture: expand to 3 pages and render all with holidays
                            ensurePageSlots(3, 'planner');
                            renderMonthlyPages(year, month, config);
                        },
                        // Pinta el estado ACTUAL: tras el watchdog el usuario puede haber cambiado de mes o de vista.
                        deps.repaint
                    );
                };
            }
        }
    }

    // ── Wire DOM listeners ──
    if (exportBtn) {
        exportBtn.addEventListener('click', open);
    }
    if (closeModal) {
        closeModal.addEventListener('click', close);
    }
    exportModal.addEventListener('click', (e) => {
        if (e.target === exportModal) close();
    });
    document.addEventListener('keydown', (e) => {
        // defaultPrevented: un edt-dlg ya cerró con este Escape en captura (como en planner-saved-ui.ts).
        if (e.key === 'Escape' && !e.defaultPrevented && exportModal.classList.contains('is-open')) close();
    });

    return { open, close, update };
}
