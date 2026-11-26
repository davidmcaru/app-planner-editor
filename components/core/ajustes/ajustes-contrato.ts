// Claves del i18n del header: texto, ayuda, etiqueta y el corto del campo; el glifo y el icono de una opción, literales
export interface OpcionAjuste<T extends string = string> {
    readonly valor: T;
    readonly texto: string;
    readonly icono?: string;
    readonly glifo?: string;
    readonly ayuda?: string;
}

export interface CampoAjuste<T extends string = string> {
    readonly id: string;
    readonly clave: string;
    readonly claveVieja?: string;
    readonly texto: string;
    readonly corto?: string;
    readonly icono?: string;
    readonly ayuda?: string;
    // La ayuda corta de la baldosa del modal; con ella, la larga (`ayuda`) va en su ⓘ
    readonly resumen?: string;
    readonly etiqueta?: string;
    readonly opciones: readonly OpcionAjuste<T>[];
    readonly defecto: T;
    readonly rejilla?: boolean;
}

// Una parte de lo que la app guarda en este navegador: sus claves exactas o sus prefijos (las que se construyen).
// `conCifras` da, si puede, otro texto con cifras sacadas de lo guardado
export interface GrupoDatos {
    readonly texto: string;
    readonly claves?: readonly string[];
    readonly prefijos?: readonly string[];
    readonly conCifras?: () => { texto: string; vars: Record<string, string> } | null;
}

// La pieza de acción: qué guarda la app, cuánto ocupa y un botón para borrarlo, con su confirmación
export interface DatosApp {
    readonly ayuda: string;
    readonly grupos: readonly GrupoDatos[];
}

export interface SeccionAjustes {
    readonly id: string;
    readonly icono: string;
    readonly texto: string;
    readonly subtitulo: string;
    readonly lema: string;
    readonly rutas: readonly string[];
    readonly campos: readonly CampoAjuste[];
    readonly datos?: DatosApp;
}

export interface AppProxima {
    readonly id: string;
    readonly icono: string;
    readonly texto: string;
    readonly rutas: readonly string[];
}
