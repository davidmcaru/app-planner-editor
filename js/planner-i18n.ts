import { createI18n, type I18nDict } from '@features/i18n/i18n.ts';
import { AJUSTE_IDIOMA } from '@core/ajustes/ajustes-general.ts';
import { leerAjuste } from '@core/ajustes/ajustes-sync.ts';
import esTranslations from '../i18n/es.json';
import enTranslations from '../i18n/en.json';
import deTranslations from '../i18n/de.json';

const LANG_CYCLE = ['es', 'en', 'de'];
const LANG_LABELS: Record<string, string> = { es: 'ESP', en: 'ENG', de: 'DEU' };
const LANG_KEY = 'planner-lang';
// Cómo estaba el ajuste de idioma al pulsar el botón: si ya no está así, el ajuste de idioma cambió después y vuelve a mandar él
const SITE_MARK_KEY = 'planner-lang-site';
// Se escribe UNA vez: initLang, el botón y el ajuste de idioma reescriben planner-lang, y al volver a abrir ya sería otro
const LEGACY_KEY = 'planner-lang-legacy';

// El cast es consciente: months/daysLeft/etc. son arrays y el motor tipa strings — los devuelve
// tal cual (solo interpola en strings) y getMonthNames() los recupera por acceso directo.
const TRANSLATIONS = { es: esTranslations, en: enTranslations, de: deTranslations } as unknown as Record<
    string,
    I18nDict
>;

let currentLang = 'es';
let legacyLang = 'es';
const langSubscribers: Array<(lang: string) => void> = [];

const i18n = createI18n({ dicts: TRANSLATIONS, getLang: () => currentLang, fallbackLang: 'es' });

export const t = (key: string, vars?: Record<string, string | number>): string => i18n.t(key, vars);
export const onI18nApplied = i18n.onApplied;

export function applyI18n(): void {
    i18n.apply();
}

function readKey(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function saveChoice(lang: string, siteMark: string): void {
    try {
        localStorage.setItem(LANG_KEY, lang);
        localStorage.setItem(SITE_MARK_KEY, siteMark);
    } catch {
        /* sin almacenamiento, el idioma vale para esta visita */
    }
}

// El botón pasa la marca de SU clic: tomada al acabar la traducción, un cambio del ajuste de idioma de en medio pasaría por anterior
export function setLang(lang: string, siteMark: string = leerAjuste(AJUSTE_IDIOMA)): void {
    if (!LANG_CYCLE.includes(lang)) return;
    saveChoice(lang, siteMark);
    if (lang === currentLang) return;
    currentLang = lang;
    document.documentElement.lang = lang;
    i18n.apply();
    for (const cb of langSubscribers) cb(lang);
}

export function getLang(): string {
    return currentLang;
}

export function getNextLang(): string {
    const site = leerAjuste(AJUSTE_IDIOMA);
    const cycle = [site, ...LANG_CYCLE.filter((l) => l !== site)];
    return cycle[(cycle.indexOf(currentLang) + 1) % cycle.length] as string;
}

export function getLangLabel(): string {
    return LANG_LABELS[currentLang] || currentLang.toUpperCase();
}

export function initLang(): string {
    const site = leerAjuste(AJUSTE_IDIOMA);
    const raw = readKey(LANG_KEY);
    const saved = raw && LANG_CYCLE.includes(raw) ? raw : null;
    const rawMark = readKey(SITE_MARK_KEY);
    legacyLang = freezeLegacy(rawMark === null ? (saved ?? 'es') : 'es');
    // Sin marca es un planner-lang de antes de seguir al ajuste de idioma: se marca con el de hoy y al actualizar no cambia nada
    const mark = rawMark ?? site;
    currentLang = saved && mark === site ? saved : site;
    if (saved) saveChoice(currentLang, site);
    document.documentElement.lang = currentLang;
    // Los fragmentos traen el castellano escrito: con otro idioma, el aplicador tiene que pasar ya en el arranque
    if (currentLang !== 'es') i18n.apply();
    return currentLang;
}

function freezeLegacy(guess: string): string {
    const frozen = readKey(LEGACY_KEY);
    if (frozen && LANG_CYCLE.includes(frozen)) return frozen;
    try {
        localStorage.setItem(LEGACY_KEY, guess);
    } catch {
        /* sin almacenamiento, vale para esta visita */
    }
    return guess;
}

// Los textos sin idioma son del que abría el planner antes de seguir al ajuste de idioma, congelado al primer arranque
export function getLegacyLang(): string {
    return legacyLang;
}

export function getMonthNames(): string[] {
    return TRANSLATIONS[currentLang]?.months as unknown as string[];
}

// Para las claves cuyo valor es un ARRAY (dayHeadersShort, daysLeft…): t() las devuelve bien en
// runtime pero su tipo miente — este accesor dice la verdad.
export function tArr(key: string): string[] {
    return (TRANSLATIONS[currentLang]?.[key] as unknown as string[]) ?? [];
}

export function onLangChange(callback: (lang: string) => void): void {
    langSubscribers.push(callback);
}
