import { escapeHtml } from '../../core/utils/escape-html.ts';

export { escapeHtml as escHTML };
const escHTML = escapeHtml;

/** Convierte rgb(r,g,b) a `#rrggbb` en minúsculas (un hex se devuelve tal cual). Devuelve '' si no es válida. */
export function rgbToHex(color: unknown): string {
    if (!color) return '';
    if (typeof color === 'string' && color.startsWith('#')) return color;
    const m = String(color).match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (!m) return '';
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

/** Acepta solo #RGB (3), #RRGGBB (6) o #RRGGBBAA (8) hex. Devuelve '' si no es válido. */
export function safeColor(c: unknown): string {
    return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c) ? c : '';
}

export interface SanitizeCellOptions {
    /** Validador de color propio, si una sub-app necesita reglas distintas. */
    safeColor?: (c: unknown) => string;
}

// Se van CON su contenido: desenvolverlos volcaría el código como texto visible en la celda
// . El resto de tags desconocidos sí se desenvuelven.
const DROP_ENTIRELY = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'template']);

export function sanitizeCellHTML(html: string, opts: SanitizeCellOptions = {}): string {
    if (!html) return '';
    const safeColorFn = opts.safeColor || safeColor;
    // Parsear en un <template> INERTE: en un <div> normal, `tmp.innerHTML = html`
    // sí carga recursos, así que `<img src=x onerror=...>` dispara en tiempo de parseo.
    const tmp = document.createElement('template');
    tmp.innerHTML = html;

    const walk = (node: Node): string => {
        let out = '';
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                out += escHTML(child.textContent);
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const el = child as HTMLElement;
                const tag = el.tagName.toLowerCase();
                if (tag === 'b' || tag === 'strong') {
                    out += `<b>${walk(el)}</b>`;
                } else if (tag === 'i' || tag === 'em') {
                    out += `<i>${walk(el)}</i>`;
                } else if (tag === 'u') {
                    out += `<u>${walk(el)}</u>`;
                } else if (tag === 's' || tag === 'strike' || tag === 'del') {
                    out += `<s>${walk(el)}</s>`;
                } else if (tag === 'br') {
                    out += '<br>';
                } else if (tag === 'ul' || tag === 'ol') {
                    out += `<${tag}>${walk(el)}</${tag}>`;
                } else if (tag === 'li') {
                    out += `<li>${walk(el)}</li>`;
                } else if (tag === 'font') {
                    const fc = safeColorFn(el.getAttribute('color'));
                    out += fc ? `<span style="color:${fc};">${walk(el)}</span>` : walk(el);
                } else if (tag === 'span') {
                    const sc = safeColorFn(el.style?.color ? rgbToHex(el.style.color) : '');
                    out += sc ? `<span style="color:${sc};">${walk(el)}</span>` : walk(el);
                } else if (!DROP_ENTIRELY.has(tag)) {
                    out += walk(el);
                }
            }
        }
        return out;
    };

    return walk(tmp.content);
}
