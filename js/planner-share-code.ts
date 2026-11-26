import {
    buildShareCode,
    invertKeyMap,
    makeKeyMapper,
    mergeDefaults,
    oneOf,
    parseShareCode,
    prune,
    DROP,
} from '@features/utils/share-codec.ts';
import { sanitizeCellHTML } from '@features/utils/sanitize-html.ts';
import { getPersistablePlannerState, getPlannerDefaults, PLANNER_CONFIG_VERSION } from './planner-persist.ts';
import {
    A4_HABIT_MAX,
    A4_TODO_MAX,
    A5_HABIT_MAX,
    A5_TODO_MAX,
    DATE_KEY,
    sanCellMap,
    sanDesign,
    sanHolidays,
    sanMonthlyCal,
    sanPlannerPage,
    sanQuarter,
    sanText,
    sanWeek,
    type TextFilter,
} from './planner-sanitize.ts';
import { applyFullPlannerState } from './planner-apply.ts';
import { getMonth, getYear, setMonthYear } from './planner-state.ts';
import type { CellLangs, CellLangStyle, CellTexts, PlannerPersistState, VacationByYear } from './planner-types.ts';

// El mes a la vista (month de 0 a 11; el trimestre sale de él)
export type PlannerNav = { year: number; month: number };

export type PlannerDecodeResult =
    | { ok: true; payload: PlannerPersistState; warnings: string[]; nav: PlannerNav | null }
    | { ok: false; error: string; detail?: string };

export const PlannerShareCode = (() => {
    'use strict';

    // Datos externos sin forma garantizada (código decodificado): any acotado a este códec.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Loose = Record<string, any>;

    const LANGS = ['es', 'en', 'de'] as const;
    const cleanHtml: TextFilter = (text) => sanitizeCellHTML(text.slice(0, 4000));

    function sanVacation(raw: Loose): VacationByYear {
        const out: VacationByYear = {};
        if (!raw || typeof raw !== 'object') return out;
        // Los 12 años más RECIENTES: truncar por el principio tiraba justo los que se usan.
        const years = Object.keys(raw)
            .filter((y) => /^\d{4}$/.test(y))
            .sort()
            .slice(-12);
        for (const y of years) {
            const yr = Number(y);
            if (yr < 2000 || yr > 2100 || !Array.isArray(raw[y])) continue;
            const days = [
                ...new Set(raw[y].filter((d: unknown) => typeof d === 'string' && DATE_KEY.test(d)).slice(0, 400)),
            ].sort() as string[];
            if (days.length) out[y] = days;
        }
        return out;
    }

    // Lista blanca como el resto: estilo conocido, celda CON texto en ese mapa e idioma válido distinto de textsLang.
    function sanCellLangs(raw: Loose, textsLang: string | null, maps: Record<CellLangStyle, CellTexts>): CellLangs {
        const out: CellLangs = {};
        if (!textsLang || !raw || typeof raw !== 'object') return out;
        for (const style of Object.keys(maps) as CellLangStyle[]) {
            const m = raw[style];
            if (!m || typeof m !== 'object') continue;
            for (const k of Object.keys(m).slice(0, 5000)) {
                const lang = m[k];
                const cell = Object.prototype.hasOwnProperty.call(maps[style], k) ? maps[style][k] : undefined;
                if (!cell?.text || lang === textsLang || !LANGS.includes(lang)) continue;
                (out[style] ??= {})[k] = lang;
            }
        }
        return out;
    }

    // El mes a la vista viaja en el código FUERA del estado: ni entra en el historial ni cambia la clave de un guardado
    // repetido. Sin él (los códigos de antes) se queda el mes que haya
    function sanNav(raw: unknown): PlannerNav | null {
        if (!Array.isArray(raw) || raw.length !== 2) return null;
        const [year, month] = raw;
        const ok = Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month);
        return ok && month >= 0 && month <= 11 ? { year, month } : null;
    }

    // Payload NUEVO copiando solo claves conocidas: __proto__ y campos raros se caen solos.
    function sanitizePayload(raw: Loose): PlannerPersistState | null {
        if (!raw || typeof raw !== 'object') return null;
        const def = getPlannerDefaults();
        const out: PlannerPersistState = {
            v: PLANNER_CONFIG_VERSION,
            style: oneOf(raw.style, ['planner', 'weekly', 'monthly', 'quarterly'] as const, def.style),
            orientation: oneOf(raw.orientation, ['vertical', 'horizontal'] as const, def.orientation),
            week: sanWeek(raw.week, def.week, cleanHtml),
            quarter: sanQuarter(raw.quarter, def.quarter),
            holidays: sanHolidays(raw.holidays, def.holidays),
            plannerA5: sanPlannerPage(raw.plannerA5, def.plannerA5, A5_TODO_MAX, A5_HABIT_MAX, cleanHtml),
            plannerA4: sanPlannerPage(raw.plannerA4, def.plannerA4, A4_TODO_MAX, A4_HABIT_MAX, cleanHtml),
            monthlyCal: sanMonthlyCal(raw.monthlyCal, def.monthlyCal),
            design: sanDesign(raw.design, def.design),
            text: sanText(raw.text, def.text),
            cells: sanCellMap(raw.cells, DATE_KEY, 5000, cleanHtml),
            vacation: sanVacation(raw.vacation),
            textsLang: oneOf(raw.textsLang, [...LANGS, null] as const, null),
        };
        const cellLangs = sanCellLangs(raw.cellLangs, out.textsLang, {
            weekly: out.week.cellTexts,
            plannerA5: out.plannerA5.sectionTexts,
            plannerA4: out.plannerA4.sectionTexts,
            monthly: out.cells,
        });
        if (Object.keys(cellLangs).length) out.cellLangs = cellLangs;
        return out;
    }

    // El mapeo es por NOMBRE, no por ruta: una clave repetida entre configs (text, bgColor…) lleva
    // UN código corto, y ningún corto puede chocar con claves sin mapear ('v', fechas, 'todo-N', años).
    const KMAP: Record<string, string> = {
        style: 'st',
        orientation: 'or',
        week: 'wk',
        quarter: 'qt',
        holidays: 'ho',
        plannerA5: 'p5',
        plannerA4: 'p4',
        monthlyCal: 'mc',
        design: 'de',
        cells: 'ce',
        vacation: 'va',
        days: 'dy',
        hours: 'hu',
        hourIncrement: 'hi',
        showTitle: 'sti',
        titleText: 'tit',
        hourAlign: 'hal',
        accentColor: 'aco',
        cellTexts: 'ct',
        titleAlign: 'tal',
        showWatermark: 'swm',
        showDayAbbrev: 'sda',
        showHolidays: 'sho',
        showWeekNumbers: 'swn',
        ccaa: 'cc',
        province: 'pv',
        showMonthYear: 'smy',
        monthYearAlign: 'mya',
        showGoals: 'sgo',
        showHabits: 'sha',
        showTodo: 'std',
        showPriority: 'spr',
        showGrateful: 'sgr',
        showSelfCare: 'ssc',
        todoCount: 'tdc',
        habitCount: 'hbc',
        sectionTexts: 'sx',
        showMiniCalLeft: 'mcl',
        showMiniCalRight: 'mcr',
        showNotes: 'sno',
        showOverflow: 'sov',
        weekendShading: 'wsh',
        theme: 'th',
        bgColor: 'bg',
        textColor: 'tco',
        textStyle: 'tst',
        accentPalette: 'apl',
        weeklyAccent: 'wac',
        weeklyAccentKey: 'wak',
        plannerAccent: 'pac',
        plannerAccentKey: 'pak',
        titleSize: 'tsz',
        textSize: 'xsz',
        boldTitle: 'bti',
        boldText: 'btx',
        overrideFormats: 'ofo',
        overrideAccent: 'oac',
        overrideLibres: 'oli',
        overrideFestivos: 'ofe',
        textsLang: 'tl',
        cellLangs: 'cl',
        text: 't',
        color: 'c',
        bold: 'b',
        hideHoliday: 'hh',
        noBg: 'nb',
        nav: 'nv',
    };
    const shorten = makeKeyMapper(KMAP);
    const expand = makeKeyMapper(invertKeyMap(KMAP));

    async function encodeCurrent(): Promise<string> {
        let delta = prune(getPersistablePlannerState(), getPlannerDefaults(), null);
        if (delta === DROP) delta = {};
        return buildShareCode(shorten({ ...delta, nav: [getYear(), getMonth()] }), 'PLN1', 'PLNU1');
    }

    async function decodeAndSanitize(code: string): Promise<PlannerDecodeResult> {
        const parsed = await parseShareCode(code, ['PLN1', 'PLNU1'], ['PLN1']);
        if (!parsed.ok) return parsed;
        try {
            const over = expand(parsed.raw);
            const raw = mergeDefaults(JSON.parse(JSON.stringify(getPlannerDefaults())), over);
            const payload = sanitizePayload(raw);
            if (!payload) return { ok: false, error: 'esquema' };
            return { ok: true, payload, warnings: [], nav: sanNav(over?.nav) };
        } catch (e) {
            const err = e as { message?: string } | null;
            return { ok: false, error: 'excepcion', detail: String((err && err.message) || e) };
        }
    }

    // Después del estado: el cambio de mes vuelve a pintar con la vista ya aplicada
    function showNav(nav: PlannerNav) {
        if (nav.year !== getYear() || nav.month !== getMonth()) setMonthYear(nav.month, nav.year);
    }

    function applyPayload(payload: PlannerPersistState, nav: PlannerNav | null = null): boolean {
        if (!payload) return false;
        applyFullPlannerState(payload);
        if (nav) showNav(nav);
        return true;
    }

    return { encodeCurrent, decodeAndSanitize, applyPayload, showNav };
})();
