import {
    sanitizeCellHTML as _sanitizeCellHTML,
    rgbToHex as _rgbToHex,
    escHTML as _escHTML,
} from '@features/utils/sanitize-html.ts';
import type { CellTexts, MiniCalData } from './planner-types.ts';

/** Escape HTML entities to prevent XSS in user-supplied text */
export function esc(str: unknown): string {
    return _escHTML(str);
}

/** rgb(r,g,b) → `#rrggbb` en MINÚSCULAS; un hex se devuelve tal cual y lo inválido, ''. Comparar sin mayúsculas. */
export function rgbToHex(color: unknown): string {
    return _rgbToHex(color);
}

/** Re-export sanitizeCellHTML desde utils compartidos. */
export function sanitizeCellHTML(html: string): string {
    return _sanitizeCellHTML(html);
}

/**
 * Strip inline formatting (bold/italic/underline/strike) from cell HTML.
 * Preserves <br>, <ul>, <ol>, <li> (list structure).
 */
export function stripFormattingHTML(html: string): string {
    if (!html) return '';
    // Parse in an inert <template> so that hostile markup (e.g. <img onerror>)
    // does NOT execute at parse time — a plain <div>.innerHTML would fire it.
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const walk = (node: Node): string => {
        let out = '';
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                out += esc(child.textContent);
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tag = (child as Element).tagName.toLowerCase();
                if (tag === 'br') {
                    out += '<br>';
                } else if (tag === 'li') {
                    // Convert list items to line-break-separated text
                    out += walk(child) + '<br>';
                } else {
                    // strip all formatting: b/i/u/s/strong/em/del, spans, font, ul/ol
                    out += walk(child);
                }
            }
        }
        return out;
    };
    return walk(tpl.content);
}

/**
 * Validate hex color to prevent CSS injection.
 * Accepts only #RGB (3), #RRGGBB (6) or #RRGGBBAA (8) hex digits.
 * Rejects malformed lengths like 4, 5 or 7 chars.
 */
export function safeColor(c: unknown): string {
    return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c) ? c : '';
}

/** Defaults for planner page sections (used when config doesn't override) */
export const HABIT_ROWS = 5;
export const TODO_ITEMS = 6;
export const BOTTOM_MAX_HEIGHT = 30; // mm — default max for gratitude section

/**
 * Render a section text entry from sectionTexts config.
 * Returns HTML string for the text span, or '' if no text for that key.
 */
export function renderSectionText(
    sectionTexts: CellTexts,
    key: string,
    accent = '',
    forceAccent = false,
    overrideFormats = false
): string {
    const entry = sectionTexts[key];
    if (!entry || !entry.text) return '';
    // Validate the entry color before interpolating into a style attribute
    // (attribute-context escape) — fall back to the (already-safe) accent.
    const color = forceAccent ? accent : safeColor(entry.color) || accent;
    const colorAttr = color ? ` style="color:${color};"` : '';
    const html = overrideFormats ? stripFormattingHTML(entry.text) : sanitizeCellHTML(entry.text);
    return `<span class="planner-section-text" data-section="${esc(key)}"${colorAttr}>${html}</span>`;
}

/**
 * Render a mini calendar grid (used by planner page 2/3 and monthly combined view).
 */
export function renderMiniCal(data: MiniCalData): string {
    let html = `<div class="p-cal__mini-title">${data.name}</div>`;
    html += '<div class="p-cal__mini-grid">';

    // Day headers
    for (const d of data.dayHeaders) {
        html += `<span class="mini-head">${d}</span>`;
    }

    // Day cells
    for (const cell of data.days) {
        html += `<span>${cell.num}</span>`;
    }

    html += '</div>';
    return html;
}
