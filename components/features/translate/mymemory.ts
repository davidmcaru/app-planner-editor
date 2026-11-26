import { APP_CONFIG } from '@core/app-config/app.config.ts';

export interface TranslateOptions {
    timeoutMs?: number;
}

// Decodifica entidades HTML (&#39;, &amp;…) que MyMemory devuelve a veces. La escritura de los
// consumidores va por textContent, así que sin decodificar se verían literales.
function decodeEntities(s: string): string {
    if (!s.includes('&')) return s;
    try {
        const doc = new DOMParser().parseFromString(s, 'text/html');
        return doc.documentElement.textContent || s;
    } catch {
        return s;
    }
}

// La TM de MyMemory es colaborativa y a veces devuelve placeholders XLIFF (<x id="1"/>, <g>…</g>)
// dentro del texto: sin limpiarlos quedarían VISIBLES.
export function stripMtArtifacts(s: string): string {
    return decodeEntities(s.replace(/<\/?(?:x|g|bx|ex|bpt|ept|ph|it)\b[^>]*>/gi, '')).trim();
}

// Devuelve `null` si NO tradujo, nunca el original: quien cachee no puede distinguirlos (README).
export async function translateViaMyMemory(
    text: string,
    fromLang: string,
    toLang: string,
    { timeoutMs = 8000 }: TranslateOptions = {}
): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const langPair = `${fromLang}|${toLang}`;
        const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`,
            { signal: controller.signal }
        );
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
            const clean = stripMtArtifacts(String(data.responseData.translatedText));
            // Vacío tras limpiar = respuesta válida (eran todo placeholders): original, no `null`.
            return clean || text;
        }
        return null;
    } catch {
        // AbortError o red caída
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export type ConsentChoice = 'granted' | 'denied';

export interface TranslationConsent {
    ensure: () => Promise<boolean>;
}

// El confirm, de elección OBLIGATORIA (dismissible:false): un dismiss no es una respuesta que se pueda guardar
// El enlace a «más sobre tus datos» bajo el permiso: es aquí donde se pide sacar texto de la app.
// En otra pestaña: el diálogo es de elección obligatoria y no se deja
// a medias por irse de la página. Va como `content` de confirmDialog
export function enlacePolitica(texto: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'edt-dlg__nota';
    const a = document.createElement('a');
    a.href = APP_CONFIG.privacyUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = texto;
    p.appendChild(a);
    return p;
}

export function createTranslationConsent(opts: {
    confirm: () => Promise<boolean>;
    read: () => string | null;
    write: (choice: ConsentChoice) => void;
}): TranslationConsent {
    return {
        async ensure(): Promise<boolean> {
            const stored = opts.read();
            if (stored === 'granted') return true;
            if (stored === 'denied') return false;
            // ⚠️ Cualquier otro valor ('ask', nada o uno roto) pregunta: el de fábrica es preguntar
            const ok = await opts.confirm();
            opts.write(ok ? 'granted' : 'denied');
            return ok;
        },
    };
}
