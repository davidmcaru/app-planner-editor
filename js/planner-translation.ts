import { AJUSTE_TRADUCCION } from '@core/ajustes/ajustes-planner.ts';
import { escribirAjuste, leerAjuste } from '@core/ajustes/ajustes-sync.ts';
import { createTranslationConsent, enlacePolitica } from '@features/translate/mymemory.ts';
import { translateText } from '@features/translate/traducir.ts';
import { confirmDialog } from '@widgets/dialog/dialog.ts';
import { getLang, getLegacyLang, t } from './planner-i18n.ts';
import { panelStore, type PanelName } from './planner-panel-store.ts';
import { absorbHistory, commitHistory, registerTranslationHooks } from './planner-persist.ts';
import {
    getWeekConfig,
    setWeekConfig,
    getPlannerA5Config,
    setPlannerA5Config,
    getPlannerA4Config,
    setPlannerA4Config,
    getMonthlyTexts,
    setMonthlyTexts,
} from './planner-state.ts';
import type { CellLangs, CellLangStyle } from './planner-types.ts';

const STORAGE_KEY = 'planner-translation-cache';
const CACHE_FMT = 3;
const CHUNK_SIZE = 5;

// Sin `quarterly` A PROPÓSITO: mensual y trimestral son el MISMO almacén y cada texto viajaría dos veces.
type Snapshot = Record<CellLangStyle, Record<string, string>>;
type SnapStyle = CellLangStyle;
type OrigRec = { lang: string; text: string; shown: string };
type TranslationCache = {
    langs: Record<string, Snapshot>;
    src: Record<string, Snapshot>;
    textsLang: string | null;
    orig: Partial<Record<SnapStyle, Record<string, OrigRec>>>;
    fmt?: number;
};
type Progress = (p: { done: number; total: number }) => void;
type Pending = { style: SnapStyle; key: string; text: string; from: string };
// onLate: lo que falló en una decisión aplazada, cuando quien la lanzó ya recibió su resultado (0).
type SwapOpts = { onProgress?: Progress; render?: () => void; commit?: boolean; onLate?: (failed: number) => void };
type SwapResult = { failed: number; denied: boolean; deferred: boolean };
const FETCH_TIMEOUT_MS = 8000;
const STYLES: SnapStyle[] = ['weekly', 'plannerA5', 'plannerA4', 'monthly'];
// Su Guardar y su Cancelar reescriben los textos de la apertura: una traducción que llega con uno abierto espera.
const DRAFT_PANELS: PanelName[] = ['config', 'text', 'saved'];

// langs[L] guarda SOLO textos que están de verdad en L: de ahí sale el idioma real de cada celda (README).

let _cache: TranslationCache = { langs: {}, src: {}, textsLang: null, orig: {}, fmt: CACHE_FMT };
// Aparte de _applyGen, que el Cancelar de Mis planners devuelve atrás: el folio siguiente no reutiliza un número
let _genSeq = 0;
let _applyGen = 0;

function isValidCache(c: unknown): c is TranslationCache {
    const o = c as Record<string, unknown> | null;
    return !!o && typeof o === 'object' && !!o.langs && typeof o.langs === 'object';
}

const _EMPTY_SNAP = (): Snapshot => ({ weekly: {}, plannerA5: {}, plannerA4: {}, monthly: {} });

const pairKey = (e: Pending) => `${e.from}\u0000${e.text}`;

function loadCache() {
    try {
        // La dejó el contador de versión retirado y ya no la lee nadie.
        localStorage.removeItem('planner-translation-text-version');
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (isValidCache(parsed)) {
                _cache = parsed;
                if (!_cache.src || typeof _cache.src !== 'object') _cache.src = {};
                if (typeof _cache.textsLang !== 'string') _cache.textsLang = null;
                if (!_cache.orig || typeof _cache.orig !== 'object') _cache.orig = {};
                const fmt = _cache.fmt ?? 0;
                if (fmt < CACHE_FMT) {
                    if (fmt < 2) purgeOldFailures();
                    splitPlannerStyle();
                    _cache.fmt = CACHE_FMT;
                    saveCache();
                }
            }
        }
    } catch {
        /* ignore */
    }
}

// Antes de fmt 2, un fallo dejaba el texto de ORIGEN bajo langs[destino] con textsLang = destino (README punto 3).
function purgeOldFailures() {
    const tl = _cache.textsLang;
    const underTl = tl ? _cache.langs[tl] : undefined;
    if (!tl || !underTl) return;
    const srcTl = _cache.src[tl];
    for (const style of Object.keys(underTl) as SnapStyle[]) {
        for (const [key, text] of Object.entries(underTl[style] || {})) {
            if (srcTl?.[style] && key in srcTl[style]) continue;
            const elsewhere = Object.keys(_cache.langs).some(
                (l) => l !== tl && _cache.langs[l]?.[style]?.[key] === text
            );
            if (elsewhere) delete underTl[style][key];
        }
    }
}

// Hasta fmt 3 el organizador era un solo `planner` con la orientación activa: no se sabe cuál, heredan las dos.
function splitPlannerStyle() {
    for (const bucket of [_cache.langs, _cache.src]) {
        for (const snap of Object.values(bucket)) {
            const viejo = snap as Snapshot & { planner?: Record<string, string> };
            if (!viejo.planner) continue;
            viejo.plannerA5 = { ...viejo.planner, ...viejo.plannerA5 };
            viejo.plannerA4 = { ...viejo.planner, ...viejo.plannerA4 };
            delete viejo.planner;
        }
    }
}

// Folio vacío = sin idioma de textos: sin esto, lo escrito después viajaría con el idioma viejo (langpair falso).
export function forgetTextsLang() {
    _cache.textsLang = null;
    _cache.orig = {};
    saveCache();
}

export function stampTextsLang(lang: string) {
    const withTexts = hasTranslatableTexts();
    if (withTexts === (_cache.textsLang !== null)) return;
    _cache.textsLang = withTexts ? lang : null;
    if (!withTexts) _cache.orig = {};
    saveCache();
}

// Antes de la foto base del historial y con el idioma de antes: lo guardado sin textsLang se escribió en él
export function initTextsLang(legacyLang: string) {
    loadCache();
    stampTextsLang(legacyLang);
}

function saveCache() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
    } catch {
        /* ignore */
    }
}

function takeSnapshot(): Snapshot {
    const snap = _EMPTY_SNAP();

    const wc = getWeekConfig();
    if (wc.cellTexts) {
        Object.entries(wc.cellTexts).forEach(([key, val]) => {
            if (val.text) snap.weekly[key] = val.text;
        });
    }

    // Las DOS orientaciones: la que no se ve también guarda textos del usuario (todo-6 y todo-7 solo existen en A4).
    for (const [style, cfg] of [
        ['plannerA5', getPlannerA5Config()],
        ['plannerA4', getPlannerA4Config()],
    ] as const) {
        Object.entries(cfg.sectionTexts || {}).forEach(([key, val]) => {
            if (val.text) snap[style][key] = val.text;
        });
    }

    const mt = getMonthlyTexts();
    Object.entries(mt).forEach(([key, val]) => {
        if (val.text) snap.monthly[key] = val.text;
    });

    return snap;
}

function snapshotIsEmpty(snap: Snapshot) {
    return Object.values(snap).every((obj) => Object.keys(obj).length === 0);
}

// Por valor: la celda que solo cambió de clave (borrar una franja sube las de debajo) no es texto escrito.
function writtenSince(before: Snapshot, after: Snapshot): Snapshot {
    const out = _EMPTY_SNAP();
    for (const style of STYLES) {
        const antes = new Set(Object.values(before[style]));
        for (const [key, text] of Object.entries(after[style])) {
            if (!antes.has(text)) out[style][key] = text;
        }
    }
    return out;
}

function applySnapshot(snap: Snapshot) {
    if (Object.keys(snap.weekly).length) {
        const wc = getWeekConfig();
        Object.entries(snap.weekly).forEach(([key, text]) => {
            const entry = wc.cellTexts[key];
            if (entry) entry.text = text;
        });
        setWeekConfig(wc);
    }

    // Setter de CADA orientación: setPlannerConfig escribe la activa y a la otra solo le pasa lo que allí era igual.
    for (const [style, get, set] of [
        ['plannerA5', getPlannerA5Config, setPlannerA5Config],
        ['plannerA4', getPlannerA4Config, setPlannerA4Config],
    ] as const) {
        if (!Object.keys(snap[style]).length) continue;
        const cfg = get();
        Object.entries(snap[style]).forEach(([key, text]) => {
            const entry = cfg.sectionTexts[key];
            if (entry) entry.text = text;
        });
        set(cfg);
    }

    if (Object.keys(snap.monthly).length) {
        const mt = getMonthlyTexts();
        Object.entries(snap.monthly).forEach(([key, text]) => {
            const entry = mt[key];
            if (entry) entry.text = text;
        });
        setMonthlyTexts(mt);
    }
}

// Por valor dentro del estilo: un texto que cambió de clave (borrar una franja sube los de debajo) conserva su idioma.
function holdsAnywhere(lang: string, style: SnapStyle, text: string) {
    return Object.values(_cache.langs[lang]?.[style] ?? {}).includes(text);
}

// Si el texto está bajo varios idiomas gana el supuesto: preferir otro elegía el cubo envenenado de cachés viejas.
function detectLangs(snap: Snapshot, fallback: string): Snapshot {
    const out = _EMPTY_SNAP();
    const langs = Object.keys(_cache.langs);
    for (const style of Object.keys(snap) as SnapStyle[]) {
        for (const [key, text] of Object.entries(snap[style])) {
            const holds = (l: string) => _cache.langs[l]?.[style]?.[key] === text;
            const moved = (l: string) => holdsAnywhere(l, style, text);
            if (holds(fallback)) out[style][key] = fallback;
            else out[style][key] = langs.find(holds) ?? (moved(fallback) ? fallback : langs.find(moved)) ?? fallback;
        }
    }
    return out;
}

function rememberLive(snap: Snapshot, langOf: Snapshot) {
    for (const style of Object.keys(snap) as SnapStyle[]) {
        for (const [key, text] of Object.entries(snap[style])) {
            const bucket = (_cache.langs[langOf[style][key] as string] ??= _EMPTY_SNAP());
            (bucket[style] ??= {})[key] = text;
        }
    }
}

function allIn(langOf: Snapshot, lang: string) {
    return Object.values(langOf).every((texts) => Object.values(texts).every((l) => l === lang));
}

// El original vale mientras una celda enseñe su `shown`, aunque sea otra clave (borrar una franja sube las de debajo).
function refreshOrig(snap: Snapshot, langOf: Snapshot) {
    const next: TranslationCache['orig'] = {};
    for (const style of STYLES) {
        const prevStyle = _cache.orig[style] ?? {};
        const sueltos = new Map<string, OrigRec>();
        for (const [key, o] of Object.entries(prevStyle)) if (snap[style][key] !== o.shown) sueltos.set(o.shown, o);
        for (const [key, text] of Object.entries(snap[style])) {
            const prev = prevStyle[key];
            (next[style] ??= {})[key] =
                prev && prev.shown === text
                    ? prev
                    : (sueltos.get(text) ?? { lang: langOf[style][key] as string, text, shown: text });
        }
    }
    _cache.orig = next;
}

function markShown(applied: Snapshot) {
    for (const style of STYLES) {
        for (const [key, text] of Object.entries(applied[style])) {
            const o = _cache.orig[style]?.[key];
            if (o) o.shown = text;
        }
    }
}

// Las celdas viajan por GET a un tercero: nada sale sin el permiso de Ajustes › Planner.
const _consent = createTranslationConsent({
    read: () => leerAjuste(AJUSTE_TRADUCCION),
    // ⚠️ Por escribirAjuste y no a mano: el panel de Ajustes abierto seguiría marcando «Preguntar»
    write: (eleccion) => escribirAjuste(AJUSTE_TRADUCCION, eleccion),
    confirm: () =>
        confirmDialog(`${t('translateConsentMsg')} ${t('translateConsentWhere')}`, {
            okLabel: t('translateConsentYes'),
            cancelLabel: t('translateConsentNo'),
            dismissible: false,
            content: enlacePolitica(t('translateConsentPolicy')),
        }),
});

// ensure() ya respeta el «No»: la acción lo mira ANTES para avisar sin diálogo, sin red y sin caché.
export const isTranslationOff = (): boolean => leerAjuste(AJUSTE_TRADUCCION) === 'denied';
// ensure() solo mira al empezar: retirado en Ajustes con la traducción en marcha, lo que falta ya no sale
const stillGranted = (): boolean => leerAjuste(AJUSTE_TRADUCCION) === 'granted';

// Una petición por (idioma de origen, texto): el mismo texto en A5 y en A4 viaja UNA vez (README punto 6).
async function translateEntries(entries: Pending[], toLang: string, onProgress?: Progress) {
    const translated = _EMPTY_SNAP();
    const unique = [...new Map(entries.map((e) => [pairKey(e), e])).values()];
    const total = unique.length;
    if (total === 0) return translated;

    const done = new Map<string, string>();
    let count = 0;
    if (typeof onProgress === 'function') onProgress({ done: count, total });

    for (let i = 0; i < total; i += CHUNK_SIZE) {
        // Lo no enviado queda como un fallo: fuera del resultado, en su idioma y para reintentarlo
        if (!stillGranted()) break;
        const chunk = unique.slice(i, i + CHUNK_SIZE);
        const results = await Promise.all(
            // Un solo traductor, MyMemory: components/features/translate/traducir.ts
            chunk.map((e) => translateText(e.text, e.from, toLang, { timeoutMs: FETCH_TIMEOUT_MS }))
        );
        chunk.forEach((e, idx) => {
            // `null` = falló. No se escribe: fuera del resultado y de `src`, se reintenta luego.
            const res = results[idx];
            if (typeof res === 'string') done.set(pairKey(e), res);
        });
        count += chunk.length;
        if (typeof onProgress === 'function') onProgress({ done: count, total });
    }

    for (const e of entries) {
        const res = done.get(pairKey(e));
        if (res !== undefined) translated[e.style][e.key] = res;
    }
    return translated;
}

// Cada celda sale de su ORIGINAL: volver a su idioma lo restaura sin petición y no se encadenan retraducciones.
function computeDirtyAndResult(currentSnap: Snapshot, langOf: Snapshot, toLang: string) {
    const cachedTarget = _cache.langs[toLang];
    const cachedSrc = _cache.src[toLang];
    const result = _EMPTY_SNAP();
    const sources = _EMPTY_SNAP();
    const dirty: Pending[] = [];

    for (const style of STYLES) {
        for (const [key, text] of Object.entries(currentSnap[style])) {
            const from = _cache.orig[style]?.[key] ?? { lang: langOf[style][key] as string, text };
            sources[style][key] = from.text;
            const cached = cachedTarget?.[style]?.[key];
            if (from.lang === toLang) {
                result[style][key] = from.text;
            } else if (langOf[style][key] === toLang) {
                // Ya está en el destino (una rezagada de otra vuelta): enviarla sería un par X|X.
                result[style][key] = text;
            } else if (cached !== undefined && cachedSrc?.[style]?.[key] === from.text) {
                result[style][key] = cached;
            } else {
                dirty.push({ style, key, text: from.text, from: from.lang });
            }
        }
    }
    return { dirty, result, sources };
}

// La pone createExportGuard (planner-export.ts): aplicar a mitad de una captura cambiaría el folio exportado.
export const isExporting = (): boolean => document.body.classList.contains('is-exporting');
const busy = () => DRAFT_PANELS.some((p) => panelStore.isOpen(p)) || isExporting();

// En microtarea: el Guardar hace su commitHistory DESPUÉS de cerrar, y adelantarse se comería ese paso.
function whenIdle(fn: () => void) {
    let hecho = false;
    const check = () => {
        if (hecho || busy()) return;
        hecho = true;
        off();
        obs.disconnect();
        queueMicrotask(() => (busy() ? whenIdle(fn) : fn()));
    };
    const off = panelStore.onChange(check);
    // La descarga no avisa al terminar: solo se entera quien vigile la clase de <body>.
    const obs = new MutationObserver(check);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

// Por CLAVE y no por valor (writtenSince): «Hola»→«Hello» junto a una rezagada «Hello» también cambia el folio.
function anyCellChanges(before: Snapshot, after: Snapshot): boolean {
    return STYLES.some((s) => Object.entries(after[s]).some(([key, text]) => before[s][key] !== text));
}

const nada = (): SwapResult => ({ failed: 0, denied: false, deferred: false });

async function runSwap(fromLang: string, toLang: string, opts: SwapOpts): Promise<SwapResult> {
    const { onProgress, render } = opts;
    const cerrarPaso = (cambia: boolean) => (opts.commit && cambia ? commitHistory() : absorbHistory());
    const genAtStart = _applyGen;
    // El origen es el de CADA celda (detectLangs); textsLang solo cubre lo que langs no conoce (README punto 3).
    const srcLang = _cache.textsLang || fromLang;
    const currentSnap = takeSnapshot();
    const langOf = detectLangs(currentSnap, srcLang);
    refreshOrig(currentSnap, langOf);
    rememberLive(currentSnap, langOf);

    if (snapshotIsEmpty(currentSnap)) {
        // Sin textos no hay idioma de textos: lo próximo que se escriba nacerá en el idioma de la UI.
        _cache.textsLang = null;
        saveCache();
        return nada();
    }

    if (srcLang === toLang && allIn(langOf, toLang)) {
        // Todas YA están en el destino; con una sola rezagada de un fallo parcial hay que traducirla.
        _cache.textsLang = toLang;
        saveCache();
        return nada();
    }

    const { dirty, result, sources } = computeDirtyAndResult(currentSnap, langOf, toLang);

    if (dirty.length === 0) {
        _cache.langs[toLang] = result;
        _cache.src[toLang] = sources;
        applySnapshot(result);
        markShown(result);
        _cache.textsLang = toLang;
        saveCache();
        // Sin petición también cierra en el historial: deshacer debe devolver el idioma (README punto 2).
        cerrarPaso(anyCellChanges(currentSnap, result));
        return nada();
    }

    // Sin consentimiento no sale NADA y textsLang se queda en srcLang; el botón cambia la interfaz igual.
    const consented = await _consent.ensure();
    if (!consented) {
        _cache.textsLang = srcLang;
        saveCache();
        return { ...nada(), denied: true };
    }

    const translated = await translateEntries(dirty, toLang, onProgress);

    const settle = (): SwapResult => {
        // En vuelo se aplicó un payload entero (Mis planners, importar): esta traducción era de otro folio.
        if (_applyGen !== genAtStart) return nada();

        // Lo escrito con la traducción en vuelo manda: esa celda no se pisa y queda sucia en su idioma (README).
        const afterFlight = takeSnapshot();
        const escritas = writtenSince(currentSnap, afterFlight);
        const escritasLang = detectLangs(escritas, srcLang);
        const siguen = (e: Pending) =>
            Object.values(afterFlight[e.style]).includes(currentSnap[e.style][e.key] as string);
        // Cuenta TEXTOS y no celdas: el mismo texto en A5 y en A4 es uno para el usuario.
        const fallidas = new Set(
            dirty.filter((e) => translated[e.style][e.key] === undefined && siguen(e)).map(pairKey)
        ).size;

        const apply = () => {
            // Un payload aplicado con el panel abierto (Mis planners): lo suyo ya está en el idioma de la interfaz.
            if (_applyGen !== genAtStart) return;
            const now = takeSnapshot();
            const merged = _EMPTY_SNAP();
            const target = _EMPTY_SNAP();
            const srcOf = _EMPTY_SNAP();
            const shown = _EMPTY_SNAP();
            for (const style of STYLES) {
                // Por valor si cambió de clave: borrar una franja con Config abierto sube los textos de debajo.
                const salida = new Map(Object.entries(currentSnap[style]).map(([key, text]) => [text, key]));
                for (const [key, text] of Object.entries(now[style])) {
                    const de = currentSnap[style][key] === text ? key : salida.get(text);
                    if (de === undefined) continue;
                    const hecho = result[style][de] ?? translated[style][de];
                    // Lo que falló conserva su texto de ORIGEN y queda fuera de langs[toLang] y de src: se reintenta.
                    merged[style][key] = hecho ?? text;
                    // En la clave de SALIDA, que es donde está su original: refreshOrig lo lleva luego a la celda.
                    shown[style][de] = hecho ?? text;
                    if (hecho === undefined) continue;
                    target[style][key] = hecho;
                    srcOf[style][key] = sources[style][de] as string;
                }
            }
            _cache.langs[toLang] = target;
            _cache.src[toLang] = srcOf;
            rememberLive(escritas, escritasLang);
            applySnapshot(merged);
            markShown(shown);
            _cache.textsLang = toLang;
            saveCache();
            // Si todo falló no queda un paso que no deshace nada visible: se absorbe (README punto 40).
            cerrarPaso(anyCellChanges(now, merged));
        };
        // Aplicada tarde, repinta ella: el render de quien la llamó ya pasó con los textos de antes.
        if (busy()) {
            whenIdle(() => {
                apply();
                render?.();
            });
            return { ...nada(), failed: fallidas, deferred: true };
        }
        apply();
        return { ...nada(), failed: fallidas };
    };

    // Con otro folio aplicado y Mis planners aún abierto, su Cancelar puede devolver este: se decide al cerrarse.
    if (_applyGen !== genAtStart && panelStore.isOpen('saved')) {
        whenIdle(() => {
            const { failed } = settle();
            render?.();
            // Quien la lanzó ya recibió un 0: sin este aviso tardío, lo que se quedó sin traducir no se sabría
            if (failed > 0) opts.onLate?.(failed);
        });
        return { ...nada(), deferred: true };
    }
    return settle();
}

export async function swapLanguage(
    fromLang: string,
    toLang: string,
    onProgress?: Progress,
    render?: () => void,
    onLate?: (failed: number) => void
): Promise<number> {
    return (await runSwap(fromLang, toLang, { onProgress, render, onLate })).failed;
}

export function translateTextsTo(
    lang: string,
    onProgress?: Progress,
    render?: () => void,
    onLate?: (failed: number) => void
): Promise<SwapResult> {
    return runSwap(lang, lang, { onProgress, render, commit: true, onLate });
}

// Excepciones a textsLang por celda: viajan en el payload para que otro equipo no las dé por textsLang.
function getCellLangs(): CellLangs {
    const tl = _cache.textsLang;
    const out: CellLangs = {};
    if (!tl) return out;
    const langOf = detectLangs(takeSnapshot(), tl);
    for (const style of STYLES) {
        for (const [key, lang] of Object.entries(langOf[style])) {
            if (lang !== tl) (out[style] ??= {})[key] = lang;
        }
    }
    return out;
}

function applyTextsLang(v: string | null, cellLangs: CellLangs) {
    _applyGen = ++_genSeq;
    // Sin tl y con textos es un guardado o un código de antes del sello: su idioma es el de entonces, no el del ajuste de idioma
    const tl = v ?? (hasTranslatableTexts() ? getLegacyLang() : null);
    _cache.textsLang = tl;
    if (tl) {
        const snap = takeSnapshot();
        for (const style of STYLES) {
            for (const [key, lang] of Object.entries(cellLangs[style] ?? {})) {
                const text = snap[style][key];
                if (!text || lang === tl) continue;
                const bucket = (_cache.langs[lang] ??= _EMPTY_SNAP());
                (bucket[style] ??= {})[key] = text;
                // detectLangs prefiere textsLang: con el texto también bajo él, la excepción no se vería.
                if (_cache.langs[tl]?.[style]?.[key] === text) delete _cache.langs[tl]![style][key];
            }
        }
    }
    saveCache();
}

export function hasTranslatableTexts() {
    return !snapshotIsEmpty(takeSnapshot());
}

// Por celda (detectLangs) y no por textsLang: tras un fallo parcial la rezagada sigue pidiendo la acción.
export function hasTextsNotIn(lang: string): boolean {
    const snap = takeSnapshot();
    return !snapshotIsEmpty(snap) && !allIn(detectLangs(snap, _cache.textsLang || lang), lang);
}

export function initTranslation() {
    loadCache();
}

registerTranslationHooks({
    getTextsLang: () => _cache.textsLang,
    getCellLangs,
    setTextsLang: applyTextsLang,
    stampTextsLang: () => stampTextsLang(getLang()),
    getApplyGen: () => _applyGen,
    restoreApplyGen: (gen) => {
        _applyGen = gen;
    },
});
