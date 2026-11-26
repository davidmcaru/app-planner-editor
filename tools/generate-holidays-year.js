// Uso: node tools/generate-holidays-year.js <año> — esqueleto de HOLIDAYS_BY_YEAR (js/planner-holidays.ts).
// ⚠️ La salida NO es verdad oficial: se corrige contra el BOE (README, «Festivos»).

const NATIONAL = [
    [0, 1, 'ano-nuevo'],
    [0, 6, 'reyes'],
    ['easter-2', 'viernes-santo'],
    [4, 1, 'dia-del-trabajo'],
    [7, 15, 'asuncion'],
    [9, 12, 'fiesta-nacional'],
    [10, 1, 'todos-los-santos'],
    [11, 6, 'constitucion'],
    [11, 8, 'inmaculada'],
    [11, 25, 'navidad'],
];

const CCAA = {
    AND: [
        [1, 28, 'dia-de-andalucia'],
        ['easter-3', 'jueves-santo'],
    ],
    ARA: [
        ['easter-3', 'jueves-santo'],
        [3, 23, 'san-jorge'],
    ],
    AST: [
        ['easter-3', 'jueves-santo'],
        [8, 8, 'dia-de-asturias'],
    ],
    BAL: [
        [2, 1, 'dia-de-baleares'],
        ['easter-3', 'jueves-santo'],
        ['easter+1', 'lunes-de-pascua'],
        [11, 26, 'sant-esteve'],
    ],
    CAN: [
        ['easter-3', 'jueves-santo'],
        [4, 30, 'dia-de-canarias'],
    ],
    CNT: [
        ['easter-3', 'jueves-santo'],
        [6, 28, 'dia-de-cantabria'],
        [8, 15, 'la-bien-aparecida'],
    ],
    CLM: [
        ['easter-3', 'jueves-santo'],
        ['easter+1', 'lunes-de-pascua'],
        ['easter+60', 'corpus-christi'],
    ],
    CYL: [
        ['easter-3', 'jueves-santo'],
        [3, 23, 'dia-de-cyl'],
    ],
    CAT: [
        ['easter+1', 'lunes-de-pascua'],
        [5, 24, 'sant-joan'],
        [8, 11, 'diada'],
        [11, 26, 'sant-esteve'],
    ],
    EXT: [
        ['easter-3', 'jueves-santo'],
        [8, 8, 'dia-de-extremadura'],
    ],
    GAL: [
        [2, 19, 'san-jose'],
        ['easter-3', 'jueves-santo'],
        [5, 24, 'san-juan'],
        [6, 25, 'santiago-apostol'],
    ],
    MAD: [
        ['easter-3', 'jueves-santo'],
        [4, 2, 'dos-de-mayo'],
    ],
    MUR: [
        [2, 19, 'san-jose'],
        ['easter-3', 'jueves-santo'],
        [5, 9, 'dia-de-murcia'],
    ],
    NAV: [
        [2, 19, 'san-jose'],
        ['easter-3', 'jueves-santo'],
        ['easter+1', 'lunes-de-pascua'],
    ],
    PVA: [
        [2, 19, 'san-jose'],
        ['easter-3', 'jueves-santo'],
        ['easter+1', 'lunes-de-pascua'],
        [6, 25, 'santiago-apostol'],
    ],
    RIO: [
        ['easter-3', 'jueves-santo'],
        ['easter+1', 'lunes-de-pascua'],
        [5, 9, 'dia-de-la-rioja'],
    ],
    VAL: [
        [2, 19, 'san-jose'],
        ['easter+1', 'lunes-de-pascua'],
        [5, 24, 'sant-joan'],
        [9, 9, 'dia-de-la-c-valenciana'],
    ],
    CEU: [
        ['easter-3', 'jueves-santo'],
        [7, 5, 'virgen-de-africa'],
        [8, 2, 'dia-de-ceuta'],
    ],
    MEL: [['easter-3', 'jueves-santo']],
};

// Un texto al final marca calendario propio (feria, Semana Grande): la fecha es solo orientativa y el script avisa.
const CAPITAL = {
    'AND-AL': [
        [5, 24, 'san-juan'],
        [7, 29, 'virgen-del-mar', 'sábado de la Feria de Almería'],
    ],
    'AND-CA': [
        ['easter-48', 'lunes-de-carnaval'],
        [9, 7, 'virgen-del-rosario'],
    ],
    'AND-CO': [
        [8, 8, 'virgen-de-la-fuensanta'],
        [9, 24, 'san-rafael'],
    ],
    'AND-GR': [
        [0, 2, 'toma-de-granada'],
        ['easter+60', 'corpus-christi'],
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
        ['easter+17', 'feria-de-abril', 'miércoles de la Feria de Abril'],
        ['easter+60', 'corpus-christi'],
    ],
    'ARA-HU': [
        [0, 22, 'san-vicente'],
        [7, 10, 'san-lorenzo'],
    ],
    'ARA-TE': [
        ['easter+2', 'sermon-de-las-tortillas'],
        [6, 13, 'la-vaquilla', 'lunes de la Vaquilla del Ángel'],
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
        ['easter+68', 'curpillos'],
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
        ['easter+50', 'segona-pasqua'],
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
        ['easter+11', 'santa-faz'],
        [5, 23, 'hogueras'],
    ],
    'VAL-CS': [
        ['easter-27', 'magdalena'],
        [5, 29, 'san-pedro'],
    ],
    'VAL-VA': [
        [0, 22, 'san-vicente'],
        ['easter+8', 'san-vicente-ferrer'],
    ],
    'GAL-CO': [
        ['easter-47', 'martes-de-carnaval'],
        [9, 7, 'virgen-del-rosario'],
    ],
    'GAL-PO': [
        ['easter-46', 'miercoles-de-ceniza'],
        [6, 11, 'san-benito'],
    ],
    'MAD-MA': [
        [4, 15, 'san-isidro'],
        [10, 9, 'almudena'],
    ],
    'PVA-BI': [
        [6, 31, 'san-ignacio'],
        [7, 28, 'semana-grande', 'viernes de la Aste Nagusia (en 2026 el BOB la movió del 21 al 28)'],
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
        ['easter+2', 'bando-de-la-huerta'],
        [8, 15, 'romeria-de-la-fuensanta', 'martes de la Romería de la Fuensanta'],
    ],
    'MEL-ME': [
        [8, 8, 'virgen-de-la-victoria'],
        [8, 17, 'dia-de-melilla'],
    ],
};

function getEasterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month, day);
}

const year = parseInt(process.argv[2] || '', 10);
if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    console.error('Uso: node tools/scripts/generate-holidays-year.js <año>');
    process.exit(1);
}

const easter = getEasterSunday(year);

function resolve(entry) {
    if (typeof entry[0] === 'string') {
        const offset = parseInt(entry[0].replace('easter', ''), 10);
        // Por calendario, no en milisegundos: 48 días de 24 h cruzan el cambio de hora y caen en la víspera.
        const dt = new Date(year, easter.getMonth(), easter.getDate() + offset);
        return [dt.getMonth(), dt.getDate(), entry[1]];
    }
    return entry.slice(0, 3);
}

function ownCalendarNote(entry) {
    const plain = typeof entry[0] === 'string' ? 2 : 3;
    return entry.length > plain ? entry[plain] : null;
}

const sundays = [];
function fmt(entries, indent, where = '') {
    return entries
        .map(resolve)
        .map(([m, d, id]) => {
            if (new Date(year, m, d).getDay() === 0) sundays.push(`${d}/${m + 1} ${id}${where}`);
            return `${indent}[${m}, ${d}, '${id}'],`;
        })
        .join('\n');
}

const dayKeys = (entries) => new Set(entries.map(resolve).map(([m, d]) => `${m}-${d}`));
const nationalKeys = dayKeys(NATIONAL);
const ownCalendar = [];
const clashes = [];

let out = `    ${year}: {\n        national: [\n${fmt(NATIONAL, '            ')}\n        ],\n        ccaa: {\n`;
for (const [code, entries] of Object.entries(CCAA)) {
    out += `            ${code}: [\n${fmt(entries, '                ', ` (${code})`)}\n            ],\n`;
}
out += '        },\n        capital: {\n';
for (const [code, entries] of Object.entries(CAPITAL)) {
    out += `            '${code}': [\n${fmt(entries, '                ', ` (${code})`)}\n            ],\n`;
    const ccaaKeys = dayKeys(CCAA[code.split('-')[0]] || []);
    for (const entry of entries) {
        const [m, d, id] = resolve(entry);
        const label = `${code} ${d}/${m + 1} ${id}`;
        const note = ownCalendarNote(entry);
        if (note) ownCalendar.push(`${label}: ${note}`);
        if (nationalKeys.has(`${m}-${d}`) || ccaaKeys.has(`${m}-${d}`)) clashes.push(label);
    }
}
out += '        },\n    },';

function warnList(title, rows) {
    if (rows.length) console.error(`⚠️  ${title}:\n    ${rows.join('\n    ')}`);
}

console.log(out);
console.error(`\n⚠️  ESQUELETO de "año típico" para ${year} — corregir contra el BOE y los boletines antes de pegar.`);
console.error('⚠️  Ceuta y Melilla: sus fiestas islámicas son lunares y no salen aquí; se copian del BOE.');
warnList('Fiestas locales de calendario propio: fecha orientativa, se revisan a mano', ownCalendar);
warnList('Fiestas locales en un festivo nacional o de su comunidad: el municipio elegirá otro día', clashes);
if (sundays.length) {
    console.error(
        `⚠️  Caen en DOMINGO (las sustituciones las deciden la CCAA o el municipio):\n    ${sundays.join('\n    ')}`
    );
}
