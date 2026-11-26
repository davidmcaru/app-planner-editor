export interface PreEmbeddedImage {
    el: HTMLImageElement;
    src: string;
}

export interface PreEmbedResult {
    /** Las `<img>` tocadas y su `src` de origen: hay que devolvérselo SIEMPRE al terminar. */
    originals: PreEmbeddedImage[];
    corsOk: boolean;
}

export interface PreEmbedOptions {
    /** Saltar las del propio origen. */
    skipSameOrigin?: boolean;
    /** Caché por URL absoluta entre exports. El planner la usa: su marca de agua no cambia. */
    cache?: Map<string, string>;
    onWarn?: (src: string, err: unknown) => void;
}

// Bytes tal cual, sin decodificar: un canvas re-encodearía y añadiría una generación con pérdida.
async function fetchAsDataUri(src: string): Promise<string> {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error('FileReader'));
        reader.readAsDataURL(blob);
    });
}

// Sustituye cada `<img>.src` por un dataURI: html-to-image ya no hace su propio fetch (README).
export async function preEmbedImages(element: HTMLElement, opts: PreEmbedOptions = {}): Promise<PreEmbedResult> {
    const { skipSameOrigin = false, cache, onWarn } = opts;
    const originals: PreEmbeddedImage[] = [];
    let corsOk = true;

    for (const img of Array.from(element.querySelectorAll('img'))) {
        const original = img.getAttribute('src');
        if (!original || original.startsWith('data:') || original.startsWith('blob:')) continue;
        const absolute = new URL(original, window.location.href).href;
        if (skipSameOrigin && absolute.startsWith(window.location.origin)) continue;

        try {
            let dataUri = cache?.get(absolute);
            if (!dataUri) {
                dataUri = await fetchAsDataUri(absolute);
                cache?.set(absolute, dataUri);
            }
            originals.push({ el: img, src: original });
            img.setAttribute('src', dataUri);
        } catch (err) {
            // Cross-origin sin cabeceras CORS: el fetch NO llega. Es la misma señal que daba el
            // canvas teñido, y quien llama decide si abortar o seguir (planner).
            corsOk = false;
            onWarn?.(absolute, err);
        }
    }

    return { originals, corsOk };
}

export function restorePreEmbedded(originals: PreEmbeddedImage[]): void {
    if (!originals) return;
    for (const { el, src } of originals) el.setAttribute('src', src);
}
