export interface ShareOrDownloadOptions {
    /** Logger opcional para avisos NO fatales (fallback silencioso si se omite). */
    logger?: { warn: (...args: unknown[]) => void };
    /**
     * Callback opcional: en iOS un PDF servido como Blob URL abre en pestaña nueva en vez
     * de descargar (limitación del motor). El usuario puede creer que falló → la app puede
     * avisar con un toast. Solo se invoca en iOS + PDF + descarga por anchor.
     */
    onIOSPdfNewTab?: () => void;
}

export function dataUrlToBlob(dataUrl: string): Blob {
    const comma = dataUrl.indexOf(',');
    if (comma === -1) throw new Error('dataUrlToBlob: no es un data URL válido (sin coma)');
    const header = dataUrl.slice(0, comma);
    const base64 = dataUrl.slice(comma + 1);
    const mime = header.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
    const bin = atob(base64);
    const len = bin.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) buffer[i] = bin.charCodeAt(i);
    return new Blob([buffer], { type: mime });
}

/**
 * Descarga (o comparte) un blob en cualquier dispositivo.
 *  - iOS con Web Share API → share-sheet nativo (única forma fiable de "descargar" ahí).
 *  - Android / Desktop → anchor con Blob URL + `download`. En Android el share-sheet de
 *    PDFs causaba bucles "Save to Drive" en algunos OEMs → se evita y se descarga directo.
 *  - revoke a 60 s: margen para que Edge Android procese PDFs grandes antes de invalidar
 *    el Blob URL.
 * Devuelve false si el usuario cerró la hoja de compartir sin guardar; true en lo demás.
 */
export async function shareOrDownload(
    blob: Blob,
    filename: string,
    mime: string,
    opts: ShareOrDownloadOptions = {}
): Promise<boolean> {
    const { logger, onIOSPdfNewTab } = opts;
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
    const isAndroid = /Android/i.test(ua);
    const isPDF = mime === 'application/pdf';

    // Web Share SOLO en iOS (donde es la única forma fiable). Android/desktop → descarga directa.
    if (isIOS && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
        try {
            const file = new File([blob], filename, { type: mime });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: filename });
                return true;
            }
        } catch (err) {
            if (err && (err as { name?: string }).name === 'AbortError') return false; // el usuario cerró la hoja
            logger?.warn('shareOrDownload: navigator.share falló, usando fallback', err);
        }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.target = '_self';
    link.style.display = 'none';
    document.body.appendChild(link);

    let clicked = false;
    try {
        link.click();
        clicked = true;
    } catch (err) {
        logger?.warn('shareOrDownload: link.click falló', err);
    }

    // Fallback Android Edge: si el atributo download no se respetó (algunos WebViews),
    // abrir en pestaña nueva como último recurso.
    if (!clicked && (isAndroid || isPDF)) {
        try {
            window.open(url, '_blank', 'noopener');
        } catch (err) {
            logger?.warn('shareOrDownload: window.open falló', err);
        }
    }

    if (isIOS && isPDF && clicked) onIOSPdfNewTab?.();

    setTimeout(() => {
        try {
            link.remove();
            URL.revokeObjectURL(url);
        } catch {}
    }, 60_000);
    return true;
}
