import { AJUSTE_IDIOMA } from '@core/ajustes/ajustes-general.ts';
import { AJUSTE_TRADUCCION } from '@core/ajustes/ajustes-planner.ts';
import { leerAjuste, observarAjuste } from '@core/ajustes/ajustes-sync.ts';
import { setLang, getLang, getNextLang, getLangLabel, onLangChange, t } from './planner-i18n.ts';
import { panelStore } from './planner-panel-store.ts';
import {
    swapLanguage,
    translateTextsTo,
    hasTextsNotIn,
    isTranslationOff,
    isExporting,
    hasTranslatableTexts,
    initTranslation,
    forgetTextsLang,
} from './planner-translation.ts';
import { showToast } from './planner-toasts.ts';

let _translating = false;
const LANG_RETRY_MS = 300;

export function isTranslating() {
    return _translating;
}

// Aplicado a mitad de una captura repintaría el folio exportado, y con Textos abierto le quitaría la edición de
// celdas. Por temporizador, como planner-site-lang.ts: Guardar cierra Textos ANTES de su commitHistory.
function whenLangFree(fn: () => void): void {
    if (isExporting() || panelStore.isOpen('text')) setTimeout(() => whenLangFree(fn), LANG_RETRY_MS);
    else fn();
}

// Con «No, nunca» elegido a mitad no habrá reintento: el aviso de parcial mentiría.
function avisarCaidas(caidas: number, parcial: 'translatePartial' | 'translateMinePartial'): void {
    if (caidas === 0) return;
    if (isTranslationOff()) showToast(t('translateMineOffToast'), 'info', 6000);
    else showToast(t(parcial, { count: caidas }), 'warning', 6000);
}

function setTranslating(v: boolean) {
    _translating = v;
    syncTranslateMine();
}

export function syncTranslateMine(): void {
    const btn = document.getElementById('translateMineBtn') as HTMLButtonElement | null;
    const row = document.getElementById('masTraducirRow') as HTMLButtonElement | null;
    if (!btn || !row) return;
    btn.disabled = _translating;
    row.disabled = _translating;
    if (_translating) return;
    const needs = hasTextsNotIn(getLang());
    const off = isTranslationOff();
    btn.hidden = !needs;
    row.hidden = !needs;
    // La CLAVE y no solo el texto: el siguiente applyI18n devolvería el tooltip de siempre.
    const key = off ? 'translateMineOffToast' : 'translateMineTooltip';
    btn.setAttribute('data-i18n-title', key);
    btn.setAttribute('data-i18n-aria', key);
    btn.title = t(key);
    btn.setAttribute('aria-label', t(key));
    const offTag = document.getElementById('masTraducirOff');
    if (offTag) offTag.hidden = !off;
}

export function initLangToggle(deps: { render: () => void }) {
    const langToggle = document.getElementById('langToggle');
    const langLabel = document.getElementById('langLabel');
    if (!langToggle || !langLabel) return;

    initTranslation();

    const updateLabel = () => {
        langLabel.textContent = getLangLabel();
        langLabel.classList.remove('lang-badge--es', 'lang-badge--en', 'lang-badge--de');
        langLabel.classList.add(`lang-badge--${getLang()}`);
    };
    updateLabel();

    langToggle.addEventListener('click', async () => {
        if (_translating) return; // prevent double-click during translation (y el undo se guarda con isTranslating)

        const fromLang = getLang();
        const toLang = getNextLang();
        const siteMark = leerAjuste(AJUSTE_IDIOMA);
        const hasTexts = hasTranslatableTexts();

        if (!hasTexts) {
            forgetTextsLang();
            setLang(toLang, siteMark);
            return;
        }

        const icon = langToggle.querySelector('i');
        const origClass = icon ? icon.className : '';

        setTranslating(true);

        let fallidas = 0;
        try {
            // El spinner arranca en el PRIMER progreso: antes puede estar abierto el diálogo de
            // consentimiento, y «Traduciendo…» ahí sería mentira.
            const onProgress = ({ done, total }: { done: number; total: number }) => {
                if (icon) icon.className = 'fas fa-spinner fa-spin';
                langLabel.textContent = `${t('translating')} ${done}/${total}`;
            };
            const tarde = (n: number) => avisarCaidas(n, 'translatePartial');
            fallidas = await swapLanguage(fromLang, toLang, onProgress, deps.render, tarde);
        } catch {
            // Si la traducción falla, la interfaz cambia igual y los textos se quedan como estaban
        }

        // Sigue «traduciendo» hasta que el idioma entra: así un cambio del ajuste de idioma que llegue mientras espera va detrás, y gana
        whenLangFree(() => {
            setLang(toLang, siteMark);
            // Después de setLang: el aviso sale ya en el idioma nuevo, que es el de la interfaz.
            avisarCaidas(fallidas, 'translatePartial');
            setTranslating(false);
            if (icon) icon.className = origClass;
            updateLabel();
        });
    });

    document.getElementById('translateMineBtn')?.addEventListener('click', async () => {
        if (_translating || panelStore.anyOpen() || isExporting()) return;
        if (isTranslationOff()) {
            showToast(t('translateMineOffToast'), 'info', 6000);
            return;
        }
        const lang = getLang();
        if (!hasTextsNotIn(lang)) {
            syncTranslateMine();
            return;
        }
        const icon = langToggle.querySelector('i');
        const origClass = icon ? icon.className : '';
        let deferred = false;
        setTranslating(true);
        try {
            const res = await translateTextsTo(
                lang,
                ({ done, total }) => {
                    if (icon) icon.className = 'fas fa-spinner fa-spin';
                    langLabel.textContent = `${t('translating')} ${done}/${total}`;
                },
                deps.render,
                (n) => avisarCaidas(n, 'translateMinePartial')
            );
            deferred = res.deferred;
            if (res.denied) showToast(t('translateMineOffToast'), 'info', 6000);
            else avisarCaidas(res.failed, 'translateMinePartial');
        } catch {}
        setTranslating(false);
        if (icon) icon.className = origClass;
        updateLabel();
        // Aplazada, repinta ella al aplicarse: ahora caería a mitad de una descarga o le quitaría la edición a Textos
        if (!deferred) deps.render();
    });

    onLangChange(() => {
        updateLabel();
        deps.render();
        syncTranslateMine();
    });
    observarAjuste(AJUSTE_TRADUCCION, () => syncTranslateMine());
}
