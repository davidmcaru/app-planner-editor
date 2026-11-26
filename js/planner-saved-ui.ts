import { toJpeg } from 'html-to-image';
import { checksum, sanitizeCodeInput } from '@features/utils/share-codec.ts';
import { rgbToHex } from '@features/utils/sanitize-html.ts';
import { uniqueName } from '@features/utils/saved-store.ts';
import { copyTextToClipboard } from '@core/utils/copy-to-clipboard.ts';
import { escapeHtml as esc } from '@core/utils/escape-html.ts';
import { initSavedReorder } from '@widgets/saved-panel/saved-panel.ts';
import { confirmDialog, promptDialog } from '@widgets/dialog/dialog.ts';
import { t } from './planner-i18n.ts';
import { showToast } from './planner-toasts.ts';
import { logger } from './planner-logger.ts';
import { panelStore } from './planner-panel-store.ts';
import { $id, showBackdrop, removeBackdrop } from './planner-dom.ts';
import { getMonth, getStyle, getYear } from './planner-state.ts';
import { getPersistablePlannerState, commitHistory, getApplyGen, restoreApplyGen } from './planner-persist.ts';
import { applyFullPlannerState } from './planner-apply.ts';
import { PlannerSaved } from './planner-saved.ts';
import { PlannerShareCode, type PlannerNav } from './planner-share-code.ts';
import type { PlannerPersistState } from './planner-types.ts';

const LIST_ID = 'savedList';

let _appliedId: string | null = null;
// Draft del panel: cargar o importar se ve EN VIVO, pero solo lo confirma Guardar.
// La lista (guardar, borrar, reordenar) queda fuera del draft: Cancelar no resucita lo borrado.
let _baseline: PlannerPersistState | null = null;
let _genAtOpen = 0;
let _dirty = false;
// Cargar uno lleva a su mes: Cancelar devuelve también el de la apertura
let _navAtOpen: PlannerNav | null = null;

const STYLE_LABEL_KEY: Record<string, string> = {
    planner: 'stylePlanner',
    weekly: 'styleWeekly',
    monthly: 'styleMonthly',
    quarterly: 'styleQuarterly',
};

// Los códigos salen de parseShareCode (share-codec) y decodeAndSanitize: uno nuevo cae al aviso genérico.
const BAD_CODE_KEY: Record<string, string> = {
    formato: 'savedBadCodeFormat',
    version: 'savedBadCodeVersion',
    checksum: 'savedBadCodeChecksum',
    esquema: 'savedBadCodeSchema',
    excepcion: 'savedBadCodeRead',
};

function _toastBadCode(res: { error: string; detail?: string }) {
    logger.warn('Código de planner rechazado:', res.error, res.detail || '');
    showToast(t(BAD_CODE_KEY[res.error] || 'savedBadCode'), 'error', 5000);
}

function _currentName() {
    const base = `${t(STYLE_LABEL_KEY[getStyle()] || 'stylePlanner')} ${getYear()}`;
    const existing = PlannerSaved.list().map((x) => x && x.name);
    return uniqueName(base, existing, t('savedDefaultName'));
}

// Sin el idioma de los textos: su sello cambia la clave de un folio igual al de una tarjeta de antes (tl null)
function _stateKeys(): { key: string; withLang: string } {
    try {
        const { cellLangs: _cellLangs, ...s } = getPersistablePlannerState();
        return {
            key: 'k' + checksum(JSON.stringify({ ...s, textsLang: null })),
            withLang: 'k' + checksum(JSON.stringify(s)),
        };
    } catch {
        return { key: '', withLang: '' };
    }
}

function _pageBg(el: HTMLElement): string {
    const hex = rgbToHex(getComputedStyle(el).backgroundColor);
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffffff';
}

// Miniatura best-effort; sin miniatura cae al swatch de color.
async function captureThumb(): Promise<string | null> {
    try {
        const el = $id('page1');
        if (!el) return null;
        const doCapture = () =>
            toJpeg(el, {
                quality: 0.5,
                pixelRatio: 0.3,
                backgroundColor: _pageBg(el),
                skipFonts: true,
                style: { transform: 'none', transformOrigin: 'top left', margin: '0', boxShadow: 'none' },
            });
        return await Promise.race([
            doCapture(),
            new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 15000)),
        ]);
    } catch {
        return null;
    }
}

function renderCards() {
    const list = $id(LIST_ID);
    if (!list) return;
    const addCard = `
        <div class="edt-saved-card edt-saved-card--add">
            <button type="button" class="edt-saved-card__apply" data-action="saved-save-current" title="${esc(t('savedSaveCurrent'))}" aria-label="${esc(t('savedSaveCurrent'))}">
                <span class="edt-saved-card__add-box">
                    <i class="fas fa-plus" aria-hidden="true"></i>
                    <span>${esc(t('savedSaveDesign'))}</span>
                </span>
            </button>
        </div>`;
    list.innerHTML =
        addCard +
        PlannerSaved.list()
            .map((it) => {
                const media = it.thumb
                    ? `<img class="edt-saved-card__thumb" src="${esc(it.thumb)}" alt="${esc(it.name)}" loading="lazy">`
                    : `<span class="edt-saved-card__swatch" style="background:${esc(it.bgSwatch || '#fff')}"><i class="fas fa-calendar-days" aria-hidden="true"></i></span>`;
                return `
        <div class="edt-saved-card${it.id === _appliedId ? ' is-applied' : ''}" data-id="${esc(it.id)}" title="${esc(it.name)}">
            <button type="button" class="edt-saved-card__apply" data-action="saved-apply" data-id="${esc(it.id)}" title="${esc(t('savedApply'))}" aria-label="${esc(it.name)}">
                ${media}
            </button>
            <div class="edt-saved-card__actions">
                <button type="button" class="edt-saved-card__act edt-saved-card__drag" title="${esc(t('savedReorder'))}" aria-label="${esc(t('savedReorder'))}"><i class="fas fa-arrows-alt" aria-hidden="true"></i></button>
                <button type="button" class="edt-saved-card__act" data-action="saved-copy" data-id="${esc(it.id)}" title="${esc(t('savedCopy'))}" aria-label="${esc(t('savedCopy'))}"><i class="fas fa-copy" aria-hidden="true"></i></button>
                <button type="button" class="edt-saved-card__act edt-saved-card__act--danger" data-action="saved-delete" data-id="${esc(it.id)}" title="${esc(t('savedDelete'))}" aria-label="${esc(t('savedDelete'))}"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </div>
        </div>`;
            })
            .join('');
}

async function saveCurrent() {
    const btn = document.querySelector<HTMLButtonElement>('[data-action="saved-save-current"]');
    const prevHtml = btn ? btn.innerHTML : null;
    if (btn) {
        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.innerHTML =
            '<span class="edt-saved-card__add-box"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> <span>' +
            esc(t('savedSaving')) +
            '</span></span>';
    }
    try {
        // code/key/swatch en t0: la captura tarda hasta 15 s y el usuario puede seguir editando.
        const code = await PlannerShareCode.encodeCurrent();
        const { key, withLang } = _stateKeys();
        const avisarLleno = () => showToast(t('savedFull', { max: PlannerSaved.max }), 'warning', 5000);
        // Antes de la miniatura (hasta 15 s): si no cabe, que el usuario no la espere para nada.
        if (!PlannerSaved.canAdd({ code, key }, withLang)) {
            avisarLleno();
            return;
        }
        const el = $id('page1');
        const bgSwatch = el ? _pageBg(el) : '#ffffff';
        const thumb = await captureThumb();
        const res = PlannerSaved.add({ name: _currentName(), bgSwatch, thumb, code, key }, withLang);
        renderCards();
        if (!res.ok) avisarLleno();
        else if (res.persisted) showToast(t('savedSaved'), 'success', 2500);
        else showToast(t('savedQuota'), 'error', 5000);
    } catch {
        showToast(t('savedError'), 'error', 5000);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('is-loading');
            if (prevHtml !== null) btn.innerHTML = prevHtml;
        }
    }
}

async function shareCurrent() {
    const btn = $id('savedShareBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    let code = '';
    try {
        code = await PlannerShareCode.encodeCurrent();
    } catch {
        showToast(t('savedError'), 'error', 5000);
    } finally {
        if (btn) btn.disabled = false;
    }
    if (!code) return;
    const res = await promptDialog(t('savedShareLabel'), {
        title: t('savedShareTitle'),
        multiline: true,
        readOnly: true,
        defaultValue: code,
        okLabel: t('savedShareCopy'),
        okIcon: 'fa-copy',
        cancelLabel: t('cancelBtn'),
    });
    if (res === null) return;
    if (await copyTextToClipboard(code)) showToast(t('savedCopied'), 'success', 2000);
    else showToast(t('savedCopyFail'), 'error', 4000);
}

async function importCode() {
    const pasted = await promptDialog(t('savedPasteLabel'), {
        title: t('savedImportTitle'),
        multiline: true,
        placeholder: t('savedPastePlaceholder'),
        okLabel: t('savedImport'),
        okIcon: 'fa-file-import',
        cancelLabel: t('cancelBtn'),
    });
    if (pasted === null) return;
    const code = sanitizeCodeInput(pasted);
    if (!code) return;
    const res = await PlannerShareCode.decodeAndSanitize(code);
    if (!res.ok) {
        _toastBadCode(res);
        return;
    }
    // Cerrado mientras se decodificaba (Escape, clic fuera): aplicar ahora dejaría el cambio vivo sin borrador.
    if (!panelStore.isOpen('saved')) return;
    PlannerShareCode.applyPayload(res.payload, res.nav);
    _dirty = true;
    showToast(t('savedImported'), 'success', 3500);
}

async function applyId(id: string) {
    const it = PlannerSaved.get(id);
    if (!it) return;
    const res = await PlannerShareCode.decodeAndSanitize(it.code);
    if (!res.ok) {
        _toastBadCode(res);
        return;
    }
    // Cerrado mientras se decodificaba (Escape, clic fuera): aplicar ahora dejaría el cambio vivo sin borrador.
    if (!panelStore.isOpen('saved')) return;
    PlannerShareCode.applyPayload(res.payload, res.nav);
    _dirty = true;
    _appliedId = id;
    // Sin toast: el planner cambia a la vista, y la tarjeta se resalta. Decirlo además sobraba —
    // y su «puedes revertirlo con Deshacer» dejó de ser la vía buena al llegar Cancelar.
    renderCards();
}

async function copyId(id: string) {
    const it = PlannerSaved.get(id);
    if (!it) return;
    if (await copyTextToClipboard(it.code)) showToast(t('savedCopied'), 'success', 2000);
    else showToast(t('savedCopyFail'), 'error', 4000);
}

async function deleteId(id: string) {
    const ok = await confirmDialog(t('savedConfirmDelete'), {
        title: t('savedDeleteTitle'),
        icon: 'fa-trash',
        danger: true,
        okLabel: t('acceptBtn'),
        cancelLabel: t('cancelBtn'),
    });
    if (!ok) return;
    PlannerSaved.remove(id);
    renderCards();
}

export function initSavedUi() {
    const btn = $id('btnGuardados');
    const panel = $id('savedPanel');
    if (!btn || !panel) return;

    function openSaved() {
        panelStore.setOpen('saved', true);
        _baseline = getPersistablePlannerState();
        _genAtOpen = getApplyGen();
        _navAtOpen = { year: getYear(), month: getMonth() };
        _dirty = false;
        panel!.hidden = false;
        renderCards();
        showBackdrop(cancelSaved, panel);
    }
    function ocultarSaved() {
        panelStore.setOpen('saved', false);
        panel!.hidden = true;
        removeBackdrop();
        _baseline = null;
        _navAtOpen = null;
        _dirty = false;
    }
    // El cierre estructural (abrir otro panel, clic fuera) equivale a Cancelar, como en el resto.
    function cancelSaved() {
        if (_dirty && _baseline) {
            applyFullPlannerState(_baseline);
            if (_navAtOpen) PlannerShareCode.showNav(_navAtOpen);
            // Es el folio de la apertura: la traducción que espera a este cierre era para él y no se descarta.
            restoreApplyGen(_genAtOpen);
        }
        _appliedId = null;
        ocultarSaved();
    }
    function saveSaved() {
        const commit = _dirty;
        ocultarSaved();
        if (commit) commitHistory();
    }
    panelStore.setCloser('saved', cancelSaved);
    panelStore.setOpener('saved', openSaved);

    btn.addEventListener('click', () => {
        if (panelStore.isOpen('saved')) cancelSaved();
        else openSaved();
    });
    $id('masGuardadosRow')?.addEventListener('click', openSaved);
    $id('savedCancel')?.addEventListener('click', cancelSaved);
    $id('savedSave')?.addEventListener('click', saveSaved);
    $id('savedShareBtn')?.addEventListener('click', shareCurrent);
    $id('savedImportBtn')?.addEventListener('click', importCode);
    document.addEventListener('keydown', (e) => {
        // Los edt-dlg cierran con su Escape en captura y ya no están al llegar aquí: solo los delata defaultPrevented.
        if (e.key !== 'Escape' || e.defaultPrevented || !panelStore.isOpen('saved')) return;
        cancelSaved();
    });

    panel.addEventListener('click', (e) => {
        const actBtn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
        if (!actBtn) return;
        switch (actBtn.dataset.action) {
            case 'saved-save-current':
                saveCurrent();
                break;
            case 'saved-apply':
                applyId(actBtn.dataset.id || '');
                break;
            case 'saved-copy':
                copyId(actBtn.dataset.id || '');
                break;
            case 'saved-delete':
                deleteId(actBtn.dataset.id || '');
                break;
        }
    });

    initSavedReorder({
        gridId: LIST_ID,
        onReorder: (ids) => PlannerSaved.reorder(ids),
    });
}
