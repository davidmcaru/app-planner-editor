import type { ThemePreference } from '../types.ts';
import type { CampoAjuste, SeccionAjustes } from './ajustes-contrato.ts';

export const IDIOMAS = ['es', 'en'] as const;
export type Lang = (typeof IDIOMAS)[number];

export const AJUSTE_TEMA: CampoAjuste<ThemePreference> = {
    id: 'tema',
    clave: 'theme-preference',
    texto: 'ajustes.general.tema',
    ayuda: 'ajustes.general.temaAyuda',
    defecto: 'auto',
    opciones: [
        { valor: 'light', texto: 'ajustes.general.claro', icono: 'fa-regular fa-lightbulb' },
        { valor: 'dark', texto: 'ajustes.general.oscuro', icono: 'fa-regular fa-moon' },
        { valor: 'auto', texto: 'ajustes.general.sistema', icono: 'fa-solid fa-desktop' },
    ],
};

// ⚠️ Las dos claves están también en PRESERVE_KEYS (cache-config.ts): un reset de DATA_VERSION no se lleva el idioma
export const AJUSTE_IDIOMA: CampoAjuste<Lang> = {
    id: 'idioma',
    clave: 'lang-preference',
    claveVieja: 'stock-lang-v1',
    texto: 'ajustes.general.idioma',
    ayuda: 'ajustes.general.idiomaNota',
    defecto: 'es',
    opciones: [
        { valor: 'es', texto: 'ajustes.general.espanol', glifo: 'ES' },
        { valor: 'en', texto: 'ajustes.general.ingles', glifo: 'EN' },
    ],
};

export const AJUSTES_GENERAL: SeccionAjustes = {
    id: 'general',
    icono: 'fa-sliders',
    texto: 'ajustes.general.titulo',
    subtitulo: 'ajustes.general.subtitulo',
    lema: 'ajustes.general.lema',
    rutas: [],
    campos: [AJUSTE_TEMA, AJUSTE_IDIOMA],
};
