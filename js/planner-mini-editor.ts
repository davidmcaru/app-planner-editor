import { isMobile } from '@core/breakpoint/get-bp.ts';
import { createFocusTrap } from '@core/focus-trap/focus-trap.ts';
import { setFlipToggle } from '@widgets/flip-toggle/flip-toggle.ts';
import { sanitizeCellHTML, rgbToHex } from './planner-ui.ts';
import { t } from './planner-i18n.ts';

// 15 colores: el hueco 16 de cada paleta es el color libre (un <input type="color">, _customSwatch)
const CELL_EDIT_COLORS = [
    null,
    '#111111',
    '#607D8B',
    '#6D4C41',
    '#0D47A1',
    '#1976D2',
    '#00838F',
    '#6A1B9A',
    '#9575CD',
    '#9A0007',
    '#BF4400',
    '#D4A843',
    '#D81B60',
    '#EC407A',
    '#2E7D32',
];

const BG_EDIT_COLORS = [
    'NONE',
    '#111111',
    '#607D8B',
    '#6D4C41',
    '#0D47A1',
    '#1976D2',
    '#00838F',
    '#6A1B9A',
    '#9575CD',
    '#9A0007',
    '#BF4400',
    '#D4A843',
    '#D81B60',
    '#EC407A',
    '#2E7D32',
];

// La pluma de la sesión de Textos: el color de texto y el de fondo elegidos pasan a la siguiente casilla en blanco hasta
// Guardar o Cancelar, que la sueltan (el controller llama a resetCellEditorPen). undefined = aún sin elegir
let _penColor: string | null | undefined;
let _penBg: string | null | undefined;

export function resetCellEditorPen() {
    _penColor = undefined;
    _penBg = undefined;
}

// Un color que no está en la paleta lo enseña el hueco libre (la paleta va en mayúsculas y el selector da minúsculas)
function _setCustom(input: HTMLInputElement, hex: string) {
    input.value = hex.toLowerCase();
    input.dataset.colorValue = hex.toUpperCase();
    return input;
}

// El hueco libre es el propio <input type="color">: el mousedown sin foco, como en los demás, deja el texto seleccionado
// mientras se elige, y el clic abre el selector del navegador
function _customSwatch(label: string) {
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'planner-cell-editor__swatch planner-cell-editor__swatch--custom';
    input.title = label;
    input.setAttribute('aria-label', label);
    input.addEventListener('mousedown', (e) => e.preventDefault());
    return input;
}

/**
 * Creates a floating contenteditable mini-editor with two-row toolbar, color palette, and auto-apply.
 *
 * Row 1 (function): [✓ Confirm] [✦ Vacation] [F Holiday] [↺ Reset] [🗑 Delete] [✕ Cancel]
 * Row 2 (format):   [🪣 BG Color] [B] [I] [U] [•] [1.]
 *
 */
let _detachViewport: (() => void) | null = null;
let _scrollLock: (() => void) | null = null;

/** Bloquea el scroll del fondo guardando el `overflow-y` previo, no asumiendo que era ''. */
function _lockScroll() {
    if (_scrollLock) return;
    const prev = document.body.style.overflowY;
    _scrollLock = () => {
        document.body.style.overflowY = prev;
    };
    document.body.style.overflowY = 'hidden';
}

/**
 * En iOS el teclado NO encoge `innerHeight`: sin esto el sheet queda DEBAJO del teclado. La altura
 * la publica `visualViewport` en `--cell-editor-kb`, que el CSS usa como `bottom`.
 */
function _attachSheetViewport(editor: HTMLElement) {
    const vv = window.visualViewport;
    const sync = () => {
        const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
        editor.style.setProperty('--cell-editor-kb', `${Math.round(kb)}px`);
        editor.style.setProperty('--cell-editor-vvh', `${Math.round(vv ? vv.height : window.innerHeight)}px`);
    };
    sync();
    if (!vv) return () => {};
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
        vv.removeEventListener('resize', sync);
        vv.removeEventListener('scroll', sync);
    };
}

// Un lector de pantalla manda mousedown Y un click con detail 0: el click que sigue al mousedown no repite la acción.
const PRESS_ECHO_MS = 500;

// mousedown+preventDefault conserva la selección; Enter/Espacio solo dan un click con detail 0 (el del ratón ya actuó).
function _onPress(btn: HTMLButtonElement, action: (viaKeyboard: boolean) => void) {
    let downAt = -Infinity;
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        downAt = e.timeStamp;
        action(false);
    });
    btn.addEventListener('click', (e) => {
        if (e.detail === 0 && e.timeStamp - downAt > PRESS_ECHO_MS) action(true);
    });
}

export type MiniEditorEl = HTMLDivElement & {
    _cleanup?: () => void;
    _close?: () => void;
    _confirm?: () => void;
    _cancel?: () => void;
    _dismiss?: () => void;
    _getVacationState?: () => boolean;
    _getHolidayHideState?: () => boolean;
    _getBgColor?: () => string | null;
    _restoreCell?: () => void;
    _restoreSection?: () => void;
};

export type MiniEditorOptions = {
    anchorEl: HTMLElement;
    existing?: { text?: string; color?: string | null; bold?: boolean | null } | null;
    accentColor?: string | null;
    accentTitle?: string | null;
    placeholderKey?: string;
    confirmTitle?: string;
    resetTitle?: string;
    deleteTitle?: string;
    supportsVacation?: boolean;
    vacationActive?: boolean;
    vacationDisabled?: boolean;
    vacationDisabledTitle?: string | null;
    onVacationToggle?: (active: boolean) => void;
    supportsHolidayHide?: boolean;
    holidayHideActive?: boolean;
    holidayHideDisabled?: boolean;
    holidayHideDisabledTitle?: string | null;
    onHolidayHideToggle?: (visible: boolean) => void;
    supportsBgColor?: boolean;
    bgColorActive?: string | null;
    // true si bgColorActive es el de fábrica y no uno de la casilla: solo entonces lo cambia la pluma
    bgColorIsDefault?: boolean;
    onBgPreview?: (hex: string | null) => void;
    supportsLists?: boolean;
    supportsBulletList?: boolean;
    boldForced?: boolean;
    formatsDisabled?: boolean;
    formatsDisabledTitle?: string | null;
    colorDisabled?: boolean;
    colorDisabledTitle?: string | null;
    onPreview?: (rawHtml: string, plainText: string, colorHex: string) => void;
    onApply: (rawHtml: string, plainText: string, color: string | null) => void;
    onRestore?: () => void;
    onClear?: () => void;
    onReset?: () => void;
    onConfirm?: () => void;
    onCancel?: () => void;
    onClose?: () => void;
};

export function createMiniEditor(opts: MiniEditorOptions): MiniEditorEl {
    const {
        anchorEl,
        existing: existingOpt = {},
        accentColor,
        accentTitle,
        placeholderKey,
        supportsVacation = false,
        vacationActive = false,
        vacationDisabled = false,
        vacationDisabledTitle = null,
        onVacationToggle,
        supportsHolidayHide = false,
        holidayHideActive = false,
        holidayHideDisabled = false,
        holidayHideDisabledTitle = null,
        onHolidayHideToggle,
        supportsBgColor = false,
        bgColorActive = null,
        bgColorIsDefault = false,
        onBgPreview,
        supportsLists = false,
        supportsBulletList = false,
        boldForced = false,
        formatsDisabled = false,
        formatsDisabledTitle = null,
        colorDisabled = false,
        colorDisabledTitle = null,
        onPreview,
        onRestore,
        onApply,
        onClear,
        onReset,
        onConfirm,
        onCancel,
        onClose,
    } = opts;

    const existing = existingOpt || {};
    const editor = document.createElement('div') as MiniEditorEl;
    editor.className = 'planner-cell-editor';

    // Una casilla en blanco empieza con la pluma de la sesión (un <template> para leer el texto sin cargar nada)
    const probe = document.createElement('template');
    probe.innerHTML = sanitizeCellHTML(existing.text || '');
    const blank = !(probe.content.textContent || '').trim();
    const usePenColor = blank && !colorDisabled && _penColor !== undefined;
    const usePenBg = blank && supportsBgColor && bgColorIsDefault && _penBg !== undefined;

    // ── BG Color Mode state ──
    let _bgMode = false;
    let _bgColor = usePenBg ? (_penBg ?? null) : bgColorActive || null;
    let _draftBgColor: string | null = null;

    // ── ROW 1 — Function row: [✓] [✦] [F] [↺] [🗑] [✕] ──
    const functionRow = document.createElement('div');
    functionRow.className = 'planner-cell-editor__function-row';

    // ── Confirm tick (✓) ──
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn--confirm';
    confirmBtn.innerHTML = '<i class="fas fa-check"></i>';
    confirmBtn.title = opts.confirmTitle || '✓';
    confirmBtn.setAttribute('aria-label', opts.confirmTitle || t('confirmCellBtn'));
    functionRow.appendChild(confirmBtn);

    // ── Vacation toggle (✦) ──
    let _vacationState = vacationActive;
    let _vacationBtn: HTMLButtonElement | null = null;
    if (supportsVacation) {
        _vacationBtn = document.createElement('button');
        _vacationBtn.type = 'button';
        _vacationBtn.className = 'planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn--vacation';
        _vacationBtn.textContent = '✦';
        _vacationBtn.setAttribute('aria-label', t('cellVacationToggle'));
        if (vacationDisabled) {
            _vacationBtn.disabled = true;
            _vacationBtn.title = vacationDisabledTitle || '';
            _vacationBtn.classList.add('is-disabled');
            setFlipToggle(_vacationBtn, false);
        } else {
            const vacBtn = _vacationBtn;
            vacBtn.title = t('cellVacationToggle');
            setFlipToggle(vacBtn, _vacationState);
            _onPress(vacBtn, () => {
                _vacationState = !_vacationState;
                setFlipToggle(vacBtn, _vacationState);
                if (onVacationToggle) onVacationToggle(_vacationState);
            });
        }
        functionRow.appendChild(_vacationBtn);
    }

    // ── Holiday-hide toggle (F) — active=visible (default), inactive=hidden ──
    let _holidayHideState = holidayHideActive;
    let _holidayHideBtn: HTMLButtonElement | null = null;
    if (supportsHolidayHide || holidayHideDisabled) {
        _holidayHideBtn = document.createElement('button');
        _holidayHideBtn.type = 'button';
        _holidayHideBtn.className = 'planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn--holiday-hide';
        _holidayHideBtn.textContent = 'F';
        _holidayHideBtn.setAttribute('aria-label', t('holidayVisibleTitle'));
        if (holidayHideDisabled) {
            _holidayHideBtn.disabled = true;
            _holidayHideBtn.title = holidayHideDisabledTitle || '';
            _holidayHideBtn.classList.add('is-disabled');
            setFlipToggle(_holidayHideBtn, false);
        } else {
            const holBtn = _holidayHideBtn;
            holBtn.title = t('holidayVisibleTitle');
            setFlipToggle(holBtn, _holidayHideState);
            _onPress(holBtn, () => {
                _holidayHideState = !_holidayHideState;
                setFlipToggle(holBtn, _holidayHideState);
                if (onHolidayHideToggle) onHolidayHideToggle(_holidayHideState);
            });
        }
        functionRow.appendChild(_holidayHideBtn);
    }

    // ── Reset format (↺) ──
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn--reset';
    resetBtn.innerHTML = '<i class="fas fa-undo"></i>';
    resetBtn.title = opts.resetTitle || t('resetFormatBtn');
    resetBtn.setAttribute('aria-label', opts.resetTitle || t('resetFormatBtn'));
    _onPress(resetBtn, () => {
        if (_bgMode) {
            // In BG mode: revert to snapshot value and exit
            _draftBgColor = _snapshot.bgColor;
            _exitBgMode(true);
            return;
        }
        // Strip formatting: keep plain text, clear all format commands
        const plain = textInput.textContent;
        textInput.innerHTML = '';
        textInput.textContent = plain;
        // Reset color to accent (null)
        activeColor = null;
        textInput.style.color = accentColor || '';
        colorRow.querySelectorAll('.is-active').forEach((s) => s.classList.remove('is-active'));
        const accentSwatch = colorRow.querySelector('.planner-cell-editor__swatch--accent');
        if (accentSwatch) accentSwatch.classList.add('is-active');
        // Clear bgColor
        _bgColor = null;
        if (onBgPreview) onBgPreview(null);
        _penColor = undefined;
        _penBg = undefined;
        updateFmtState();
        triggerAutoApply();
        if (onReset) onReset();
    });
    functionRow.appendChild(resetBtn);

    // ── Delete (🗑) — clears cell content ──
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn--delete';
    deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    deleteBtn.title = opts.deleteTitle || t('deleteCellBtn');
    deleteBtn.setAttribute('aria-label', opts.deleteTitle || t('deleteCellBtn'));
    _onPress(deleteBtn, () => {
        if (_bgMode) {
            // In BG mode: clear bg color and exit
            _draftBgColor = null;
            _exitBgMode(true);
            return;
        }
        if (onClear) onClear();
    });
    functionRow.appendChild(deleteBtn);

    // ── Cancel (✕) — revert and close ──
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn--cancel';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
    cancelBtn.title = t('cancelBtn');
    cancelBtn.setAttribute('aria-label', t('cancelBtn'));
    _onPress(cancelBtn, () => {
        if (_bgMode) {
            _exitBgMode(false);
        } else {
            _cancelEditor();
        }
    });
    functionRow.appendChild(cancelBtn);

    editor.appendChild(functionRow);

    // ── ROW 2 — Format row: [🪣 BG] [B] [I] [U] [•] [1.] ──
    const formatRow = document.createElement('div');
    formatRow.className = 'planner-cell-editor__format-row';

    // ── BG Color button (🪣) ──
    let _bgColorBtn: HTMLButtonElement | null = null;
    if (supportsBgColor) {
        _bgColorBtn = document.createElement('button');
        _bgColorBtn.type = 'button';
        _bgColorBtn.className = 'planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn--bg-color';
        _bgColorBtn.innerHTML = '<i class="fas fa-fill-drip"></i>';
        _bgColorBtn.title = t('textPanelBgColor');
        _bgColorBtn.setAttribute('aria-label', t('textPanelBgColor'));
        if (_bgColor && _bgColor !== 'NONE') _bgColorBtn.classList.add('is-active');
        _onPress(_bgColorBtn, () => {
            if (_bgMode) {
                _exitBgMode(false);
            } else {
                _enterBgMode();
            }
        });
        formatRow.appendChild(_bgColorBtn);
    } else {
        // Create disabled placeholder for planner mode
        const bgPlaceholder = document.createElement('button');
        bgPlaceholder.type = 'button';
        bgPlaceholder.className = 'planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn--bg-color';
        bgPlaceholder.innerHTML = '<i class="fas fa-fill-drip"></i>';
        bgPlaceholder.title = t('bgColorDisabledTitle');
        bgPlaceholder.disabled = true;
        bgPlaceholder.classList.add('is-disabled');
        formatRow.appendChild(bgPlaceholder);
    }

    // ── Format buttons: [B] [I] [U] ──
    const fmtButtons = [
        { tag: 'bold', label: 'B', title: t('fmtBoldTitle'), cls: '--bold' },
        { tag: 'italic', label: 'I', title: t('fmtItalicTitle'), cls: '--italic' },
        { tag: 'underline', label: 'U', title: t('fmtUnderlineTitle'), cls: '--underline' },
    ];

    // Por teclado el foco está en el botón: execCommand actúa sobre el editable enfocado, y luego el foco vuelve.
    function _runFormat(btn: HTMLButtonElement, cmd: string, viaKeyboard: boolean) {
        const saved = _saveSelection();
        if (viaKeyboard) textInput.focus({ preventScroll: true });
        _restoreSelection(saved);
        document.execCommand(cmd, false, '');
        updateFmtState();
        triggerAutoApply();
        if (viaKeyboard) btn.focus({ preventScroll: true });
    }

    const fmtBtnEls: Record<string, HTMLButtonElement> = {};
    for (const fmt of fmtButtons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn${fmt.cls}`;
        btn.textContent = fmt.label;
        btn.title = fmt.title;
        // Su texto es «B», «I» o «U»: sin él el lector no dice qué hace (el title solo describe)
        btn.setAttribute('aria-label', fmt.title);
        _onPress(btn, (viaKeyboard) => {
            if (!btn.disabled) _runFormat(btn, fmt.tag, viaKeyboard);
        });
        formatRow.appendChild(btn);
        fmtBtnEls[fmt.tag] = btn;
    }

    // Disable Bold button if panel forces bold/light
    if (boldForced && fmtBtnEls.bold) {
        fmtBtnEls.bold.disabled = true;
        fmtBtnEls.bold.classList.add('is-disabled');
    }

    // Disable ALL format buttons when overrideFormats is active
    if (formatsDisabled) {
        for (const fmt of fmtButtons) {
            fmtBtnEls[fmt.tag]!.disabled = true;
            fmtBtnEls[fmt.tag]!.classList.add('is-disabled');
            if (formatsDisabledTitle) fmtBtnEls[fmt.tag]!.title = formatsDisabledTitle;
        }
    }

    const updateFmtState = () => {
        for (const fmt of fmtButtons) {
            const active = document.queryCommandState(fmt.tag);
            fmtBtnEls[fmt.tag]!.classList.toggle('is-active', active);
        }
    };

    // ── List buttons ──
    const listsEnabled = supportsLists || supportsBulletList;
    const listButtons = [
        { cmd: 'insertUnorderedList', label: '•', title: t('fmtBulletListTitle'), cls: '--ul' },
        { cmd: 'insertOrderedList', label: '1.', title: t('fmtNumberedListTitle'), cls: '--ol', onlyFull: true },
    ];
    const listBtnEls: Array<{ btn: HTMLButtonElement; cmd: string; onlyFull?: boolean }> = [];
    for (const lb of listButtons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `planner-cell-editor__fmt-btn planner-cell-editor__fmt-btn${lb.cls}`;
        btn.textContent = lb.label;
        btn.title = lb.title;
        btn.setAttribute('aria-label', lb.title);
        const isDisabled = !listsEnabled || (lb.onlyFull && !supportsLists);
        if (isDisabled) {
            btn.disabled = true;
            btn.classList.add('is-disabled');
        } else {
            _onPress(btn, (viaKeyboard) => {
                if (!btn.disabled) _runFormat(btn, lb.cmd, viaKeyboard);
            });
        }
        formatRow.appendChild(btn);
        listBtnEls.push({ btn, cmd: lb.cmd, onlyFull: lb.onlyFull });
    }

    editor.appendChild(formatRow);

    // ── Contenteditable input ──
    const textInput = document.createElement('div');
    textInput.className = 'planner-cell-editor__input';
    textInput.contentEditable = 'true';
    textInput.setAttribute('role', 'textbox');
    textInput.setAttribute('aria-multiline', 'true');
    textInput.dataset.placeholder = placeholderKey;
    textInput.innerHTML = sanitizeCellHTML(existing.text || '');

    // activeColor tracks the currently selected palette color (for bg toggle & new text)
    let activeColor = usePenColor ? (_penColor ?? null) : existing.color || null;
    // Default text color (used when no inline color spans present)
    textInput.style.color = activeColor || accentColor || '';

    const _safeHex = (c: string | null) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '');

    const getEditorText = () => sanitizeCellHTML(textInput.innerHTML);
    const getEditorPlain = () => (textInput.textContent || '').trim();

    /** Get the foreground color at the current caret position */
    function _getCaretColor() {
        try {
            const raw = document.queryCommandValue('foreColor');
            if (!raw) return null;
            return rgbToHex(raw) || null;
        } catch {
            return null;
        }
    }

    /** Save the current selection range if it lives inside textInput */
    function _saveSelection() {
        try {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (textInput.contains(range.commonAncestorContainer)) {
                    return range.cloneRange();
                }
            }
        } catch {
            /* noop */
        }
        return null;
    }

    /** Restore a previously saved range into the selection */
    function _restoreSelection(savedRange: Range | null) {
        if (!savedRange) return;
        try {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(savedRange);
        } catch {
            /* noop */
        }
    }

    function triggerAutoApply() {
        const raw = getEditorText();
        const plain = getEditorPlain();
        if (onPreview) onPreview(raw, plain, _safeHex(activeColor));
        onApply(raw, plain, activeColor);
    }

    // ── Dirty tracking (snapshot comparison) ──
    const _snapshot = {
        text: sanitizeCellHTML(existing.text || ''),
        color: existing.color || null,
        vacation: vacationActive,
        holidayHide: holidayHideActive,
        bgColor: bgColorActive || null,
    };

    // ── Close / confirm / cancel helpers ──
    let _closed = false;

    /**
     * Devuelve el foco a la celda/sección que abrió el editor.
     * Las celdas <td>/<section> no son focusable de serie, así que aplicamos
     * un `tabindex="-1"` programático para poder hacer `focus()`.
     */
    function _restoreAnchorFocus() {
        if (!anchorEl || typeof anchorEl.focus !== 'function') return;
        try {
            if (!anchorEl.hasAttribute('tabindex')) {
                anchorEl.setAttribute('tabindex', '-1');
            }
            anchorEl.focus({ preventScroll: true });
        } catch {
            /* noop — restoring focus es best-effort */
        }
    }

    function _confirmEditor() {
        if (_bgMode) {
            _exitBgMode(true);
            return;
        }
        if (_closed) return;
        _closed = true;
        editor._cleanup?.();
        editor.remove();
        _restoreAnchorFocus();
        if (onConfirm) onConfirm();
        else if (onClose) onClose();
    }

    /** Confirm BG mode (if active) AND close the editor — used by click-outside */
    function _confirmAndClose() {
        if (_bgMode) _exitBgMode(true);
        if (_closed) return;
        _closed = true;
        editor._cleanup?.();
        editor.remove();
        _restoreAnchorFocus();
        if (onConfirm) onConfirm();
        else if (onClose) onClose();
    }

    function _cancelEditor() {
        if (_bgMode) {
            _exitBgMode(false);
            return;
        }
        if (_closed) return;
        _closed = true;
        if (onRestore) onRestore();
        editor._cleanup?.();
        editor.remove();
        _restoreAnchorFocus();
        if (onCancel) onCancel();
        else if (onClose) onClose();
    }

    function _closeEditor() {
        if (_closed) return;
        _closed = true;
        editor._cleanup?.();
        editor.remove();
        _restoreAnchorFocus();
        if (onClose) onClose();
    }

    _onPress(confirmBtn, () => _confirmEditor());

    let _selRaf = 0;
    const _onSelectionChange = () => {
        if (_selRaf) return;
        _selRaf = requestAnimationFrame(() => {
            _selRaf = 0;
            if (_bgMode) return;
            if (editor.contains(document.activeElement)) {
                updateFmtState();
                // El swatch sigue al color del cursor: el acento es null (sigue al acento) y el resto, su hex
                if (!colorDisabled) {
                    // ⚠️ rgbToHex da minúsculas y la paleta y el acento, mayúsculas: sin igualarlas, lo tecleado con el
                    // acento de fábrica (#1976D2, que también está en la paleta) se guardaba con ese color fijo
                    const hex = (c: string | null | undefined) => (c || '').toLowerCase();
                    const caretHex = hex(_getCaretColor());
                    // Si el cursor ya pinta lo elegido, se respeta: el acento y su mismo color de la paleta no se distinguen
                    if (caretHex && caretHex !== hex(activeColor ?? accentColor)) {
                        const matched = CELL_EDIT_COLORS.find((c) => hex(c ?? accentColor) === caretHex);
                        activeColor = matched !== undefined ? matched : caretHex.toUpperCase();
                        _updateSwatchActive(activeColor);
                    }
                }
            }
        });
    };
    document.addEventListener('selectionchange', _onSelectionChange);

    textInput.addEventListener('input', () => {
        const contenido = textInput.textContent || '';
        if (contenido.length > 1000) {
            const sel = window.getSelection();
            const range = sel!.getRangeAt(0);
            textInput.textContent = contenido.slice(0, 1000);
            range.collapse(false);
        }
        updateFmtState();
        triggerAutoApply();
    });

    textInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData?.getData('text/plain') || '').slice(0, 1000);
        document.execCommand('insertText', false, text);
    });

    // Shift+Enter = confirm, Enter = new line (natural), Escape = cancel
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (_bgMode) {
                _exitBgMode(false);
            } else {
                _cancelEditor();
            }
        } else if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            _confirmEditor();
        }
    });

    // El trap es el compartido: además de ciclar Tab, FILTRA los enfocables ocultos (los swatches
    // de color escondidos entraban en el ciclo) y captura en `document`, así que si el foco se
    // escapa fuera vuelve. El que había aquí escuchaba por burbujeo y no lo recuperaba.
    const _trap = createFocusTrap(editor, { initialFocus: textInput });

    editor.appendChild(textInput);

    // ── Color palette — Text row ──
    const colorRow = document.createElement('div');
    colorRow.className = 'planner-cell-editor__color-row';

    /** Highlight the swatch matching the given color (null = accent) in the text row */
    function _updateSwatchActive(colorVal: string | null) {
        colorRow.querySelectorAll('.is-active').forEach((s) => s.classList.remove('is-active'));
        const swatches = colorRow.querySelectorAll<HTMLElement>('.planner-cell-editor__swatch');
        for (const s of swatches) {
            const sc = s.dataset.colorValue;
            if (sc === (colorVal ?? '')) {
                s.classList.add('is-active');
                return;
            }
        }
        if (colorVal) _setCustom(customColor, colorVal).classList.add('is-active');
    }

    // Un color de la paleta o el libre; también es el de la pluma para la siguiente casilla en blanco
    function _pickTextColor(color: string | null, saved: Range | null) {
        const applyHex = color || accentColor || '';
        // Detect whether the user has a real text selection or just a caret.
        // - Caret (collapsed): swatch acts as "default color for the whole cell"
        //   → update activeColor (wrapper color in folio).
        // - Range (text selected): swatch only colors that fragment via execCommand
        //   → DO NOT touch activeColor, otherwise the unstyled rest of the cell
        //   would inherit the new color in the folio render.
        const hasRangeSelection = !!(saved && !saved.collapsed);
        if (!hasRangeSelection) {
            activeColor = color;
        }
        _penColor = color;
        textInput.focus();
        _restoreSelection(saved);
        document.execCommand('foreColor', false, applyHex);
        _updateSwatchActive(activeColor);
        if (color === null && _bgColor) {
            _bgColor = null;
            _penBg = null;
            if (_bgColorBtn) _bgColorBtn.classList.remove('is-active');
            if (onBgPreview) onBgPreview(null);
        }
        triggerAutoApply();
    }

    for (const color of CELL_EDIT_COLORS) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'planner-cell-editor__swatch';
        swatch.dataset.colorValue = color ?? '';
        if (color) {
            swatch.style.backgroundColor = color;
            swatch.title = color;
            if (color === '#111111') swatch.classList.add('planner-cell-editor__swatch--black');
        } else {
            swatch.style.backgroundColor = accentColor || '';
            swatch.title = accentTitle || '';
            swatch.classList.add('planner-cell-editor__swatch--accent');
        }
        if (activeColor === color) swatch.classList.add('is-active');
        if (colorDisabled) {
            swatch.disabled = true;
            swatch.classList.add('is-disabled');
            if (colorDisabledTitle) swatch.title = colorDisabledTitle;
        } else {
            _onPress(swatch, () => _pickTextColor(color, _saveSelection()));
        }
        colorRow.appendChild(swatch);
    }
    const customColor = _customSwatch(t('cellColorCustom'));
    if (colorDisabled) {
        customColor.disabled = true;
        customColor.classList.add('is-disabled');
        if (colorDisabledTitle) customColor.title = colorDisabledTitle;
    } else {
        customColor.addEventListener('input', () => _pickTextColor(customColor.value.toUpperCase(), _saveSelection()));
    }
    colorRow.appendChild(customColor);
    // La casilla puede traer un color libre: sin esto, ningún hueco saldría marcado
    _updateSwatchActive(activeColor);
    editor.appendChild(colorRow);

    // ── Color palette — BG row (hidden by default) ──
    const bgColorRow = document.createElement('div');
    bgColorRow.className = 'planner-cell-editor__color-row';
    bgColorRow.style.display = 'none';

    /** Highlight the swatch matching the given color in the BG row */
    function _updateBgSwatchActive(colorVal: string | null) {
        bgColorRow.querySelectorAll('.is-active').forEach((s) => s.classList.remove('is-active'));
        const swatches = bgColorRow.querySelectorAll<HTMLElement>('.planner-cell-editor__swatch');
        for (const s of swatches) {
            const sc = s.dataset.colorValue;
            if (sc === (colorVal ?? '')) {
                s.classList.add('is-active');
                return;
            }
        }
        if (colorVal && colorVal !== 'NONE') _setCustom(customBg, colorVal).classList.add('is-active');
    }

    function _pickBgColor(bgC: string) {
        _draftBgColor = bgC;
        _updateBgSwatchActive(bgC);
        const previewHex = bgC === 'NONE' ? null : bgC;
        if (onBgPreview) onBgPreview(previewHex);
        _setBgModeConfirmCancel(true);
    }

    for (const bgC of BG_EDIT_COLORS) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'planner-cell-editor__swatch';
        swatch.dataset.colorValue = bgC;
        if (bgC === 'NONE') {
            swatch.classList.add('planner-cell-editor__swatch--no-color');
            swatch.title = t('bgColorNone');
        } else {
            swatch.style.backgroundColor = bgC;
            swatch.title = bgC;
            if (bgC === '#111111') swatch.classList.add('planner-cell-editor__swatch--black');
        }
        _onPress(swatch, () => _pickBgColor(bgC));
        bgColorRow.appendChild(swatch);
    }
    const customBg = _customSwatch(t('cellColorCustom'));
    customBg.addEventListener('input', () => _pickBgColor(customBg.value.toUpperCase()));
    bgColorRow.appendChild(customBg);
    editor.appendChild(bgColorRow);

    // ── BG Color Mode — enter / exit helpers ──

    /** Collect all disableable elements (L1 buttons, L2 format buttons, text input) */
    function _getDisableableEls() {
        const els: HTMLButtonElement[] = [];
        // L1 buttons (deleteBtn + resetBtn excluded — stay enabled in BG mode)
        els.push(confirmBtn);
        if (_vacationBtn) els.push(_vacationBtn);
        if (_holidayHideBtn) els.push(_holidayHideBtn);
        els.push(cancelBtn);
        // L2 format buttons
        for (const fmt of fmtButtons) {
            els.push(fmtBtnEls[fmt.tag]!);
        }
        for (const lb of listBtnEls) {
            els.push(lb.btn);
        }
        return els;
    }

    function _enterBgMode() {
        _bgMode = true;
        _draftBgColor = _bgColor;
        editor.classList.add('is-bg-mode');
        if (_bgColorBtn) _bgColorBtn.classList.add('is-active');

        // Disable all buttons except swatches and delete
        for (const el of _getDisableableEls()) {
            el.disabled = true;
            el.classList.add('is-bg-disabled');
        }

        // Confirm + cancel stay enabled immediately in BG mode
        _setBgModeConfirmCancel(true);

        // Disable text input
        textInput.contentEditable = 'false';
        textInput.classList.add('is-bg-disabled');

        // Swap color rows: hide text palette, show BG palette
        colorRow.style.display = 'none';
        bgColorRow.style.display = '';

        // Show current bgColor swatch as active in BG row
        bgColorRow.querySelectorAll('.is-active').forEach((s) => s.classList.remove('is-active'));
        if (_bgColor && _bgColor !== 'NONE') {
            _updateBgSwatchActive(_bgColor);
        } else if (_bgColor === 'NONE') {
            _updateBgSwatchActive('NONE');
        }
    }

    function _setBgModeConfirmCancel(enabled: boolean) {
        if (enabled) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('is-bg-disabled');
            cancelBtn.disabled = false;
            cancelBtn.classList.remove('is-bg-disabled');
        }
    }

    function _exitBgMode(apply: boolean) {
        if (apply) {
            _bgColor = _draftBgColor;
            _penBg = _bgColor;
        } else {
            // Revert preview
            const revertHex = _bgColor && _bgColor !== 'NONE' ? _bgColor : null;
            if (onBgPreview) onBgPreview(revertHex);
        }
        _bgMode = false;
        _draftBgColor = null;
        editor.classList.remove('is-bg-mode');

        // Swap color rows back: show text palette, hide BG palette
        colorRow.style.display = '';
        bgColorRow.style.display = 'none';

        // Re-enable all buttons
        for (const el of _getDisableableEls()) {
            el.classList.remove('is-bg-disabled');
            // Restore disabled state for buttons that were disabled before BG mode
            el.disabled = false;
        }

        // Re-apply original disabled states
        if (boldForced && fmtBtnEls.bold) {
            fmtBtnEls.bold.disabled = true;
            fmtBtnEls.bold.classList.add('is-disabled');
        }
        if (formatsDisabled) {
            for (const fmt of fmtButtons) {
                fmtBtnEls[fmt.tag]!.disabled = true;
                fmtBtnEls[fmt.tag]!.classList.add('is-disabled');
            }
        }
        if (_vacationBtn && vacationDisabled) {
            _vacationBtn.disabled = true;
            _vacationBtn.classList.add('is-disabled');
        }
        if (_holidayHideBtn && holidayHideDisabled) {
            _holidayHideBtn.disabled = true;
            _holidayHideBtn.classList.add('is-disabled');
        }
        for (const lb of listButtons) {
            const isDisabled = !listsEnabled || (lb.onlyFull && !supportsLists);
            if (isDisabled) {
                const lbtn = formatRow.querySelector<HTMLButtonElement>(`.planner-cell-editor__fmt-btn${lb.cls}`);
                if (lbtn) {
                    lbtn.disabled = true;
                    lbtn.classList.add('is-disabled');
                }
            }
        }

        // Re-enable text input
        textInput.contentEditable = 'true';
        textInput.classList.remove('is-bg-disabled');

        // Update BG button state
        if (_bgColorBtn) _bgColorBtn.classList.toggle('is-active', !!_bgColor && _bgColor !== 'NONE');

        // Restore text color swatch selection
        _updateSwatchActive(activeColor);

        triggerAutoApply();
        textInput.focus();
    }

    // ── Position near anchor ──
    document.body.appendChild(editor);
    _trap.activate();

    editor._cleanup = () => {
        if (_selRaf) cancelAnimationFrame(_selRaf);
        document.removeEventListener('selectionchange', _onSelectionChange);
        // deactivate() devuelve el foco al que lo tenía; _restoreAnchorFocus lo lleva DESPUÉS a la
        // celda editada, que es lo que el planner quiere y el compartido no puede saber.
        _trap.deactivate();
        // Las cuatro vías de cierre pasan por aquí, así que el sheet se deshace en una sola.
        _detachViewport?.();
        _detachViewport = null;
        _scrollLock?.();
        _scrollLock = null;
        document.body.classList.remove('planner-cell-editing');
    };
    editor._close = _closeEditor;
    editor._confirm = _confirmAndClose;
    editor._cancel = _cancelEditor;
    editor._dismiss = () => {
        // Close without triggering onClose (for panel-level exit handlers)
        if (_closed) return;
        _closed = true;
        editor._cleanup?.();
        editor.remove();
        _restoreAnchorFocus();
    };
    editor._getVacationState = () => _vacationState;
    editor._getHolidayHideState = () => _holidayHideState;
    editor._getBgColor = () => _bgColor;

    // Uniform contract: every editor instance MUST expose `_restoreCell`
    // and `_restoreSection` so callers can revert the visual preview on
    // cancel without `typeof === 'function'` guards everywhere. Specific
    // edit modes (weekly cell, planner section, monthly cell, quarterly
    // cell) overwrite these with their own restore implementations.
    editor._restoreCell = () => {};
    editor._restoreSection = () => {};

    if (isMobile()) {
        // Bottom-sheet a sangre: en 360px el flotante anclado a la celda no cabe. El CSS lo hace
        // todo salvo la altura del teclado, que solo conoce visualViewport.
        editor.classList.add('planner-cell-editor--sheet');
        document.body.classList.add('planner-cell-editing');
        _lockScroll();
        _detachViewport = _attachSheetViewport(editor);
        // preventScroll: enfocar sin que el navegador arrastre el folio bajo el sheet.
        textInput.focus({ preventScroll: true });
        // Y que la celda que se edita quede a la vista POR ENCIMA del sheet.
        requestAnimationFrame(() => anchorEl.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    } else {
        const anchorRect = anchorEl.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();

        let top = anchorRect.bottom + 4;
        let left = anchorRect.left;

        if (top + editorRect.height > window.innerHeight) {
            top = anchorRect.top - editorRect.height - 4;
        }
        if (left + editorRect.width > window.innerWidth) {
            left = window.innerWidth - editorRect.width - 8;
        }

        editor.style.top = `${top}px`;
        editor.style.left = `${left}px`;
        textInput.focus();
    }

    return editor;
}
