import { toJpeg } from 'html-to-image';
import { getBp } from '@core/breakpoint/get-bp.ts';
import { showToast as showExportToast } from './planner-toasts.ts';
import { dataUrlToBlob, shareOrDownload } from '@features/export/download-file.ts';
import { preEmbedImages, restorePreEmbedded } from '@features/export/pre-embed-images.ts';
import { createExportGuard, excludeNonVisualNodes, TRANSPARENT_PIXEL } from '@features/export/export-guard.ts';
import { t } from './planner-i18n.ts';
import { logger } from './planner-logger.ts';
import { familyFromCss } from '@features/fonts/font-registry.ts';
import { buildFontEmbedCSS, ensureFontsLoaded } from '@features/fonts/font-embed.ts';

/**
 * Devuelve las familias activas del planner leyendo las CSS vars que setea
 * planner-text-panel.ts / planner-design-panel.ts.
 */
function getActiveFamilies() {
    const root = getComputedStyle(document.documentElement);
    const families = new Set<string>();
    ['--planner-font-heading', '--planner-font-body', '--planner-font-text', '--planner-font-numbers'].forEach(
        (varName) => {
            const fam = familyFromCss(root.getPropertyValue(varName).trim());
            if (fam) families.add(fam);
        }
    );
    if (families.size === 0) families.add('Noto Serif'); // fallback razonable
    return [...families];
}

const _imgDataUrlCache = new Map<string, string>();

async function preEmbedImagesLocal(element: HTMLElement) {
    const { originals } = await preEmbedImages(element, {
        cache: _imgDataUrlCache,
        onWarn: (src, err) => logger.warn(`No se pudo precargar imagen ${src}:`, err),
    });
    return originals;
}

// ERROR REPORTING — surface el mensaje real para diagnosticar fallos en mobile

/**
 * Muestra un mensaje de error al usuario incluyendo los detalles técnicos
 * del error original. En vez de tragarlo con un alert genérico, sacamos
 * `name`, `message` y la primera línea del stack para poder diagnosticar
 * fallos en dispositivos del usuario sin DevTools.
 */
function showExportError(prefixKey: string, err: unknown) {
    const prefix = t(prefixKey) || prefixKey;
    logger.error(prefix, err);
    showExportToast(prefix, 'error');
}

// ── EXPORT GUARD — clase `is-exporting` con watchdog ──

const _exportGuard = createExportGuard({
    onTimeout: () => {
        logger.warn('Export watchdog: UI desbloqueada; la captura sigue en curso.');
        showExportToast(t('exportErrorTimeout') || 'Export timed out', 'warning', 8000);
    },
});

// Solo el export más reciente suelta el guard: uno que el watchdog liberó y acaba tarde apagaría el del siguiente.
let _exportRun = 0;
const _liveRuns = new Set<number>();
let _pendingRepaint: { run: number; repaint: () => void } | null = null;

function startExport(): number {
    _exportGuard.start();
    _liveRuns.add(++_exportRun);
    return _exportRun;
}

// Repintar el folio a mitad de otra captura la estropearía: con una más reciente viva, repinta la última al acabar.
function endExport(run: number, repaint: (() => void) | null = null) {
    _liveRuns.delete(run);
    if (repaint) _pendingRepaint = { run: Math.max(run, _pendingRepaint?.run ?? 0), repaint };
    try {
        const pending = _pendingRepaint;
        if (pending && ![..._liveRuns].some((r) => r > pending.run)) {
            _pendingRepaint = null;
            pending.repaint();
        }
    } finally {
        if (run === _exportRun) _exportGuard.end();
    }
}

// ── TOAST — el mismo wrapper del compartido que usa el controller ──

// El share/download canónico es el compartido: mismas ramas iOS/Android y el mismo revoke a 60 s,
// que se extrajeron DE AQUÍ. El aviso de PDF en iOS entra por callback en vez de ir embebido.
const SHARE_OPTS = {
    logger,
    onIOSPdfNewTab: () => showExportToast(t('exportToastIOSNewTab') || 'PDF opened in a new tab'),
};

// NFD primero: parte «ä» en «a» + diéresis, y el filtro ASCII tira la diéresis, no la letra
function asciiName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/ß/g, 'ss')
        .replace(/[^\x20-\x7e]/g, '');
}

/**
 * Captura una página del planner como data URL (JPG)
 */
async function capturePageAsJpeg(element: HTMLElement) {
    if (!element) {
        throw new Error('capturePageAsJpeg: element is null');
    }
    const exactWidth = element.offsetWidth;
    const exactHeight = element.offsetHeight;
    if (!exactWidth || !exactHeight) {
        throw new Error(`capturePageAsJpeg: element has zero size (${exactWidth}x${exactHeight})`);
    }

    // Read current paper color from CSS variable
    const paperColor =
        getComputedStyle(document.documentElement).getPropertyValue('--planner-color-paper').trim() || '#faf9f6';

    // En mobile bajamos pixelRatio para evitar OOM en iPhone/Android
    // (pixelRatio: 3 con páginas A4/A5 grandes consume mucha RAM y satura el GPU).
    const bp = getBp();
    const isMobile = bp === 'm';
    const pixelRatio = isMobile ? 2 : 3;

    // Asegurar que la(s) fuente(s) activas estén cargadas y embebidas en el CSS
    // que html-to-image inyecta en el clon. Sin esto, en mobile (Android Edge,
    // algunos Chrome) html-to-image intenta hacer fetch del .ttf vía CSSOM y la
    // promesa se rechaza por CORS/red, abortando toda la captura.
    const families = getActiveFamilies();
    await ensureFontsLoaded(families, { element, logger });
    const fontEmbedCSS = await buildFontEmbedCSS(families, logger);

    // Pre-embeber TODAS las <img> a dataURI antes de capturar. En mobile
    // (Android Edge sobre todo), html-to-image hace fetch del src de cada
    // <img> y si uno falla, rechaza con Event y aborta toda la captura.
    const restoredImages = await preEmbedImagesLocal(element);

    const options = {
        quality: 1.0,
        backgroundColor: paperColor,
        pixelRatio,
        width: exactWidth,
        height: exactHeight,
        cacheBust: true,
        skipFonts: false,
        preferredFontFormat: 'truetype',
        imagePlaceholder: TRANSPARENT_PIXEL,
        filter: excludeNonVisualNodes(element),
    };
    if (fontEmbedCSS) (options as { fontEmbedCSS?: string }).fontEmbedCSS = fontEmbedCSS;

    logger.debug(
        `capturePageAsJpeg ${exactWidth}x${exactHeight} bp=${bp} pixelRatio=${pixelRatio} fontEmbed=${fontEmbedCSS ? 'yes' : 'no'}`
    );

    try {
        return await toJpeg(element, options);
    } finally {
        restorePreEmbedded(restoredImages);
    }
}

export async function exportWeeklyToJpeg(monthName: string, year: number, weekNumber: number) {
    const run = startExport();
    // El nombre AL ENTRAR, con is-exporting ya puesto: tras el watchdog un cambio de idioma aplazado lo mezclaría.
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileWeek')}${weekNumber}.jpg`);

    try {
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        const blob = dataUrlToBlob(dataUrl);
        await shareOrDownload(blob, file, 'image/jpeg', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorImage', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta la página semanal como PDF A4 horizontal
 */
export async function exportWeeklyToPDF(monthName: string, year: number, weekNumber: number) {
    const run = startExport();
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileWeek')}${weekNumber}.pdf`);

    try {
        if (!window.jspdf) {
            showExportError('exportErrorPDFLib', null);
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'l', // landscape
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        const pdfWidth = pdf.internal.pageSize.getWidth(); // 297
        const pdfHeight = pdf.internal.pageSize.getHeight(); // 210
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        await shareOrDownload(pdf.output('blob') as Blob, file, 'application/pdf', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorPDF', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta la página trimestral como JPG
 */
export async function exportQuarterlyToJpeg(year: number, quarter: number) {
    const run = startExport();
    const file = asciiName(`planner-${t('exportFileQuarter')}${quarter}-${year}.jpg`);

    try {
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        const blob = dataUrlToBlob(dataUrl);
        await shareOrDownload(blob, file, 'image/jpeg', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorImage', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta la página trimestral como PDF A4 horizontal
 */
export async function exportQuarterlyToPDF(year: number, quarter: number) {
    const run = startExport();
    const file = asciiName(`planner-${t('exportFileQuarter')}${quarter}-${year}.pdf`);

    try {
        if (!window.jspdf) {
            showExportError('exportErrorPDFLib', null);
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'l',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        await shareOrDownload(pdf.output('blob') as Blob, file, 'application/pdf', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorPDF', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta la página del calendario mensual combinado como JPG (A4 landscape)
 */
export async function exportMonthlyCalToJpeg(monthName: string, year: number) {
    const run = startExport();
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileCalendar')}.jpg`);

    try {
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        const blob = dataUrlToBlob(dataUrl);
        await shareOrDownload(blob, file, 'image/jpeg', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorImage', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta la página del calendario mensual combinado como PDF A4 landscape
 */
export async function exportMonthlyCalToPDF(monthName: string, year: number) {
    const run = startExport();
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileCalendar')}.pdf`);

    try {
        if (!window.jspdf) {
            showExportError('exportErrorPDFLib', null);
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'l',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        await shareOrDownload(pdf.output('blob') as Blob, file, 'application/pdf', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorPDF', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta las 3 páginas mensuales como un PDF cuadernillo de 4 páginas A4 horizontal.
 * Orden: pág1 en blanco, pág2 organizador, pág3 calendario izq, pág4 calendario der.
 * Pensado para impresión a doble cara → se pliega como libro.
 */
export async function exportMonthlyBookletPDF(
    monthName: string,
    year: number,
    beforeCapture: (() => void | Promise<void>) | null,
    repaint: (() => void) | null
) {
    const run = startExport();
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileBooklet')}.pdf`);

    try {
        if (!window.jspdf) {
            showExportError('exportErrorPDFLib', null);
            return;
        }

        if (beforeCapture) await beforeCapture();

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'p', // portrait A5 — same as full PDF
            unit: 'mm',
            format: 'a5',
            compress: true,
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const pages = document.querySelectorAll<HTMLElement>('.planner-page');

        // Read current paper color for the blank first page
        const paperColor =
            getComputedStyle(document.documentElement).getPropertyValue('--planner-color-paper').trim() || '#faf9f6';
        pdf.setFillColor(paperColor);
        pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');

        // Page 2: Organizador (= current page 1)
        pdf.addPage('a5', 'p');
        const orgImg = await capturePageAsJpeg(pages[0] as HTMLElement);
        pdf.addImage(orgImg, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        // Page 3: Calendario Izq (= current page 2)
        pdf.addPage('a5', 'p');
        const calLeftImg = await capturePageAsJpeg(pages[1] as HTMLElement);
        pdf.addImage(calLeftImg, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        // Page 4: Calendario Der (= current page 3)
        pdf.addPage('a5', 'p');
        const calRightImg = await capturePageAsJpeg(pages[2] as HTMLElement);
        pdf.addImage(calRightImg, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        await shareOrDownload(pdf.output('blob') as Blob, file, 'application/pdf', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorPDF', err);
    } finally {
        endExport(run, repaint);
    }
}

/**
 * Exporta la página organizador (planner) como JPG
 */
export async function exportPlannerToJpeg(monthName: string, year: number) {
    const run = startExport();
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileOrganizer')}.jpg`);

    try {
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        const blob = dataUrlToBlob(dataUrl);
        await shareOrDownload(blob, file, 'image/jpeg', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorImage', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta la página organizador como PDF A5 portrait (1 sola página)
 */
export async function exportPlannerToPDF(monthName: string, year: number) {
    const run = startExport();
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileOrganizer')}.pdf`);

    try {
        if (!window.jspdf) {
            showExportError('exportErrorPDFLib', null);
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a5',
            compress: true,
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        await shareOrDownload(pdf.output('blob') as Blob, file, 'application/pdf', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorPDF', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta el planner horizontal como JPG (A4 landscape)
 */
export async function exportPlannerHorizontalToJpeg(monthName: string, year: number) {
    const run = startExport();
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileOrganizer')}-A4h.jpg`);

    try {
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        const blob = dataUrlToBlob(dataUrl);
        await shareOrDownload(blob, file, 'image/jpeg', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorImage', err);
    } finally {
        endExport(run);
    }
}

/**
 * Exporta el planner horizontal como PDF A4 landscape (1 sola página)
 */
export async function exportPlannerHorizontalToPDF(monthName: string, year: number) {
    const run = startExport();
    const file = asciiName(`planner-${monthName}-${year}-${t('exportFileOrganizer')}-A4h.pdf`);

    try {
        if (!window.jspdf) {
            showExportError('exportErrorPDFLib', null);
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'l',
            unit: 'mm',
            format: 'a4',
            compress: true,
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const page = document.querySelector<HTMLElement>('.planner-page');
        if (!page) return;

        const dataUrl = await capturePageAsJpeg(page);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

        await shareOrDownload(pdf.output('blob') as Blob, file, 'application/pdf', SHARE_OPTS);
    } catch (err) {
        showExportError('exportErrorPDF', err);
    } finally {
        endExport(run);
    }
}
