import { t, getLang } from './planner-i18n.ts';

export type HolidayType = 'national' | 'ccaa' | 'capital';

export interface HolidayInfo {
    id: string;
    name: string;
    type: HolidayType;
    ccaaCode?: string;
    provinceCode?: string;
    // Los demás que caen ese día, en el orden en que entraron: solo los lleva el primero, que es el de la clave.
    others?: HolidayInfo[];
}

type Entry = [number, number, string];

interface YearTable {
    national: Entry[];
    ccaa: Record<string, Entry[]>;
    capital: Record<string, Entry[]>;
}

// Sin `holiday.<id>` en i18n sale este nombre; topónimos y nombres catalanes no se traducen (README js §Festivos).
const HOLIDAY_NAMES: Record<string, string> = {
    'ano-nuevo': 'Año Nuevo',
    reyes: 'Reyes',
    'viernes-santo': 'Viernes Santo',
    'dia-del-trabajo': 'Día del Trabajo',
    asuncion: 'Asunción',
    'fiesta-nacional': 'Fiesta Nacional',
    'todos-los-santos': 'Todos los Santos',
    constitucion: 'Constitución',
    inmaculada: 'Inmaculada',
    navidad: 'Navidad',
    'jueves-santo': 'Jueves Santo',
    'lunes-de-pascua': 'Lunes de Pascua',
    'corpus-christi': 'Corpus Christi',
    'todos-los-santos-trasladado': 'Todos los Santos (trasladado)',
    'constitucion-trasladado': 'Constitución (trasladado)',
    'dia-de-baleares-trasladado': 'Día de Baleares (trasladado)',
    'dia-de-andalucia': 'Día de Andalucía',
    'san-jorge': 'San Jorge',
    'dia-de-asturias': 'Día de Asturias',
    'dia-de-baleares': 'Día de Baleares',
    'dia-de-canarias': 'Día de Canarias',
    'dia-de-cantabria': 'Día Cantabria',
    'dia-de-cyl': 'Día de CyL',
    'sant-joan': 'Sant Joan',
    'dia-de-extremadura': 'Día Extremadura',
    'santiago-apostol': 'Santiago Apóstol',
    'dos-de-mayo': 'Dos de Mayo',
    'dia-de-murcia': 'Día de Murcia',
    'dia-de-la-rioja': 'Día de La Rioja',
    'dia-de-la-c-valenciana': 'Día C. Valenciana',
    'dia-de-ceuta': 'Día de Ceuta',
    'dia-de-melilla': 'Día de Melilla',
    'san-jose': 'San José',
    diada: 'Diada',
    'sant-esteve': 'Sant Esteve',
    'la-bien-aparecida': 'La Bien Aparecida',
    'virgen-de-africa': 'Virgen de África',
    'fin-del-ramadan': 'Fin del Ramadán',
    'fiesta-del-sacrificio': 'Fiesta del Sacrificio',
    'virgen-del-mar': 'Virgen del Mar',
    'virgen-del-rosario': 'Virgen del Rosario',
    'san-rafael': 'San Rafael',
    'toma-de-granada': 'Toma de Granada',
    'la-cinta': 'La Cinta',
    'virgen-de-la-capilla': 'Virgen de la Capilla',
    // El boletín dice «Incorporación de Málaga a la Corona de Castilla»: no cabe en la celda del mensual a 5,5 pt
    'incorporacion-de-malaga': 'Incorporación a Castilla',
    'feria-de-abril': 'Feria de Abril',
    'san-lorenzo': 'San Lorenzo',
    'la-vaquilla': 'La Vaquilla',
    'san-valero': 'San Valero',
    'santa-teresa': 'Santa Teresa',
    'san-pedro': 'San Pedro',
    'san-juan': 'San Juan',
    'san-juan-de-sahagun': 'San Juan de Sahagún',
    'virgen-de-san-lorenzo': 'Virgen de San Lorenzo',
    'la-merce': 'La Mercè',
    'san-narciso': 'San Narciso',
    'santa-tecla': 'Santa Tecla',
    'sant-anastasi': 'Sant Anastasi',
    hogueras: 'Hogueras',
    magdalena: 'Magdalena',
    'san-vicente': 'San Vicente Mártir',
    'san-benito': 'San Benito',
    'san-prudencio': 'San Prudencio',
    almudena: 'Almudena',
    'san-ignacio': 'San Ignacio',
    'romeria-de-la-fuensanta': 'Romería de la Fuensanta',
    'lunes-de-carnaval': 'Lunes de Carnaval',
    'virgen-de-la-fuensanta': 'Virgen de la Fuensanta',
    colombinas: 'Fiestas Colombinas',
    'santa-catalina': 'Santa Catalina',
    'virgen-de-la-victoria': 'Virgen de la Victoria',
    'sermon-de-las-tortillas': 'Sermón de las Tortillas',
    cincomarzada: 'Cincomarzada',
    'san-segundo': 'San Segundo',
    curpillos: 'Curpillos',
    'san-froilan': 'San Froilán',
    'virgen-de-la-vega': 'Virgen de la Vega',
    'san-pedro-regalado': 'San Pedro Regalado',
    'segona-pasqua': 'Segona Pasqua',
    'sant-magi': 'Sant Magí',
    'sant-miquel': 'Sant Miquel',
    'santa-faz': 'Santa Faz',
    'san-vicente-ferrer': 'San Vicente Ferrer',
    'martes-de-carnaval': 'Martes de Carnaval',
    'miercoles-de-ceniza': 'Miércoles de Ceniza',
    'san-isidro': 'San Isidro',
    'bando-de-la-huerta': 'Bando de la Huerta',
    'semana-grande': 'Semana Grande',
    'san-sebastian': 'San Sebastián',
    'virgen-blanca': 'Virgen Blanca',
};

// Nombre canónico de cada CCAA; su traducción (los 19 tienen exónimo) va en `ccaa.<código>`.
const CCAA_META: Record<string, string> = {
    AND: 'Andalucía',
    ARA: 'Aragón',
    AST: 'Asturias',
    BAL: 'Islas Baleares',
    CAN: 'Canarias',
    CNT: 'Cantabria',
    CLM: 'Castilla-La Mancha',
    CYL: 'Castilla y León',
    CAT: 'Cataluña',
    EXT: 'Extremadura',
    GAL: 'Galicia',
    MAD: 'Madrid',
    MUR: 'Murcia',
    NAV: 'Navarra',
    PVA: 'País Vasco',
    RIO: 'La Rioja',
    VAL: 'C. Valenciana',
    CEU: 'Ceuta',
    MEL: 'Melilla',
};

// Topónimos: NO se traducen nunca (Girona es Girona en alemán).
// La clave viaja en los guardados y en los códigos PLN1: se renombra la etiqueta, nunca la clave (PVA-BI es Bilbao).
const CAPITAL_META: Record<string, string> = {
    'AND-AL': 'Almería',
    'AND-CA': 'Cádiz',
    'AND-CO': 'Córdoba',
    'AND-GR': 'Granada',
    'AND-HU': 'Huelva',
    'AND-JA': 'Jaén',
    'AND-MA': 'Málaga',
    'AND-SE': 'Sevilla',
    'ARA-HU': 'Huesca',
    'ARA-TE': 'Teruel',
    'ARA-ZA': 'Zaragoza',
    'CYL-AV': 'Ávila',
    'CYL-BU': 'Burgos',
    'CYL-LE': 'León',
    'CYL-SA': 'Salamanca',
    'CYL-VA': 'Valladolid',
    'CAT-BA': 'Barcelona',
    'CAT-GI': 'Girona',
    'CAT-TA': 'Tarragona',
    'CAT-LL': 'Lleida',
    'VAL-AL': 'Alicante',
    'VAL-CS': 'Castellón',
    'VAL-VA': 'Valencia',
    'GAL-CO': 'A Coruña',
    'GAL-PO': 'Pontevedra',
    'MAD-MA': 'Madrid capital',
    'PVA-BI': 'Bilbao',
    // Con «San Sebastián» el 20-ene salía «San Sebastián: San Sebastián»
    'PVA-SS': 'Donostia',
    'PVA-VI': 'Vitoria-Gasteiz',
    'MUR-MU': 'Murcia capital',
    'MEL-ME': 'Melilla',
};

// Solo para el buscador del desplegable de Config: la etiqueta sigue siendo la de arriba. Las tildes, las
// mayúsculas y el guion ya los iguala el widget, así que «Castelló», «València» o «Vitoria Gasteiz» no hacen falta.
const CAPITAL_ALIAS: Record<string, readonly string[]> = {
    'PVA-SS': ['San Sebastián', 'Donostia-San Sebastián'],
    'GAL-CO': ['La Coruña'],
    'VAL-AL': ['Alacant'],
    'VAL-CS': ['Castelló de la Plana', 'Castellón de la Plana'],
    'CAT-GI': ['Gerona'],
    'CAT-LL': ['Lérida'],
};

// ⚠️ VENTANA DE AÑOS EXPLÍCITOS: solo hay festivos para los años de
// esta tabla; el resto devuelve Map VACÍO a propósito — antes el Computus respondía a cualquier
// año con fechas plausibles y FALSAS. Para añadir un año: tools/generate-holidays-year.js
// emite el esqueleto y se corrige contra el BOE (README, «Festivos»).
// Un festivo trasladado (domingo → lunes) es sencillamente una fecha más en su año.
const HOLIDAYS_BY_YEAR: Record<number, YearTable> = {
    2026: {
        national: [
            [0, 1, 'ano-nuevo'],
            [0, 6, 'reyes'],
            [3, 3, 'viernes-santo'],
            [4, 1, 'dia-del-trabajo'],
            [7, 15, 'asuncion'],
            [9, 12, 'fiesta-nacional'],
            [10, 1, 'todos-los-santos'],
            [11, 6, 'constitucion'],
            [11, 8, 'inmaculada'],
            [11, 25, 'navidad'],
        ],
        ccaa: {
            AND: [
                [1, 28, 'dia-de-andalucia'],
                [3, 2, 'jueves-santo'],
                [10, 2, 'todos-los-santos-trasladado'],
                [11, 7, 'constitucion-trasladado'],
            ],
            ARA: [
                [3, 2, 'jueves-santo'],
                [3, 23, 'san-jorge'],
                [10, 2, 'todos-los-santos-trasladado'],
                [11, 7, 'constitucion-trasladado'],
            ],
            AST: [
                [3, 2, 'jueves-santo'],
                [8, 8, 'dia-de-asturias'],
                [10, 2, 'todos-los-santos-trasladado'],
                [11, 7, 'constitucion-trasladado'],
            ],
            BAL: [
                [2, 1, 'dia-de-baleares'],
                [2, 2, 'dia-de-baleares-trasladado'],
                [3, 2, 'jueves-santo'],
                [3, 6, 'lunes-de-pascua'],
                [11, 26, 'sant-esteve'],
            ],
            CAN: [
                [3, 2, 'jueves-santo'],
                [4, 30, 'dia-de-canarias'],
                [10, 2, 'todos-los-santos-trasladado'],
            ],
            CNT: [
                [3, 2, 'jueves-santo'],
                [6, 28, 'dia-de-cantabria'],
                [8, 15, 'la-bien-aparecida'],
                [11, 7, 'constitucion-trasladado'],
            ],
            CLM: [
                [3, 2, 'jueves-santo'],
                [3, 6, 'lunes-de-pascua'],
                [5, 4, 'corpus-christi'],
                [10, 2, 'todos-los-santos-trasladado'],
            ],
            CYL: [
                [3, 2, 'jueves-santo'],
                [3, 23, 'dia-de-cyl'],
                [10, 2, 'todos-los-santos-trasladado'],
                [11, 7, 'constitucion-trasladado'],
            ],
            CAT: [
                [3, 6, 'lunes-de-pascua'],
                [5, 24, 'sant-joan'],
                [8, 11, 'diada'],
                [11, 26, 'sant-esteve'],
            ],
            EXT: [
                [3, 2, 'jueves-santo'],
                [8, 8, 'dia-de-extremadura'],
                [10, 2, 'todos-los-santos-trasladado'],
                [11, 7, 'constitucion-trasladado'],
            ],
            GAL: [
                [2, 19, 'san-jose'],
                [3, 2, 'jueves-santo'],
                [5, 24, 'san-juan'],
                [6, 25, 'santiago-apostol'],
            ],
            MAD: [
                [3, 2, 'jueves-santo'],
                [4, 2, 'dos-de-mayo'],
                [10, 2, 'todos-los-santos-trasladado'],
                [11, 7, 'constitucion-trasladado'],
            ],
            MUR: [
                [2, 19, 'san-jose'],
                [3, 2, 'jueves-santo'],
                [5, 9, 'dia-de-murcia'],
                [11, 7, 'constitucion-trasladado'],
            ],
            NAV: [
                [2, 19, 'san-jose'],
                [3, 2, 'jueves-santo'],
                [3, 6, 'lunes-de-pascua'],
                [10, 2, 'todos-los-santos-trasladado'],
            ],
            PVA: [
                [2, 19, 'san-jose'],
                [3, 2, 'jueves-santo'],
                [3, 6, 'lunes-de-pascua'],
                [6, 25, 'santiago-apostol'],
            ],
            RIO: [
                [3, 2, 'jueves-santo'],
                [3, 6, 'lunes-de-pascua'],
                [5, 9, 'dia-de-la-rioja'],
                [11, 7, 'constitucion-trasladado'],
            ],
            VAL: [
                [2, 19, 'san-jose'],
                [3, 6, 'lunes-de-pascua'],
                [5, 24, 'sant-joan'],
                [9, 9, 'dia-de-la-c-valenciana'],
            ],
            CEU: [
                [3, 2, 'jueves-santo'],
                [4, 27, 'fiesta-del-sacrificio'],
                [7, 5, 'virgen-de-africa'],
                [8, 2, 'dia-de-ceuta'],
            ],
            MEL: [
                [2, 20, 'fin-del-ramadan'],
                [3, 2, 'jueves-santo'],
                [4, 27, 'fiesta-del-sacrificio'],
                [11, 7, 'constitucion-trasladado'],
            ],
        },
        capital: {
            'AND-AL': [
                [5, 24, 'san-juan'],
                [7, 29, 'virgen-del-mar'],
            ],
            'AND-CA': [
                [1, 16, 'lunes-de-carnaval'],
                [9, 7, 'virgen-del-rosario'],
            ],
            'AND-CO': [
                [8, 8, 'virgen-de-la-fuensanta'],
                [9, 24, 'san-rafael'],
            ],
            'AND-GR': [
                [0, 2, 'toma-de-granada'],
                [5, 4, 'corpus-christi'],
            ],
            'AND-HU': [
                [7, 3, 'colombinas'],
                [8, 8, 'la-cinta'],
            ],
            'AND-JA': [
                [5, 11, 'virgen-de-la-capilla'],
                [10, 25, 'santa-catalina'],
            ],
            'AND-MA': [
                [7, 19, 'incorporacion-de-malaga'],
                [8, 8, 'virgen-de-la-victoria'],
            ],
            'AND-SE': [
                [3, 22, 'feria-de-abril'],
                [5, 4, 'corpus-christi'],
            ],
            'ARA-HU': [
                [0, 22, 'san-vicente'],
                [7, 10, 'san-lorenzo'],
            ],
            'ARA-TE': [
                [3, 7, 'sermon-de-las-tortillas'],
                [6, 13, 'la-vaquilla'],
            ],
            'ARA-ZA': [
                [0, 29, 'san-valero'],
                [2, 5, 'cincomarzada'],
            ],
            'CYL-AV': [
                [4, 2, 'san-segundo'],
                [9, 15, 'santa-teresa'],
            ],
            'CYL-BU': [
                [5, 12, 'curpillos'],
                [5, 29, 'san-pedro'],
            ],
            'CYL-LE': [
                [5, 24, 'san-juan'],
                [9, 5, 'san-froilan'],
            ],
            'CYL-SA': [
                [5, 12, 'san-juan-de-sahagun'],
                [8, 8, 'virgen-de-la-vega'],
            ],
            'CYL-VA': [
                [4, 13, 'san-pedro-regalado'],
                [8, 8, 'virgen-de-san-lorenzo'],
            ],
            'CAT-BA': [
                [4, 25, 'segona-pasqua'],
                [8, 24, 'la-merce'],
            ],
            'CAT-GI': [
                [6, 25, 'santiago-apostol'],
                [9, 29, 'san-narciso'],
            ],
            'CAT-TA': [
                [7, 19, 'sant-magi'],
                [8, 23, 'santa-tecla'],
            ],
            'CAT-LL': [
                [4, 11, 'sant-anastasi'],
                [8, 29, 'sant-miquel'],
            ],
            'VAL-AL': [
                [3, 16, 'santa-faz'],
                [5, 23, 'hogueras'],
            ],
            'VAL-CS': [
                [2, 9, 'magdalena'],
                [5, 29, 'san-pedro'],
            ],
            'VAL-VA': [
                [0, 22, 'san-vicente'],
                [3, 13, 'san-vicente-ferrer'],
            ],
            'GAL-CO': [
                [1, 17, 'martes-de-carnaval'],
                [9, 7, 'virgen-del-rosario'],
            ],
            'GAL-PO': [
                [1, 18, 'miercoles-de-ceniza'],
                [6, 11, 'san-benito'],
            ],
            'MAD-MA': [
                [4, 15, 'san-isidro'],
                [10, 9, 'almudena'],
            ],
            'PVA-BI': [
                [6, 31, 'san-ignacio'],
                [7, 28, 'semana-grande'],
            ],
            'PVA-SS': [
                [0, 20, 'san-sebastian'],
                [6, 31, 'san-ignacio'],
            ],
            'PVA-VI': [
                [3, 28, 'san-prudencio'],
                [7, 5, 'virgen-blanca'],
            ],
            'MUR-MU': [
                [3, 7, 'bando-de-la-huerta'],
                [8, 15, 'romeria-de-la-fuensanta'],
            ],
            'MEL-ME': [
                [8, 8, 'virgen-de-la-victoria'],
                [8, 17, 'dia-de-melilla'],
            ],
        },
    },
};

function holidayLabel(id: string): string {
    const key = 'holiday.' + id;
    const v = t(key);
    return v === key ? HOLIDAY_NAMES[id] || id : v;
}

function ccaaLabel(code: string): string {
    const key = 'ccaa.' + code;
    const v = t(key);
    return v === key ? CCAA_META[code] || code : v;
}

export function hasHolidayData(year: number): boolean {
    return Boolean(HOLIDAYS_BY_YEAR[year]);
}

export interface GetHolidaysOptions {
    national?: boolean;
    ccaa?: string | null;
    province?: string | null;
}

export function getHolidays(
    year: number,
    { national = true, ccaa = null, province = null }: GetHolidaysOptions = {}
): Map<string, HolidayInfo> {
    const map = new Map<string, HolidayInfo>();
    const table = HOLIDAYS_BY_YEAR[year];
    if (!table) return map;

    // El primero de cada día da la clave y el nombre de la celda; los que llegan después van en su `others`.
    const add = (entries: Entry[] | undefined, info: Omit<HolidayInfo, 'id' | 'name'>): void => {
        for (const [m, d, id] of entries || []) {
            const key = `${m}-${d}`;
            const entry: HolidayInfo = { id, name: holidayLabel(id), ...info };
            const first = map.get(key);
            if (first) (first.others ??= []).push(entry);
            else map.set(key, entry);
        }
    };

    if (national) add(table.national, { type: 'national' });

    // Object.hasOwn: una clave «__proto__» o «constructor» casaría con lo heredado, que no es iterable
    const oneCapital =
        province && province !== '__ALL__' && Object.hasOwn(table.capital, province)
            ? table.capital[province]
            : undefined;
    // Con «Todas» las CCAA la capital elegida va antes: si no, la fiesta de otra comunidad le tapa la suya.
    const capitalFirst = ccaa === '__ALL__' && !!oneCapital;
    if (capitalFirst) add(oneCapital, { type: 'capital', provinceCode: province! });

    if (ccaa === '__ALL__') {
        for (const code of Object.keys(table.ccaa)) add(table.ccaa[code], { type: 'ccaa', ccaaCode: code });
    } else if (ccaa && Object.hasOwn(table.ccaa, ccaa)) {
        add(table.ccaa[ccaa], { type: 'ccaa', ccaaCode: ccaa });
    }

    if (province === '__ALL__') {
        const prefix = ccaa && ccaa !== '__ALL__' ? ccaa + '-' : null;
        for (const code of Object.keys(table.capital)) {
            if (prefix && !code.startsWith(prefix)) continue;
            add(table.capital[code], { type: 'capital', provinceCode: code });
        }
    } else if (oneCapital && !capitalFirst) {
        // Ya entró delante: otra vez la contaría entre los «+N» de su propio día
        add(oneCapital, { type: 'capital', provinceCode: province! });
    }

    return map;
}

// «Territorio: nombre», como lo pintan la mensual y la trimestral; el cuadernillo del organizador va sin territorio.
export function holidayFullName(h: HolidayInfo): string {
    if (h.type === 'national') return `${t('holidayPrefixNational')}: ${h.name}`;
    if (h.type === 'ccaa') return `${h.ccaaCode ? getCCAAName(h.ccaaCode) : t('holidayPrefixCCAA')}: ${h.name}`;
    return h.provinceCode ? `${getProvinceName(h.provinceCode)}: ${h.name}` : h.name;
}

// La celda pinta el primero y cuántos más caen ese día (también en el PDF); la lista entera va en holidayTooltip.
export function holidayCellText(h: HolidayInfo, withPrefix = true): string {
    const first = withPrefix ? holidayFullName(h) : h.name;
    return h.others?.length ? `${first} +${h.others.length}` : first;
}

// Para el `title`, que solo se ve en pantalla: html-to-image no lo pinta en la captura.
export function holidayTooltip(h: HolidayInfo): string {
    return [h, ...(h.others ?? [])].map(holidayFullName).join('\n');
}

export function getCCAAList(): Array<{ code: string; name: string }> {
    return Object.keys(CCAA_META)
        .map((code) => ({ code, name: ccaaLabel(code) }))
        .sort((a, b) => a.name.localeCompare(b.name, getLang() || 'es'));
}

export function getProvinceList(
    ccaaCode: string | null
): Array<{ code: string; name: string; alias?: readonly string[] }> {
    if (!ccaaCode) return [];
    const codes =
        ccaaCode === '__ALL__'
            ? Object.keys(CAPITAL_META)
            : Object.keys(CAPITAL_META).filter((code) => code.startsWith(ccaaCode + '-'));
    return codes
        .map((code) => ({ code, name: CAPITAL_META[code] as string, alias: CAPITAL_ALIAS[code] }))
        .sort((a, b) => a.name.localeCompare(b.name, getLang() || 'es'));
}

export function getProvinceName(provinceCode: string): string {
    return CAPITAL_META[provinceCode] || '';
}

export function getCCAAName(ccaaCode: string): string {
    return CCAA_META[ccaaCode] ? ccaaLabel(ccaaCode) : '';
}
