// @ts-check
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PLANNER_URL = '/';

/** Captura errores de consola (misma forma que planner.spec.js). */
function setupGuards(/** @type {import('@playwright/test').Page} */ page) {
    /** @type {string[]} */
    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    return { consoleErrors };
}

const LS_A5 = 'planner-a5-config';
const SEED_TODO = 6; // = DEFAULT_PLANNER_A5_CONFIG.todoCount (planner-state-planner.ts:24)

// Estado determinista ANTES de cargar. `planner-orientation` es obligatorio: sin él la orientación por defecto
// sale de `--bp` (planner-state-planner.ts:50-56) y Desktop arrancaría en A4 (todoCount 8) y Mobile en A5 (6).…
async function seedPlannerA5(/** @type {import('@playwright/test').Page} */ page, overrides = {}) {
    const seed = {
        showMonthYear: true,
        monthYearAlign: 'center-inline',
        showGoals: true,
        showHabits: true,
        showTodo: true,
        showPriority: true,
        showGrateful: true,
        showSelfCare: true,
        todoCount: SEED_TODO,
        habitCount: 5,
        sectionTexts: {},
        ...overrides,
    };
    await page.addInitScript((cfg) => {
        if (localStorage.getItem('e2e-planner-seeded')) return;
        localStorage.setItem('e2e-planner-seeded', '1');
        localStorage.setItem('planner-style', 'planner');
        localStorage.setItem('planner-lang', 'es');
        localStorage.setItem('planner-orientation', 'vertical');
        localStorage.setItem('planner-a5-config', JSON.stringify(cfg));
    }, seed);
}

// Arranque real del editor. `#page1` existe VACÍO en el HTML (index.html:782) y tiene tamaño A5 por CSS, así
// que `toBeVisible()` pasa con la página en blanco: la señal fiable es que el papel tenga contenido, porque…
async function bootPlanner(/** @type {import('@playwright/test').Page} */ page, expectedTodos = SEED_TODO) {
    await page.goto(PLANNER_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#plannerToolbar')).toBeVisible();
    await expect(page.locator('#page1 [data-section^="todo-"]')).toHaveCount(expectedTodos);
}

/** Ítems TO DO del folio: exactamente `todoCount` (planner-ui-planner.ts:111-118 A5 / 473-478 A4). */
function paperTodos(/** @type {import('@playwright/test').Page} */ page) {
    return page.locator('#page1 [data-section^="todo-"]');
}

// Abre el panel. OJO: en escritorio la toolbar queda TAPADA por el backdrop (z 1004 vs 1003,
// planner-base.css:1321 y 59) y por el propio panel, así que esto solo vale con el panel CERRADO — reabrir…
async function openConfigPanel(/** @type {import('@playwright/test').Page} */ page) {
    const panel = page.locator('#configPanel');
    await expect(panel).toBeHidden();
    // El backdrop (z 1004) TAPA la toolbar: si aún no se ha retirado del cierre anterior, el clic
    // lo recibe él y el panel no abre. Bajo carga eso sale como flaky.
    await expect(page.locator('.planner-config-backdrop')).toHaveCount(0);
    await page.locator('#configBtn').click();
    await expect(panel).toBeVisible();
    await expect(page.locator('#configPlanner')).toBeVisible(); // cuerpo del estilo planner (index.html:307)
    await expect(page.locator('#configBtn')).toHaveAttribute('aria-expanded', 'true');
    return panel;
}

/** Stepper de "Tareas": PRIMERA fila de #plannerInputs. Sus − + se nombran con la fila, como su ↺. */
function todoStepper(/** @type {import('@playwright/test').Page} */ page) {
    const row = page.locator('#plannerInputs .planner-config__select-row').first();
    return {
        row,
        value: row.locator('.planner-config__num-value'),
        plus: row.getByRole('button', { name: 'Aumentar Tareas', exact: true }),
        minus: row.getByRole('button', { name: 'Disminuir Tareas', exact: true }),
    };
}

/** todoCount PERSISTIDO. Escritura debounced 250 ms → usar siempre con expect.poll. */
async function storedTodoCount(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            return Number(JSON.parse(raw).todoCount);
        } catch {
            return null;
        }
    }, LS_A5);
}

/** Punto del backdrop fuera del panel en las DOS geometrías (izquierda en desktop, sheet abajo en móvil). */
function outsidePoint(/** @type {import('@playwright/test').Page} */ page) {
    const vp = page.viewportSize();
    return { x: Math.round((vp?.width ?? 1440) * 0.72), y: Math.round((vp?.height ?? 900) * 0.18) };
}

// El año sale de `new Date()` en cada carga (initState) y no se persiste: sin reloj fijo, el test depende del día.
const CON_DATOS = '2026-01-15T12:00:00';
const ABRIL_2026 = '2026-04-15T12:00:00';
// Año SIN festivos que la rotación de HOLIDAYS_BY_YEAR no alcanza (va hacia delante); 2027 los tendrá con el BOE.
const SIN_DATOS = 2025;
const AVISO_SIN_DATOS = `Sin datos de festivos para ${SIN_DATOS}`;

async function bootEnFecha(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {string} */ estilo,
    /** @type {string} */ fecha,
    /** @type {Record<string, string>} */ extra = {}
) {
    await page.clock.setFixedTime(new Date(fecha));
    await page.addInitScript(
        (cfg) => {
            if (localStorage.getItem('e2e-planner-seeded')) return;
            localStorage.setItem('e2e-planner-seeded', '1');
            localStorage.setItem('planner-style', cfg.estilo);
            localStorage.setItem('planner-lang', 'es');
            for (const [k, v] of Object.entries(cfg.extra)) localStorage.setItem(k, v);
        },
        { estilo, extra }
    );
    await page.goto(PLANNER_URL);
    await expect(page.locator('body')).toHaveClass(/page-ready/);
    await expect(page.locator('#plannerToolbar')).toBeVisible();
}

// `openConfigPanel` exige el cuerpo del organizador: este vale para cualquier vista.
async function abrirConfig(/** @type {import('@playwright/test').Page} */ page) {
    await expect(page.locator('#configPanel')).toBeHidden();
    await expect(page.locator('.planner-config-backdrop')).toHaveCount(0);
    await page.locator('#configBtn').click();
    await expect(page.locator('#configPanel')).toBeVisible();
}

const VISTAS = [
    {
        estilo: 'quarterly',
        toggles: '#quarterToggles',
        prev: '#prevQuarter',
        next: '#nextQuarter',
        rotulo: '#configQuarterLabel',
        celda: '.pq-day',
        libre: /pq-day--vacation/,
        hoy: '2026 T1',
        anterior: '2025 T4',
    },
    {
        estilo: 'monthly',
        toggles: '#monthlyCalToggles',
        prev: '#prevMonthlyCal',
        next: '#nextMonthlyCal',
        rotulo: '#configMonthlyCalLabel',
        celda: '.pm-cell',
        libre: /pm-cell--vacation/,
        hoy: 'Enero 2026',
        anterior: 'Diciembre 2025',
    },
];

test.describe('Planner — Panel Config: contrato Guardar/Cancelar', () => {
    test('Guardar: el stepper aplica en vivo, persiste en planner-a5-config y sobrevive a la recarga', async ({
        page,
    }) => {
        const guards = setupGuards(page);
        await seedPlannerA5(page);
        await bootPlanner(page);

        const todos = paperTodos(page);
        await openConfigPanel(page);
        const st = todoStepper(page);
        // INVARIANTE (no adorno): si alguien reordena buildPlannerInputs, aquí sale 5
        // (Hábitos) y el test rompe, en vez de medir el stepper equivocado en silencio.
        await expect(st.value).toHaveText(String(SEED_TODO));

        await st.plus.click();
        await expect(st.value).toHaveText(String(SEED_TODO + 1));
        // Preview EN VIVO: update() hace setPlannerConfig + render (planner-config-panel.ts:691-692)
        await expect(todos).toHaveCount(SEED_TODO + 1);

        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(page.locator('#configBtn')).toHaveAttribute('aria-expanded', 'false');
        await expect(todos).toHaveCount(SEED_TODO + 1);

        // Debounce de 250 ms (core/storage/debounced-storage.ts): poll, nunca getItem a pelo.
        // Además garantiza que lo escrito es lo que releerá la recarga.
        await expect.poll(() => storedTodoCount(page)).toBe(SEED_TODO + 1);

        await page.reload();
        await bootPlanner(page, SEED_TODO + 1);
        await expect(paperTodos(page)).toHaveCount(SEED_TODO + 1);
        await openConfigPanel(page);
        await expect(todoStepper(page).value).toHaveText(String(SEED_TODO + 1));

        expect(guards.consoleErrors).toEqual([]);
    });

    test('Cancelar: revierte papel, panel y storage al estado de apertura (y nada sobrevive a la recarga)', async ({
        page,
    }) => {
        const guards = setupGuards(page);
        await seedPlannerA5(page);
        await bootPlanner(page);

        const todos = paperTodos(page);
        const panel = await openConfigPanel(page);
        const st = todoStepper(page);
        await expect(st.value).toHaveText(String(SEED_TODO));

        // El "draft" del planner NO está aislado: este clic YA escribió en el estado vivo y en localStorage
        // (planner-config-panel.ts:691 → setPlannerConfig → planner-state-planner.ts:230 savePlannerConfig). Lo…
        await st.plus.click();
        await expect(st.value).toHaveText(String(SEED_TODO + 1));
        await expect(todos).toHaveCount(SEED_TODO + 1);

        await page.locator('#configCancel').click();
        await expect(panel).toBeHidden();
        await expect(page.locator('#configBtn')).toHaveAttribute('aria-expanded', 'false');
        await expect(todos).toHaveCount(SEED_TODO);
        await expect.poll(() => storedTodoCount(page)).toBe(SEED_TODO);

        // Reabrir: el panel muestra el valor de APERTURA
        await openConfigPanel(page);
        await expect(todoStepper(page).value).toHaveText(String(SEED_TODO));

        // Y la recarga confirma que no quedó nada escrito
        await page.reload();
        await bootPlanner(page);
        await expect(paperTodos(page)).toHaveCount(SEED_TODO);
        expect(await storedTodoCount(page)).toBe(SEED_TODO);

        expect(guards.consoleErrors).toEqual([]);
    });

    test('Escape equivale a Cancelar: cierra y revierte stepper Y toggle', async ({ page }) => {
        const guards = setupGuards(page);
        await seedPlannerA5(page);
        await bootPlanner(page);

        const todos = paperTodos(page);
        const goals = page.locator('#page1 [data-section="goals"]'); // planner-ui-planner.ts:97
        const panel = await openConfigPanel(page);
        const st = todoStepper(page);
        await expect(goals).toHaveCount(1);

        await st.plus.click();
        await expect(todos).toHaveCount(SEED_TODO + 1);

        // Segundo tipo de control: toggle "Objetivos" (_makeToggle, planner-config-panel.ts:621-634).
        // Etiqueta = t('toggleGoals') = "Objetivos" con planner-lang sembrado a 'es'.
        const goalsToggle = page.locator('#plannerToggles').getByRole('button', { name: 'Objetivos', exact: true });
        await expect(goalsToggle).toHaveClass(/is-active/);
        await goalsToggle.click();
        await expect(goalsToggle).not.toHaveClass(/is-active/);
        await expect(goals).toHaveCount(0);

        // Escape → closeConfig, sin filtro de foco (planner-config-panel.ts:1825-1827)
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
        await expect(todos).toHaveCount(SEED_TODO);
        await expect(goals).toHaveCount(1);
        await expect.poll(() => storedTodoCount(page)).toBe(SEED_TODO);

        await openConfigPanel(page);
        await expect(todoStepper(page).value).toHaveText(String(SEED_TODO));
        await expect(
            page.locator('#plannerToggles').getByRole('button', { name: 'Objetivos', exact: true })
        ).toHaveClass(/is-active/);

        expect(guards.consoleErrors).toEqual([]);
    });

    test('escritorio · clic fuera CIERRA y revierte (divergencia deliberada vs postal/CV)', async ({
        page,
    }, testInfo) => {
        // En MOVIL ya no hay velo — el sheet compartido deja ver el folio a proposito y la
        // salida tactil es el Cancelar del footer. En escritorio el contrato no cambia.
        test.skip(testInfo.project.name === 'Mobile Safari', 'sin velo en movil');
        const guards = setupGuards(page);
        await seedPlannerA5(page);
        await bootPlanner(page);

        const todos = paperTodos(page);
        const panel = await openConfigPanel(page);
        await todoStepper(page).plus.click();
        await expect(todos).toHaveCount(SEED_TODO + 1);

        // Dos mecanismos, ambos = Cancelar: mousedown del backdrop (planner-controller.ts:224, callback
        // showBackdrop(() => closeConfig()) en planner-config-panel.ts:196) y el listener global de document…
        const backdrop = page.locator('.planner-config-backdrop');
        await expect(backdrop).toBeVisible();
        await backdrop.click({ position: outsidePoint(page) });

        await expect(panel).toBeHidden();
        await expect(backdrop).toHaveCount(0);
        await expect(page.locator('#configBtn')).toHaveAttribute('aria-expanded', 'false');
        await expect(todos).toHaveCount(SEED_TODO);
        await expect.poll(() => storedTodoCount(page)).toBe(SEED_TODO);

        expect(guards.consoleErrors).toEqual([]);
    });

    test('la navegación de mes entra en el contrato: Cancelar la revierte, Guardar la conserva (sin persistirla)', async ({
        page,
    }) => {
        const guards = setupGuards(page);
        await seedPlannerA5(page);
        await bootPlanner(page);

        // Cabecera del folio: A5 o A4 según orientación (planner-ui-planner.ts:80 / 446).
        // Solo se renderiza una → el locator resuelve a 1 elemento (modo estricto OK).
        const paperMonth = page.locator('#page1 .p1-header__month, #page1 .ph-header__month');
        const initial = (await paperMonth.innerText()).trim();
        expect(initial).not.toBe('');

        // ── Cancelar revierte la navegación (closeConfig:240-244, setMonthYear) ──
        await openConfigPanel(page);
        await expect(page.locator('#configPlannerMonthLabel')).not.toHaveText('');
        await page.locator('#nextPlannerMonth').click();
        await expect(paperMonth).not.toHaveText(initial);
        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(paperMonth).toHaveText(initial);

        // ── Guardar la conserva: saveConfig anula los snapshots (292-326) ──
        await openConfigPanel(page);
        await page.locator('#nextPlannerMonth').click();
        const navigated = (await paperMonth.innerText()).trim();
        expect(navigated).not.toBe(initial);
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(paperMonth).toHaveText(navigated);

        // …pero el mes NO se persiste: es estado de sesión y initState() lo vuelve a
        // fijar a HOY en cada carga (planner-state.ts:37-41 y 46-50).
        await page.reload();
        await bootPlanner(page);
        await expect(page.locator('#page1 .p1-header__month, #page1 .ph-header__month')).toHaveText(initial);

        expect(guards.consoleErrors).toEqual([]);
    });

    test('Restablecer (#configReset) es draft: Cancelar vuelve al estado de apertura, no al default', async ({
        page,
    }) => {
        const guards = setupGuards(page);
        // Semilla NO-default a propósito (default A5 = 6): con 6 el Restablecer no cambiaría
        // nada y el test sería vacuo.
        await seedPlannerA5(page, { todoCount: 5 });
        await bootPlanner(page, 5);

        const todos = paperTodos(page);
        const panel = await openConfigPanel(page);
        await expect(todoStepper(page).value).toHaveText('5');

        await page.locator('#configReset').click();
        // resetConfig sustituye el draft por los defaults y los aplica al estado vivo
        // (planner-config-panel.ts:396-411 → setPlannerA5Config), pero NO toca los snapshots.
        await expect(todoStepper(page).value).toHaveText('6');
        await expect(todos).toHaveCount(6);

        await page.locator('#configCancel').click();
        await expect(panel).toBeHidden();
        await expect(todos).toHaveCount(5);
        await expect.poll(() => storedTodoCount(page)).toBe(5);

        await openConfigPanel(page);
        await expect(todoStepper(page).value).toHaveText('5');

        expect(guards.consoleErrors).toEqual([]);
    });
});

// ─── Guardar en una orientación del organizador no borra los textos que solo tiene la otra

const LS_A4 = 'planner-a4-config';
const A4_TODO = 8; // = DEFAULT_PLANNER_A4_CONFIG.todoCount (planner-state-planner.ts)

/** Siembra A5 y A4 por separado; lo que no se pase lo completan los defaults de loadPlannerConfig. */
async function seedOrganizador(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {string} */ orientacion,
    /** @type {object} */ a5,
    /** @type {object} */ a4
) {
    await page.addInitScript(
        (cfg) => {
            if (localStorage.getItem('e2e-planner-seeded')) return;
            localStorage.setItem('e2e-planner-seeded', '1');
            localStorage.setItem('planner-style', 'planner');
            localStorage.setItem('planner-lang', 'es');
            localStorage.setItem('planner-orientation', cfg.orientacion);
            localStorage.setItem('planner-a5-config', JSON.stringify(cfg.a5));
            localStorage.setItem('planner-a4-config', JSON.stringify(cfg.a4));
        },
        { orientacion, a5, a4 }
    );
}

// El flush es obligatorio: sin él, «el texto sigue ahí» se leería antes de la escritura diferida.
async function leerGuardado(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ key) {
    return page.evaluate((k) => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        return JSON.parse(localStorage.getItem(k) || '{}');
    }, key);
}

function textosDe(/** @type {{ sectionTexts?: Record<string, { text?: string }> }} */ cfg) {
    return Object.fromEntries(Object.entries(cfg.sectionTexts || {}).map(([k, c]) => [k, c.text]));
}

test.describe('Planner — Panel Config: Guardar no borra los textos de la otra orientación', () => {
    test('A5: subir las tareas y Guardar deja intactas las tareas 7 y 8 de A4', async ({ page }) => {
        const guards = setupGuards(page);
        const a4 = { sectionTexts: { 'todo-6': { text: 'A4-SIETE' }, 'todo-7': { text: 'A4-OCHO' } } };
        await seedOrganizador(page, 'vertical', {}, a4);
        await bootPlanner(page);

        await openConfigPanel(page);
        const st = todoStepper(page);
        await expect(st.value).toHaveText(String(SEED_TODO));
        // La 7 pasa a caber en A5 y allí está vacía: vacía no es borrada.
        await st.plus.click();
        await expect(st.value).toHaveText(String(SEED_TODO + 1));
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();

        expect((await leerGuardado(page, LS_A5)).todoCount).toBe(SEED_TODO + 1);
        expect(textosDe(await leerGuardado(page, LS_A4))).toEqual({ 'todo-6': 'A4-SIETE', 'todo-7': 'A4-OCHO' });
        expect(guards.consoleErrors).toEqual([]);
    });

    test('A4 (al revés): subir los hábitos y Guardar deja intacto el sexto hábito de A5', async ({ page }) => {
        const guards = setupGuards(page);
        const a5 = { habitCount: 6, sectionTexts: { 'habit-5': { text: 'A5-SEXTO' } } };
        await seedOrganizador(page, 'horizontal', a5, {});
        await bootPlanner(page, A4_TODO);

        await openConfigPanel(page);
        const habitos = page.locator('#plannerInputs .planner-config__select-row').nth(1);
        const valor = habitos.locator('.planner-config__num-value');
        await expect(valor).toHaveText('5');
        await habitos.getByRole('button', { name: 'Aumentar Hábitos', exact: true }).click();
        await expect(valor).toHaveText('6');
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();

        expect((await leerGuardado(page, LS_A4)).habitCount).toBe(6);
        expect(textosDe(await leerGuardado(page, LS_A5))).toEqual({ 'habit-5': 'A5-SEXTO' });
        expect(guards.consoleErrors).toEqual([]);
    });
});

test.describe('Planner — Panel Config: cierre en móvil', () => {
    test('móvil: la barra se oculta con el sheet abierto y el Cancelar del footer revierte', async ({
        page,
    }, testInfo) => {
        // T2 del sheet compartido: con un panel abierto la bottom bar se oculta y su franja la ocupa el footer.
        // Por eso el gesto viejo (pulsar Config otra vez) ya no existe en móvil, y la salida táctil es el…
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
        const guards = setupGuards(page);
        await seedPlannerA5(page);
        await bootPlanner(page);

        const todos = paperTodos(page);
        const panel = await openConfigPanel(page);
        await expect(page.locator('body')).toHaveClass(/edt-sheet-open/);
        await expect(page.locator('#plannerToolbar')).toBeHidden();
        // Y sin velo: el folio de detrás se ve.
        await expect(page.locator('.planner-config-backdrop')).toHaveCount(0);

        await todoStepper(page).plus.click();
        await expect(todos).toHaveCount(SEED_TODO + 1);

        await page.locator('#configCancel').click();
        await expect(panel).toBeHidden();
        await expect(page.locator('#plannerToolbar')).toBeVisible();
        await expect(todos).toHaveCount(SEED_TODO);
        await expect.poll(() => storedTodoCount(page)).toBe(SEED_TODO);

        expect(guards.consoleErrors).toEqual([]);
    });
});

test.describe('Planner — Desplegables compartidos', () => {
    test('el selector de CCAA es el widget compartido y pinta el festivo en el folio', async ({ page }) => {
        const guards = setupGuards(page);
        await bootEnFecha(page, 'monthly', ABRIL_2026);

        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(page.locator('.planner-config-backdrop')).toHaveCount(0);
        await page.locator('#configBtn').click();
        await expect(page.locator('#configPanel')).toBeVisible();

        // Progressive enhancement: el <select> nativo sigue siendo la fuente de verdad y queda
        // oculto; lo que se ve es el wrapper del widget compartido.
        const sel = page.locator('#holidaysCcaaSelect');
        await expect(sel).toHaveCount(1);
        await expect(sel).toBeHidden();
        await expect(page.locator('#holidaysCcaaSelect + .edt-ss-outer')).toHaveCount(1);

        // La CCAA por defecto ya es Andalucía, así que el oráculo es CAMBIARLA. En abril cambia Jueves
        // Santo (AND) por Lunes de Pascua (CAT); en otros meses podría no cambiar nada.
        const antes = await page.locator('#page1').innerText();
        await expect(sel).toHaveValue('AND');

        // Por la vía del usuario: el <select> nativo está oculto a propósito y selectOption()
        // no vale. Se abre el desplegable y se elige.
        await page.locator('#holidaysCcaaSelect + .edt-ss-outer .edt-ss-display').click();
        // Hay DOS paneles (CCAA y Capital): el abierto lleva .is-open.
        await expect(page.locator('.edt-ss-panel.is-open')).toBeVisible();
        await page.locator('.edt-ss-panel.is-open .edt-ss-option', { hasText: 'Cataluña' }).first().click();

        await expect(sel).toHaveValue('CAT');
        await expect.poll(() => page.locator('#page1').innerText()).not.toBe(antes);

        expect(guards.consoleErrors).toEqual([]);
    });

    test('reconstruir el panel no deja paneles del widget huérfanos en el body (leak)', async ({ page }) => {
        await bootEnFecha(page, 'monthly', ABRIL_2026);

        // Abrir y cerrar tres veces reconstruye los selectores otras tantas. Antes cada pasada dejaba
        // un .planner-config__dropdown-panel colgando de <body>, porque el observer que debía limpiarlo vigila…
        for (let i = 0; i < 3; i++) {
            await page.locator('#configBtn').click();
            await expect(page.locator('#configPanel')).toBeVisible();
            await page.locator('#configCancel').click();
            await expect(page.locator('#configPanel')).toBeHidden();
        }

        // EXACTAMENTE 2: uno por cada select vivo (CCAA y Capital) de la última construcción.
        // Sin el destroy explícito serían 6 — uno por pasada — y así es como crecía sin parar.
        await expect(page.locator('body > .edt-ss-panel')).toHaveCount(2);
    });

    test('el segundo selector se llama «Capital» («City» en inglés): lista capitales, no provincias', async ({
        page,
    }) => {
        await bootEnFecha(page, 'monthly', ABRIL_2026);
        await abrirConfig(page);
        await expect(page.locator('label[for="holidaysProvinceSelect"]')).toHaveText('Capital');
        await expect(page.getByRole('button', { name: 'Restablecer Capital', exact: true })).toHaveCount(1);
        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();

        await page.evaluate(() => localStorage.setItem('planner-lang', 'en'));
        await page.reload();
        await expect(page.locator('#plannerToolbar')).toBeVisible();
        await abrirConfig(page);
        await expect(page.locator('label[for="holidaysProvinceSelect"]')).toHaveText('City');
        await expect(page.getByRole('button', { name: 'Reset City', exact: true })).toHaveCount(1);
    });

    test('el combobox visible se anuncia con su etiqueta, en el idioma de la interfaz, y pasa axe', async ({
        page,
    }) => {
        await bootEnFecha(page, 'monthly', ABRIL_2026);
        await abrirConfig(page);
        // El <select> nativo va con display:none: su <label for> solo llega al lector a través del combobox visible
        await expect(page.getByRole('combobox', { name: 'CCAA', exact: true })).toBeVisible();
        await expect(page.getByRole('combobox', { name: 'Capital', exact: true })).toBeVisible();
        await expect(async () => {
            const r = await new AxeBuilder({ page })
                .include('#configPanel')
                .withRules(['aria-input-field-name'])
                .analyze();
            expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
        }).toPass({ timeout: 12000 });
        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();

        await page.evaluate(() => localStorage.setItem('planner-lang', 'en'));
        await page.reload();
        await expect(page.locator('#plannerToolbar')).toBeVisible();
        await abrirConfig(page);
        await expect(page.getByRole('combobox', { name: 'Region', exact: true })).toBeVisible();
        await expect(page.getByRole('combobox', { name: 'City', exact: true })).toBeVisible();
    });

    test('la tipografía de Textos se anuncia por su etiqueta y la sigue al cambiar de idioma', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name === 'Mobile Safari', 'el panel de Textos es solo-escritorio');
        await seedPlannerA5(page);
        await bootPlanner(page);
        await page.locator('#textToggle').click();
        await expect(page.getByRole('combobox', { name: 'Tipografía', exact: true })).toBeVisible();
        await page.locator('#textCancel').click();
        await expect(page.locator('#textPanel')).toBeHidden();

        // Sin textos el botón cambia la interfaz sin traducir nada
        await page.locator('#langToggle').click();
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await page.locator('#textToggle').click();
        await expect(page.getByRole('combobox', { name: 'Font', exact: true })).toBeVisible();
    });

    test('el buscador de Capital encuentra Donostia por «San Sebastián», sin tildes, y otras por su otro nombre', async ({
        page,
    }) => {
        await bootEnFecha(page, 'monthly', ABRIL_2026);
        await abrirConfig(page);
        // Con «Todos los festivos» la Capital lista las 31 y enseña el buscador (lo hace con más de 5 opciones)
        await page.getByRole('combobox', { name: 'CCAA', exact: true }).click();
        await page.locator('.edt-ss-panel.is-open .edt-ss-option', { hasText: 'Todos los festivos' }).click();
        await expect(page.locator('#holidaysCcaaSelect')).toHaveValue('__ALL__');

        await page.getByRole('combobox', { name: 'Capital', exact: true }).click();
        const abierto = page.locator('.edt-ss-panel.is-open');
        const buscar = abierto.locator('.edt-ss-search');
        const opciones = abierto.locator('.edt-ss-option');
        await expect(buscar).toBeVisible();
        for (const [texto, capital] of [
            ['San Sebastián', 'Donostia'],
            ['san sebastian', 'Donostia'],
            ['Donostia / San Sebastián', 'Donostia'],
            ['La Coruña', 'A Coruña'],
            ['Lérida', 'Lleida'],
            ['Gerona', 'Girona'],
            ['Alacant', 'Alicante'],
            ['Castelló', 'Castellón'],
            ['Vitoria Gasteiz', 'Vitoria-Gasteiz'],
            ['malaga', 'Málaga'],
        ]) {
            await buscar.fill(texto);
            await expect(opciones, `«${texto}»`).toHaveText([capital]);
        }
        await buscar.fill('San Sebastián');
        await opciones.first().click();
        await expect(page.locator('#holidaysProvinceSelect')).toHaveValue('PVA-SS');
        await expect(page.getByRole('combobox', { name: 'Capital', exact: true })).toHaveText(/Donostia/);
    });
});

test.describe('Planner — Tipografías con el widget compartido', () => {
    test('el desplegable de fuente es el compartido, con vista previa, y viste TODO el texto', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name === 'Mobile Safari', 'el panel de Textos es solo-escritorio');
        const guards = setupGuards(page);
        await seedPlannerA5(page);
        await bootPlanner(page);

        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();

        // Queda UN solo selector: los 17 temas usan la misma familia en títulos y cuerpo.
        const fuente = page.locator('#textFontSelect');
        await expect(fuente).toHaveCount(1);
        await expect(page.locator('#textTitleFontSelect')).toHaveCount(0);
        // Progressive enhancement: el nativo queda oculto y manda como fuente de verdad.
        await expect(fuente).toBeHidden();
        await expect(page.locator('#textFontSelect + .edt-ss-outer')).toHaveCount(1);

        // Cada opción se pinta con SU familia. Como el value del planner es una clave y no una
        // font-family, eso solo funciona con el data-ss-font que se añadió al compartido.
        await page.locator('#textFontSelect + .edt-ss-outer .edt-ss-display').click();
        const opcion = page.locator('.edt-ss-panel.is-open .edt-ss-option').nth(2);
        await expect(opcion).toHaveAttribute('style', /font-family/);

        // Elegir tiene que llegar al folio POR LAS DOS VÍAS: el mismo selector mueve la fuente de
        // titulares (--planner-font-heading) y la del cuerpo (--planner-font-body).
        const leerFuentes = () =>
            page.evaluate(() => {
                const cs = getComputedStyle(document.documentElement);
                return {
                    heading: cs.getPropertyValue('--planner-font-heading').trim(),
                    body: cs.getPropertyValue('--planner-font-body').trim(),
                };
            });
        const antes = await leerFuentes();
        await opcion.click();
        await expect(fuente).not.toHaveValue('');
        await expect.poll(() => leerFuentes().then((f) => f.heading)).not.toBe(antes.heading);
        await expect.poll(() => leerFuentes().then((f) => f.body)).not.toBe(antes.body);

        expect(guards.consoleErrors).toEqual([]);
    });
});

test.describe('Planner — Exclusión mutua de paneles', () => {
    test('abrir un panel cierra el que estuviera abierto', async ({ page }) => {
        await seedPlannerA5(page);
        await bootPlanner(page);

        // Por UI no se llega: en escritorio el panel abierto TAPA la barra y en móvil se oculta con
        // el sheet; la exclusión es red estructural, así que se prueba contra el store.

        await page.addInitScript(() => performance.setResourceTimingBufferSize(1000));
        await page.reload();
        await expect(page.locator('#page1 [data-section^="todo-"]')).toHaveCount(SEED_TODO);

        // #designBtn está oculto en móvil: allí la puerta es la fila del sheet «Más».
        if (await page.locator('#designBtn').isVisible()) {
            await page.locator('#designBtn').click();
        } else {
            await page.locator('#btnMas').click();
            await page.locator('#masDisenoRow').click();
        }
        await expect(page.locator('#designPanel')).toBeVisible();

        const res = await page.evaluate(async () => {
            const url = performance
                .getEntriesByType('resource')
                .map((r) => r.name)
                .find((u) => u.includes('planner-panel-store'));
            if (!url) return { error: 'el módulo del store no está en el grafo' };
            const { panelStore } = await import(/* @vite-ignore */ url);
            const antes = panelStore.snapshot();
            panelStore.setOpen('config', true);
            return { antes, despues: panelStore.snapshot() };
        });

        expect(res.error).toBeUndefined();
        expect(res.antes).toEqual({ config: false, design: true, text: false, temas: false, mas: false, saved: false });
        // Antes eran tres booleanos independientes: aquí habrían quedado los DOS a true.
        expect(res.despues).toEqual({
            config: true,
            design: false,
            text: false,
            temas: false,
            mas: false,
            saved: false,
        });
        await expect(page.locator('#designPanel')).toBeHidden();
    });
});

test.describe('Planner — Panel Config: años sin festivos y Restablecer', () => {
    for (const v of VISTAS) {
        test(`${v.estilo} · cruzar a un año sin festivos cambia los selectores por el aviso`, async ({ page }) => {
            const guards = setupGuards(page);
            await bootEnFecha(page, v.estilo, CON_DATOS);
            await abrirConfig(page);
            const rotulo = page.locator(v.rotulo);
            const ccaa = page.locator('#holidaysCcaaSelect');
            const aviso = page.locator('#holidaysSelectors .planner-config__nodata');
            const festivos = page.locator(v.toggles).getByRole('button', { name: 'Festivos', exact: true });
            await expect(rotulo).toHaveText(v.hoy);
            await expect(ccaa).toHaveCount(1);

            await page.locator(v.prev).click();
            await expect(rotulo).toHaveText(v.anterior);
            await expect(ccaa).toHaveCount(0);
            await expect(aviso).toHaveText(AVISO_SIN_DATOS);
            await expect(page.locator('body > .edt-ss-panel')).toHaveCount(0);
            await expect(festivos).toHaveAttribute('title', AVISO_SIN_DATOS);

            await page.locator(v.next).click();
            await expect(rotulo).toHaveText(v.hoy);
            await expect(ccaa).toHaveValue('AND');
            await expect(aviso).toHaveCount(0);
            await expect(page.locator('body > .edt-ss-panel')).toHaveCount(2);
            await expect(festivos).not.toHaveAttribute('title');

            expect(guards.consoleErrors).toEqual([]);
        });

        test(`${v.estilo} · sin festivos, el toggle Festivos sigue gobernando los libres`, async ({ page }) => {
            const guards = setupGuards(page);
            const dia = `${SIN_DATOS}-06-16`;
            await bootEnFecha(page, v.estilo, `${dia}T12:00:00`, {
                [`planner-vacation-${SIN_DATOS}`]: JSON.stringify([dia]),
            });
            const libre = page.locator(`#page1 ${v.celda}[data-date="${dia}"]`);
            await expect(libre).toHaveClass(v.libre);

            await abrirConfig(page);
            const festivos = page.locator(v.toggles).getByRole('button', { name: 'Festivos', exact: true });
            // Apagado y deshabilitado, el ✦ del mini-editor pedía «Activa festivos» sin forma de hacerlo.
            await expect(festivos).toBeEnabled();
            await expect(festivos).not.toHaveClass(/is-disabled/);
            await expect(festivos).toHaveClass(/is-active/);

            await festivos.click();
            await expect(festivos).not.toHaveClass(/is-active/);
            await expect(libre).not.toHaveClass(v.libre);

            await page.locator('#configCancel').click();
            await expect(page.locator('#configPanel')).toBeHidden();
            await expect(libre).toHaveClass(v.libre);

            expect(guards.consoleErrors).toEqual([]);
        });

        test(`${v.estilo} · Restablecer vuelve al periodo de hoy y Cancelar lo deshace`, async ({ page }) => {
            const guards = setupGuards(page);
            await bootEnFecha(page, v.estilo, CON_DATOS);
            const rotulo = page.locator(v.rotulo);
            const folio = (/** @type {string} */ dia) => page.locator(`#page1 ${v.celda}[data-date="${dia}"]`);

            // Se GUARDA un periodo del año anterior: Restablecer tiene que volver de él al de hoy.
            await abrirConfig(page);
            await page.locator(v.prev).click();
            await page.locator('#configSave').click();
            await expect(page.locator('#configPanel')).toBeHidden();
            await expect(folio('2025-12-15')).toHaveCount(1);

            await abrirConfig(page);
            await expect(rotulo).toHaveText(v.anterior);
            await page.locator('#configReset').click();
            // Sin recalcular el trimestre en setMonthYear, la trimestral caía aquí en «2026 T4».
            await expect(rotulo).toHaveText(v.hoy);
            await expect(folio('2026-01-15')).toHaveCount(1);
            await expect(page.locator('#holidaysCcaaSelect')).toHaveCount(1);

            // Restablecer es borrador: Cancelar devuelve el periodo de apertura, no el de hoy.
            await page.locator('#configCancel').click();
            await expect(page.locator('#configPanel')).toBeHidden();
            await expect(folio('2025-12-15')).toHaveCount(1);
            await abrirConfig(page);
            await expect(rotulo).toHaveText(v.anterior);

            expect(guards.consoleErrors).toEqual([]);
        });
    }

    test('Cancelar en la trimestral devuelve también el MES de apertura, no el primero del trimestre', async ({
        page,
    }) => {
        await bootEnFecha(page, 'monthly', '2026-03-15T12:00:00');
        await abrirConfig(page);
        await page.locator('#styleQuarterly').click();
        await expect(page.locator('#configQuarterLabel')).toHaveText('2026 T1');
        await page.locator('#nextQuarter').click();
        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();

        await abrirConfig(page);
        await page.locator('#styleMonthly').click();
        // Recorriendo trimestres hacia atrás, Cancelar dejaba el mes en enero.
        await expect(page.locator('#configMonthlyCalLabel')).toHaveText('Marzo 2026');
    });
});

test.describe('Planner — Panel Config: el incremento de la semanal', () => {
    test('«Set» no pasa de 24 h, el mismo tope con el que el saneador recorta al recargar', async ({ page }) => {
        await bootEnFecha(page, 'weekly', CON_DATOS);
        await abrirConfig(page);
        const incremento = page.locator('#hoursInputs .planner-config__hour-inc-toggle');
        await incremento.click();
        await incremento.locator('input').fill('99:59');
        await incremento.locator('input').press('Enter');
        // Antes se quedaba en «99:59» y la recarga lo dejaba en 24 h sin decir nada.
        await expect(incremento).toHaveText('24:00');
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect
            .poll(() =>
                page.evaluate(() => JSON.parse(localStorage.getItem('planner-week-config') || '{}').hourIncrement)
            )
            .toBe(1440);
    });
});
