import type { CampoAjuste, DatosApp, SeccionAjustes } from './ajustes-contrato.ts';

// ⚠️ 'granted' y 'denied' son los valores que ya había guardados: renombrarlos devuelve a todos a «Preguntar»
const PERMISOS = ['ask', 'granted', 'denied'] as const;
type Permiso = (typeof PERMISOS)[number];

const GLIFO_PERMISO: Record<Permiso, string> = {
    ask: 'fa-solid fa-circle-question',
    granted: 'fa-solid fa-check',
    denied: 'fa-solid fa-ban',
};

export const AJUSTE_TRADUCCION: CampoAjuste<Permiso> = {
    id: 'traduccion',
    clave: 'planner-translation-consent',
    texto: 'ajustes.planner.traduccion',
    corto: 'ajustes.planner.traduccionCorto',
    icono: 'fa-solid fa-language',
    ayuda: 'ajustes.planner.traduccionAyuda',
    resumen: 'ajustes.planner.traduccionResumen',
    defecto: 'ask',
    opciones: PERMISOS.map((valor) => ({
        valor,
        texto: `ajustes.planner.traduccion.${valor}`,
        glifo: GLIFO_PERMISO[valor],
        ayuda: `ajustes.planner.traduccion.${valor}Ayuda`,
    })),
};

// ⚠️ Claves exactas: el prefijo `planner-` se llevaría también el permiso, que es de Ajustes y no un dato
const DATOS_PLANNER: DatosApp = {
    ayuda: 'ajustes.datos.planner.ayuda',
    grupos: [
        { texto: 'ajustes.datos.planner.guardados', claves: ['planner-saved-v1'] },
        {
            texto: 'ajustes.datos.planner.abierto',
            claves: [
                'planner-cell-texts',
                'planner-week-config',
                'planner-a5-config',
                'planner-a4-config',
                'planner-quarter-config',
                'planner-monthly-cal-config',
                'planner-holidays-config',
                // Guarda también el texto original de cada celda traducida: es trabajo del usuario, no una caché
                'planner-translation-cache',
                'planner-translation-text-version',
                'planner-monthly-config',
                'planner-monthly-texts',
                'planner-quarterly-texts',
            ],
            prefijos: ['planner-vacation-'],
        },
        {
            texto: 'ajustes.datos.planner.vista',
            claves: [
                'planner-design-config',
                'planner-text-config',
                'planner-orientation',
                'planner-style',
                'planner-lang',
                'planner-lang-site',
                'planner-lang-legacy',
            ],
        },
    ],
};

export const AJUSTES_PLANNER: SeccionAjustes = {
    id: 'planner',
    icono: 'fa-calendar-days',
    texto: 'ajustes.planner.titulo',
    subtitulo: 'ajustes.planner.subtitulo',
    lema: 'ajustes.planner.lema',
    rutas: ['/'],
    campos: [AJUSTE_TRADUCCION],
    datos: DATOS_PLANNER,
};
