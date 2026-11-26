// @ts-check
import { test, expect } from '@playwright/test';

// Red de seguridad del planner: nació ANTES de los splits y de la migración a TS, para poder
// hacerlas sin miedo.

const PLANNER_URL = '/';
const SEMILLA = 'SEMILLA-E2E';

// Orientación FIJADA: sin ella la decide `--bp` (planner-state-planner.ts:48-57) y con ella
// cambian el selector del mes (.ph-header__month ↔ .p1-header__month) y la clase de página.
const SEED_H = { 'planner-style': 'planner', 'planner-orientation': 'horizontal' };
const SEED_CON_TEXTO = {
    ...SEED_H,
    'planner-a4-config': JSON.stringify({ sectionTexts: { goals: { text: SEMILLA, color: '' } } }),
};

// ─── Helpers

/** Captura errores de consola y requests fallidas. */
function setupGuards(/** @type {import('@playwright/test').Page} */ page) {
    /** @type {string[]} */
    const consoleErrors = [];
    /** @type {string[]} */
    const failedRequests = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', (request) => {
        // Cancelaciones intencionadas del AbortController de planner-translation.ts
        if (request.failure()?.errorText?.includes('aborted')) return;
        failedRequests.push(request.url());
    });

    return { consoleErrors, failedRequests };
}

/**
 * Solo los fallos de recursos PROPIOS: lo que tiene que cazar esto es una ruta nuestra rota, no la caída de un
 * servicio de fuera, que volvería flaky a tests cuyo sujeto no es la red.
 */
function fallosPropios(/** @type {string[]} */ urls) {
    return urls.filter((u) => /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(u));
}

function skipMobile(/** @type {import('@playwright/test').TestInfo} */ testInfo, reason = 'desktop only') {
    test.skip(testInfo.project.name === 'Mobile Safari', reason);
}

async function waitForPlannerReady(/** @type {import('@playwright/test').Page} */ page) {
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#page1')).toBeVisible();
    await expect(page.locator('#plannerToolbar')).toBeVisible();
}

/** Clase EXACTA: `planner-pages--planner` NO debe casar con `planner-pages--planner-h`. */
function claseExacta(/** @type {string} */ cls) {
    return new RegExp(`(^|\\s)${cls}(\\s|$)`);
}

// ⚠️ NO usa `addInitScript` A PROPOSITO: se re-ejecuta en CADA navegación y volvería a sembrar
// en los `reload()` que varios tests usan como ORÁCULO de persistencia.
/** La vista es la primera sección del panel Config, que sigue abierto tras elegir. */
async function elegirVista(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ id) {
    if (await page.locator('#configPanel').isHidden()) await page.locator('#configBtn').click();
    await page.locator(`#${id}`).click();
    await expect(page.locator(`#${id}`)).toHaveClass(/is-active/);
    await page.locator('#configSave').click();
    await expect(page.locator('#configPanel')).toBeHidden();
}

/** El idioma es el PRIMER boton de la barra en las dos bandas. */
async function pulsarIdioma(/** @type {import('@playwright/test').Page} */ page) {
    await expect(page.locator('#langToggle')).toBeVisible();
    await page.locator('#langToggle').click();
}

async function gotoPlannerSeeded(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {string} */ url,
    /** @type {Record<string, string>} */ entries = {}
) {
    await page.goto(url);
    await page.evaluate((pairs) => {
        localStorage.clear();
        for (const [k, v] of pairs) localStorage.setItem(k, v);
    }, Object.entries(entries));
    await page.reload();
    await waitForPlannerReady(page);
}

// ─── Carga y consola limpia

test.describe('Planner — Carga inicial', () => {
    test('carga sin errores de consola ni requests fallidas', async ({ page }) => {
        const guards = setupGuards(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        expect(guards.consoleErrors.filter((e) => !/Failed to load resource/i.test(e))).toEqual([]);
        expect(fallosPropios(guards.failedRequests)).toEqual([]);
    });

    test('la toolbar expone los 3 modos (Diseño / Textos / Config) y Temas', async ({ page }, testInfo) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await expect(page.locator('#configBtn')).toBeVisible();
        await expect(page.locator('#btnTemas')).toBeVisible();

        // En móvil Diseño y Textos NO están en la barra: bajan al sheet «Más».
        if (testInfo.project.name === 'Mobile Safari') {
            await expect(page.locator('#designBtn')).toBeHidden();
            await expect(page.locator('#textToggle')).toBeHidden();
        } else {
            await expect(page.locator('#designBtn')).toBeVisible();
            await expect(page.locator('#textToggle')).toBeVisible();
        }
    });

    test('el estilo por defecto es Planner y su pastilla queda activa en Config', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await page.locator('#configBtn').click();
        await expect(page.locator('#stylePlanner')).toHaveClass(/is-active/);
    });
});

// ─── Tooltips i18n del toolbar (los pone planner-toolbar-i18n.ts, no el HTML)

test.describe('Planner — Tooltips toolbar', () => {
    test('los 3 botones del toolbar tienen title y aria-label', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        for (const id of ['designBtn', 'textToggle', 'configBtn', 'btnTemas']) {
            const btn = page.locator(`#${id}`);
            await expect(btn).toHaveAttribute('title', /.+/);
            await expect(btn).toHaveAttribute('aria-label', /.+/);
        }
    });
});

// ─── Cambio de estilo
test.describe('Planner — Cambio de estilo', () => {
    for (const { id, orientacion, clase } of [
        { id: 'styleWeekly', orientacion: 'horizontal', clase: 'planner-pages--weekly' },
        { id: 'styleMonthly', orientacion: 'horizontal', clase: 'planner-pages--monthly' },
        { id: 'styleQuarterly', orientacion: 'horizontal', clase: 'planner-pages--quarterly' },
        { id: 'stylePlanner', orientacion: 'horizontal', clase: 'planner-pages--planner-h' },
        { id: 'stylePlanner', orientacion: 'vertical', clase: 'planner-pages--planner' },
    ]) {
        test(`${id} en ${orientacion} aplica exactamente ${clase}`, async ({ page }) => {
            await gotoPlannerSeeded(page, PLANNER_URL, {
                'planner-style': 'planner',
                'planner-orientation': orientacion,
            });

            // Rodeo obligatorio: el estilo inicial YA es `planner` y setStyle() retorna sin hacer
            // nada si no cambia — sin esto el caso no probaría ninguna transición.
            if (id === 'stylePlanner') {
                await elegirVista(page, 'styleWeekly');
                await expect(page.locator('.planner-pages')).toHaveClass(claseExacta('planner-pages--weekly'));
            }

            await elegirVista(page, id);
            await expect(page.locator('.planner-pages')).toHaveClass(claseExacta(clase));
            await expect(page.locator(`#${id}`)).toHaveClass(/is-active/);
        });
    }

    test('el estilo elegido sobrevive a la recarga (lo relee initState)', async ({ page }) => {
        // Sin sembrar `planner-style`: es justo lo que este test verifica.
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-orientation': 'horizontal' });

        await elegirVista(page, 'styleMonthly');
        await expect(page.locator('.planner-pages')).toHaveClass(claseExacta('planner-pages--monthly'));
        // setStyle() escribe SÍNCRONO, sin el debounce del resto de claves.
        expect(await page.evaluate(() => localStorage.getItem('planner-style'))).toBe('monthly');

        await page.reload();
        await waitForPlannerReady(page);

        // Aquí la clase SÍ se puede assertar: la variante `-h` solo existe para el estilo
        // `planner`, que es lo que el spec viejo esquivaba no recargando.
        await expect(page.locator('.planner-pages')).toHaveClass(claseExacta('planner-pages--monthly'));
        // La pastilla activa vive dentro de Config: hay que abrirlo para verla.
        await page.locator('#configBtn').click();
        await expect(page.locator('#styleMonthly')).toHaveClass(/is-active/);
        await expect(page.locator('#stylePlanner')).not.toHaveClass(/is-active/);
    });
});

// ─── Atajos de teclado ←/→
//     El handler tiene DOS guardas y el spec viejo no probaba ninguna: la de foco editable y la
//     de panel abierto, que además retorna ANTES — por eso van en tests separados.

test.describe('Planner — Atajos de teclado', () => {
    test('→ avanza de mes y ← lo devuelve', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);

        const cabecera = page.locator('#page1 .ph-header__month');
        await expect(cabecera).toBeVisible();
        const inicial = (await cabecera.innerText()).trim();

        await page.keyboard.press('ArrowRight');
        await expect(cabecera).not.toHaveText(inicial);

        await page.keyboard.press('ArrowLeft');
        await expect(cabecera).toHaveText(inicial);
    });

    test('con un panel abierto ←/→ no navegan; al cerrarlo vuelven a navegar', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);

        const cabecera = page.locator('#page1 .ph-header__month');
        await expect(cabecera).toBeVisible();
        const inicial = (await cabecera.innerText()).trim();

        await page.locator('#configBtn').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await expect(page.locator('#configBtn')).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('ArrowRight');
        await expect(cabecera).toHaveText(inicial);

        // Control positivo: sin él, «no cambió» pasaría también si la tecla nunca llegase.
        await page.keyboard.press('Escape');
        await expect(page.locator('#configPanel')).toBeHidden();
        await page.keyboard.press('ArrowRight');
        await expect(cabecera).not.toHaveText(inicial);
    });

    test('con Temas, Mis planners o el modal de descarga abiertos ←/→ tampoco navegan', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);

        const cabecera = page.locator('#page1 .ph-header__month');
        await expect(cabecera).toBeVisible();
        const inicial = (await cabecera.innerText()).trim();

        // La guarda enumeraba Config, Diseño y Textos: con estos dos el mes cambiaba por detrás del panel.
        for (const { boton, panel } of [
            { boton: '#btnTemas', panel: '#temasPanel' },
            { boton: '#btnGuardados', panel: '#savedPanel' },
        ]) {
            await page.locator(boton).click();
            await expect(page.locator(panel)).toBeVisible();
            await page.keyboard.press('ArrowRight');
            await expect(cabecera).toHaveText(inicial);
            await page.keyboard.press('Escape');
            await expect(page.locator(panel)).toBeHidden();
        }

        await page.locator('#exportBtn').click();
        await expect(page.locator('#exportModal')).toHaveClass(/is-open/);
        await page.keyboard.press('ArrowRight');
        await expect(cabecera).toHaveText(inicial);
        await page.locator('#closeExportModal').click();
        await expect(page.locator('#exportModal')).not.toHaveClass(/is-open/);

        // Control positivo: sin nada abierto, la misma tecla sí navega.
        await page.keyboard.press('ArrowRight');
        await expect(cabecera).not.toHaveText(inicial);
    });

    test('con el foco en un input ←/→ no navegan', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);

        const cabecera = page.locator('#page1 .ph-header__month');
        await expect(cabecera).toBeVisible();
        const inicial = (await cabecera.innerText()).trim();

        // El guard de foco va ANTES que el de panel, pero casi todo input del editor vive en un panel que
        // el de panel también corta: con uno de ellos el test pasaría sin el de foco. De ahí el input suelto.
        await page.evaluate(() => {
            const el = document.createElement('input');
            el.type = 'text';
            el.id = 'e2eProbeInput';
            document.getElementById('app')?.appendChild(el);
        });
        const probe = page.locator('#e2eProbeInput');
        await probe.focus();
        await page.keyboard.press('ArrowRight');
        await expect(cabecera).toHaveText(inicial);

        // Control positivo: misma tecla, sin el input enfocado → sí navega.
        await probe.evaluate((el) => {
            el.blur();
            el.remove();
        });
        await page.keyboard.press('ArrowRight');
        await expect(cabecera).not.toHaveText(inicial);
    });
});

// ─── Idioma (ciclo es→en→de)
// Config VIRGEN a propósito: sin textos, hasTranslatableTexts() es false y el cambio es
// instantáneo, sin tocar la red.

test.describe('Planner — Cambio de idioma', () => {
    test('el toggle recorre ES → EN → DE → ES y el idioma sobrevive a la recarga', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);

        const label = page.locator('#langLabel');
        await expect(label).toHaveText('ESP');
        await expect(label).toHaveClass(/lang-badge--es/);

        await pulsarIdioma(page);
        await expect(label).toHaveText('ENG');
        await expect(label).toHaveClass(/lang-badge--en/);
        await expect.poll(() => page.evaluate(() => localStorage.getItem('planner-lang'))).toBe('en');

        // initLang() relee la clave al arrancar: sin recarga esa mitad del contrato no se toca.
        await page.reload();
        await waitForPlannerReady(page);
        await expect(label).toHaveText('ENG');

        await pulsarIdioma(page);
        await expect(label).toHaveText('DEU');
        await expect.poll(() => page.evaluate(() => localStorage.getItem('planner-lang'))).toBe('de');

        await pulsarIdioma(page);
        await expect(label).toHaveText('ESP');
        await expect.poll(() => page.evaluate(() => localStorage.getItem('planner-lang'))).toBe('es');
    });
});

// ─── Persistencia: escritura diferida + flush al ocultar la pestaña

test.describe('Planner — Persistencia localStorage', () => {
    test('visibilitychange:hidden fuerza el flush de una escritura DIFERIDA', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);

        const res = await page.evaluate(async () => {
            const url =
                performance
                    .getEntriesByType('resource')
                    .map((r) => r.name)
                    .find((u) => u.includes('planner-state.ts')) || '/js/planner-state.ts';
            const state = await import(/* @vite-ignore */ url);
            const key = state.getPlannerOrientation() === 'horizontal' ? 'planner-a4-config' : 'planner-a5-config';
            const pc = state.getPlannerConfig();
            pc.sectionTexts = { goals: { text: 'FLUSH-E2E', color: '' } };
            state.setPlannerConfig(pc);
            const antes = localStorage.getItem(key) || '';
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
            return { antes, despues: localStorage.getItem(key) || '' };
        });

        expect(res.antes, 'si ya estaba escrito, el debounce desapareció y el flush no prueba nada').not.toContain(
            'FLUSH-E2E'
        );
        expect(res.despues).toContain('FLUSH-E2E');
    });
});

// ─── «Limpiar» reversible con «Restaurar»
//     Sin `page.on('dialog')`: clearContent() NO llama a confirm() en ningún punto.
const SKIP_TEXTOS = 'el flujo Textos+mini-editor de escritorio; el móvil lo cubren los M* del spec del mini-editor';

// Fechas del mes VISIBLE (el de hoy, lo fija initState) y de otro a seis meses: mismo año, otro
// trimestre y lejos de las celdas overflow de la mensual, así que ninguna vista lo pinta.
async function sembrarDosMeses(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ vista) {
    await page.goto(PLANNER_URL);
    const k = await page.evaluate(() => {
        const hoy = new Date();
        const y = hoy.getFullYear();
        const m = hoy.getMonth() + 1;
        const otro = m <= 6 ? m + 6 : m - 6;
        const f = (/** @type {number} */ mes, /** @type {string} */ dia) =>
            `${y}-${String(mes).padStart(2, '0')}-${dia}`;
        return { y, vis: f(m, '15'), visVac: f(m, '10'), otro: f(otro, '15'), otroVac: f(otro, '10') };
    });
    await gotoPlannerSeeded(page, PLANNER_URL, {
        'planner-style': vista,
        'planner-cell-texts': JSON.stringify({
            [k.vis]: { text: 'VISIBLE-E2E', vacation: false },
            [k.otro]: { text: 'OTRO-MES-E2E', vacation: false },
        }),
        [`planner-vacation-${k.y}`]: JSON.stringify([k.visVac, k.otroVac]),
    });
    return k;
}

/** Claves del almacén único de textos y vacaciones del año, ordenadas. Escritura debounced: usar con poll. */
async function almacen(/** @type {import('@playwright/test').Page} */ page, /** @type {number} */ y) {
    return page.evaluate((year) => {
        const textos = Object.keys(JSON.parse(localStorage.getItem('planner-cell-texts') || '{}'));
        const libres = JSON.parse(localStorage.getItem(`planner-vacation-${year}`) || '[]');
        return { textos: textos.sort(), libres: [...libres].sort() };
    }, y);
}

test.describe('Planner — Limpiar / Restaurar', () => {
    test('Limpiar borra el texto de la sección y Restaurar lo devuelve', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        const guards = setupGuards(page);
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_CON_TEXTO);

        // renderSectionText() solo emite el span si hay texto: su presencia/ausencia ES el oráculo
        // de limpiado, sin depender de estilos.
        const texto = page.locator('#page1 .planner-section-text[data-section="goals"]');
        await expect(texto).toHaveText(SEMILLA);

        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await expect(page.locator('#contentRestoreBtn')).toBeDisabled();
        // En el organizador lo que se ve es todo lo que hay: el botón conserva «Limpiar».
        await expect(page.locator('#contentClearBtn')).toHaveAttribute('data-i18n-title', 'contentClearTooltip');

        await page.locator('#contentClearBtn').click();
        await expect(texto).toHaveCount(0);
        await expect(page.locator('#contentRestoreBtn')).toBeEnabled();

        await page.locator('#contentRestoreBtn').click();
        await expect(texto).toHaveText(SEMILLA);
        await expect(page.locator('#contentRestoreBtn')).toBeDisabled();

        expect(guards.consoleErrors).toEqual([]);
    });

    test('Limpiar + Guardar persiste el borrado tras recargar', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_CON_TEXTO);

        const texto = page.locator('#page1 .planner-section-text[data-section="goals"]');
        await expect(texto).toHaveText(SEMILLA);

        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await page.locator('#contentClearBtn').click();
        await expect(texto).toHaveCount(0);

        // Cerrar por el botón del panel: con Textos abierto el toolbar lleva `is-blocked`.
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();

        // Debounce de 250 ms: sin poll, el reload puede adelantarse al setItem.
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const raw = localStorage.getItem('planner-a4-config');
                    return raw ? Object.keys(JSON.parse(raw).sectionTexts || {}).length : -1;
                })
            )
            .toBe(0);

        await page.reload();
        await waitForPlannerReady(page);
        // El fieldset confirma que la página SÍ se pintó: si no, el count 0 no diría nada.
        await expect(page.locator('#page1 fieldset[data-section="goals"]')).toHaveCount(1);
        await expect(texto).toHaveCount(0);
    });

    test('Restaurar no sobrevive a la sesión: tras Limpiar + Guardar, al reabrir Textos está apagado', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_CON_TEXTO);
        const texto = page.locator('#page1 .planner-section-text[data-section="goals"]');

        await page.locator('#textToggle').click();
        await page.locator('#contentClearBtn').click();
        await expect(texto).toHaveCount(0);
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();

        // Sin el reset de openText seguiría encendido y resucitaría el texto ya borrado y guardado.
        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await expect(page.locator('#contentRestoreBtn')).toBeDisabled();
        await expect(texto).toHaveCount(0);
    });

    test('mensual: el botón dice «Limpiar todo», borra todos los meses y Restaurar los devuelve', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        const k = await sembrarDosMeses(page, 'monthly');
        const todo = { textos: [k.otro, k.vis].sort(), libres: [k.otroVac, k.visVac].sort() };

        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        // Por CLAVE y no por texto: así el test no depende del idioma y aguanta un applyI18n.
        const boton = page.locator('#contentClearBtn');
        await expect(boton).toHaveAttribute('data-i18n-title', 'contentClearAllTooltip');
        await expect(boton.locator('span[data-i18n]')).toHaveAttribute('data-i18n', 'contentClearAllLabel');

        await boton.click();
        await expect.poll(() => almacen(page, k.y)).toEqual({ textos: [], libres: [] });
        await page.locator('#contentRestoreBtn').click();
        await expect.poll(() => almacen(page, k.y)).toEqual(todo);
    });

    test('Limpiar ya no toca el permiso de traducción: se cambia en el engranaje (D7)', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, { ...SEED_CON_TEXTO, 'planner-translation-consent': 'denied' });
        const texto = page.locator('#page1 .planner-section-text[data-section="goals"]');
        await expect(texto).toHaveText(SEMILLA);
        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await page.locator('#contentClearBtn').click();
        await expect(texto).toHaveCount(0);
        expect(await page.evaluate(() => localStorage.getItem('planner-translation-consent'))).toBe('denied');
    });
});

// ─── Dark mode

test.describe('Planner — Dark mode', () => {
    test('theme-preference=dark llega al editor y no rompe el render', async ({ page }) => {
        const guards = setupGuards(page);
        // La clave es `theme-preference`. El spec viejo sembraba `theme`, que no lee nadie: la
        // página nunca llegaba a entrar en oscuro y el test pasaba sin probarlo.
        await gotoPlannerSeeded(page, PLANNER_URL, { ...SEED_H, 'theme-preference': 'dark' });

        await expect(page.locator('html')).toHaveClass(/dark-mode/);
        await expect(page.locator('#page1')).toBeVisible();
        expect(guards.consoleErrors.filter((e) => !/Failed to load resource/i.test(e))).toEqual([]);
        expect(fallosPropios(guards.failedRequests)).toEqual([]);
    });
});

test.describe('Planner — El velo también tapa para el teclado', () => {
    test('con un panel abierto la barra queda `inert`, y vuelve al cerrarlo', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'en móvil la barra se oculta con el sheet abierto, no hace falta inert');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        const barra = page.locator('#plannerToolbar');
        await expect(barra).not.toHaveAttribute('inert', /.*/);

        await page.locator('#configBtn').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        // Sin esto, con Tab se llegaba al toggle de idioma y el panel abierto se quedaba a medio traducir.
        await expect(barra).toHaveAttribute('inert', '');

        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(barra).not.toHaveAttribute('inert', /.*/);
    });
});

test.describe('Planner — Con Textos abierto la barra no responde', () => {
    test('ni ratón ni teclado llegan a sus botones; Limpiar no la suelta y Cancelar sí', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'en móvil el sheet de Textos ya oculta la barra (panel-sheet.css)');
        // Tablet: la barra baja al pie y el panel flota sin taparla. En escritorio la cubre y se llegaba por teclado.
        await page.setViewportSize({ width: 900, height: 800 });
        const guards = setupGuards(page);
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_CON_TEXTO);
        const barra = page.locator('#plannerToolbar');
        const modal = page.locator('#exportModal');
        const descargar = page.locator('#exportBtn');
        await expect(barra).not.toHaveClass(/is-blocked/);

        await page.locator('#textToggle').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await expect(barra).toHaveClass(/is-blocked/);

        // Sin bloqueo, Descargar abría el modal ENCIMA del panel. `force`: el botón inerte ya no recibe el ratón.
        await descargar.click({ force: true });
        await expect(modal).not.toHaveClass(/is-open/);
        // El clic cae en la barra, que el «clic fuera» de Textos exime: el panel sigue abierto, sin cancelar.
        await expect(page.locator('#textPanel')).toBeVisible();
        const alcanzable = await descargar.evaluate((el) => {
            el.focus();
            return document.activeElement === el;
        });
        expect(alcanzable, 'un botón inerte no recibe el foco del teclado').toBe(false);

        // Limpiar sale del modo celda y vuelve a entrar: atado a esa salida, el bloqueo se soltaba aquí.
        await page.locator('#contentClearBtn').click();
        await expect(barra).toHaveClass(/is-blocked/);
        await descargar.click({ force: true });
        await expect(modal).not.toHaveClass(/is-open/);

        await page.locator('#textCancel').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        await expect(barra).not.toHaveClass(/is-blocked/);
        await descargar.click();
        await expect(modal).toHaveClass(/is-open/);
        expect(erroresDelPlanner(guards.consoleErrors)).toEqual([]);
    });

    test('abrir Textos con el teclado lleva el foco al panel, y cerrarlo lo devuelve a Textos', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile; #textToggle no está en la barra del móvil');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_CON_TEXTO);
        const panel = page.locator('#textPanel');
        const textos = page.locator('#textToggle');

        await textos.focus();
        await page.keyboard.press('Enter');
        await expect(panel).toBeVisible();
        // #textToggle se vuelve inerte con el panel abierto: sin esto el foco caía a <body>.
        await expect(panel).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
        await expect(textos).toBeFocused();

        await page.keyboard.press('Enter');
        await expect(panel).toBeFocused();
        await page.locator('#textSave').focus();
        await page.keyboard.press('Enter');
        await expect(panel).toBeHidden();
        await expect(textos).toBeFocused();
    });

    test('Config, Diseño, Temas y Mis planners también: el foco entra al abrirlos y vuelve a su botón', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile; Diseño y Mis planners no están en la barra del móvil');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_CON_TEXTO);
        for (const [boton, id] of [
            ['#configBtn', '#configPanel'],
            ['#designBtn', '#designPanel'],
            ['#btnTemas', '#temasPanel'],
            ['#btnGuardados', '#savedPanel'],
        ]) {
            const panel = page.locator(id);
            await page.locator(boton).focus();
            await page.keyboard.press('Enter');
            await expect(panel).toBeVisible();
            // Su velo vuelve `inert` la barra: sin esto el foco caía a <body>.
            await expect(panel).toBeFocused();
            // Enfocado por programa tras una tecla es :focus-visible, y el anillo rodeaba el panel entero.
            expect(await panel.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
            expect(await panel.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
            await page.keyboard.press('Escape');
            await expect(panel).toBeHidden();
            await expect(page.locator(boton)).toBeFocused();
        }

        // Guardar desde el pie también lo devuelve, y el panel reabierto por cambiar de vista no se lo lleva.
        await page.locator('#configBtn').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#configPanel')).toBeFocused();
        await page.locator('#styleWeekly').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#styleWeekly')).toHaveClass(/is-active/);
        await expect(page.locator('#styleWeekly')).toBeFocused();
        await page.locator('#configSave').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(page.locator('#configBtn')).toBeFocused();
    });
});

test.describe('Planner — Al imprimir y al exportar solo sale el folio', () => {
    test('ni la barra ni la cabecera ni el pie del sitio, y el folio no hereda el hueco de la cabecera', async ({
        page,
    }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        const barra = page.locator('#plannerToolbar');
        // `<site-header>` mide 0 de alto (su hijo es fixed): la visibilidad se mira en el hijo.
        const cabecera = page.locator('site-header .site-header');
        const pie = page.locator('site-footer');
        const hueco = () => page.evaluate(() => getComputedStyle(document.body).paddingTop);
        // Los monta un fetch: sin esperarlos, un pie aún vacío pasaría por oculto sin serlo.
        await expect(cabecera).toBeVisible();
        await expect(pie).toBeVisible();
        expect(await hueco()).not.toBe('0px');

        await page.emulateMedia({ media: 'print' });
        await expect(barra).toBeHidden();
        await expect(cabecera).toBeHidden();
        await expect(pie).toBeHidden();
        expect(await hueco(), 'con el hueco de la cabecera el folio se sale de la hoja').toBe('0px');

        await page.emulateMedia({ media: 'screen' });
        await expect(barra).toBeVisible();
        await expect(cabecera).toBeVisible();
        await expect(pie).toBeVisible();
        expect(await hueco()).not.toBe('0px');

        await page.evaluate(() => document.body.classList.add('is-exporting'));
        await expect(barra).toBeHidden();
        await page.evaluate(() => document.body.classList.remove('is-exporting'));
        await expect(barra).toBeVisible();
    });
});

// ─── Responsive

test.describe('Planner — Responsive', () => {
    test('el breakpoint y la forma del toolbar corresponden al proyecto', async ({ page }, testInfo) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        const esMovil = testInfo.project.name === 'Mobile Safari';

        const bp = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--bp').trim()
        );
        expect(bp).toBe(esMovil ? 'm' : 'd');

        // El toolbar cambia de forma en 960px, NO en los 1024/728 de `--bp`: con estos dos
        // proyectos coinciden, pero no son el mismo corte.
        const flex = await page.locator('#plannerToolbar').evaluate((el) => getComputedStyle(el).flexDirection);
        expect(flex).toBe(esMovil ? 'row' : 'column');
    });
});

// ─── Exportación

// Meses de i18n/es.json, tal cual los baja a minúsculas planner-export-modal.ts.
const MESES_ES = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
];
const MESES_EN = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
];

/** Nombre de archivo: estructura estricta, mes/año tolerantes (el planner usa `new Date()`). */
function nombreExport(/** @type {string} */ sufijo, meses = MESES_ES) {
    return new RegExp(`^planner-(${meses.join('|')})-\\d{4}-${sufijo}$`);
}

async function openExportModal(/** @type {import('@playwright/test').Page} */ page) {
    // En móvil el botón Descargar vive en el sheet «Más»; en escritorio, en la barra.
    if (await page.locator('#exportBtn').isVisible()) {
        await page.locator('#exportBtn').click();
    } else {
        await page.locator('#btnMas').click();
        await page.locator('#masDescargarRow').click();
    }
    await expect(page.locator('#exportModal')).toHaveClass(/is-open/);
    await expect(page.locator('#exportModal')).toBeVisible();
}

/** Errores del propio planner: logger.error SIEMPRE imprime con prefijo `[planner]`. */
function erroresDelPlanner(/** @type {string[]} */ consoleErrors) {
    return consoleErrors.filter((e) => e.includes('[planner]'));
}

test.describe('Planner — Export · librerías', () => {
    test('jsPDF está en window.jspdf y html-to-image no es un global', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);

        const libs = await page.evaluate(() => ({
            jsPDF: typeof (/** @type {any} */ (window.jspdf || {}).jsPDF),
            htmlToImage: typeof (/** @type {any} */ (window).htmlToImage),
        }));

        // Si jsPDF no llega, esto falla aquí en 1 s con mensaje claro en vez de disfrazarse de
        // timeout en los tests de descarga.
        expect(libs.jsPDF).toBe('function');
        // html-to-image entra por npm y la bundlea Vite: si alguien la carga con un <script>, este
        // assert lo caza.
        expect(libs.htmlToImage).toBe('undefined');
    });
});

test.describe('Planner — Export · modal', () => {
    test('exportBtn abre el modal y update() sustituye los 3 botones estáticos por 1', async ({ page }) => {
        const guards = setupGuards(page);
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);

        // El HTML trae 3 botones data-page SIN listener (markup muerto desde el split del
        // controller). update() hace innerHTML = '' y crea UNO.
        await expect(page.locator('#exportPages > button')).toHaveCount(3);

        await openExportModal(page);

        await expect(page.locator('#exportPages > button')).toHaveCount(1);
        await expect(page.locator('#exportPages > button')).toBeVisible();
        await expect(page.locator('#exportModalTitle')).toHaveText('Descargar Planificador');
        await expect(page.locator('#exportPDF')).toBeVisible();

        expect(erroresDelPlanner(guards.consoleErrors)).toEqual([]);
    });

    test('el modal es un diálogo accesible y atrapa el foco', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        await openExportModal(page);

        const modal = page.locator('#exportModal');
        await expect(modal).toHaveAttribute('role', 'dialog');
        await expect(modal).toHaveAttribute('aria-modal', 'true');
        await expect(modal).toHaveAttribute('aria-labelledby', 'exportModalTitle');

        // Antes el Tab se escapaba al lienzo y a la toolbar de detrás.
        for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
        expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    });

    test('el botón de cerrar cierra el modal', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        await openExportModal(page);

        await page.locator('#closeExportModal').click();
        await expect(page.locator('#exportModal')).not.toHaveClass(/is-open/);
        await expect(page.locator('#exportModal')).not.toBeVisible();
    });

    test('al abrirlo el foco entra solo; Escape lo cierra y devuelve el foco a Descargar', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        await openExportModal(page);
        const modal = page.locator('#exportModal');
        // Sin Tab: el trap enfoca en un setTimeout(0), y con la visibility en transición el modal no lo aceptaba.
        await expect.poll(() => modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/is-open/);
        await expect(modal).not.toBeVisible();
        await expect(page.locator('#exportBtn')).toBeFocused();
    });

    test('con estilo weekly el modal ofrece el horario, no el planner', async ({ page }) => {
        // El estilo se SIEMBRA: en móvil los botones de estilo CICLAN, así que clicarlos haría
        // el test dependiente del proyecto.
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'weekly', 'planner-orientation': 'vertical' });
        await openExportModal(page);

        await expect(page.locator('#exportModalTitle')).toHaveText('Descargar Horario');
        await expect(page.locator('#exportPages > button')).toHaveCount(1);
        // El booklet es exclusivo de planner vertical.
        await expect(page.locator('#exportBookletPDF')).toBeHidden();
    });

    test('el libro a doble cara solo existe en planner VERTICAL', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'planner', 'planner-orientation': 'vertical' });
        await openExportModal(page);
        await expect(page.locator('#exportBookletPDF')).toBeVisible();
    });

    test('en planner HORIZONTAL el botón de libro ni siquiera se crea', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        await openExportModal(page);
        await expect(page.locator('#exportBookletPDF')).toHaveCount(0);
    });
});

test.describe('Planner — Export · descargas', () => {
    test('JPG del planner vertical descarga el organizador', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'share-sheet nativo / descarga de Blob URL no determinista en WebKit');
        test.slow(); // captura a pixelRatio 3 de una A5 completa

        const guards = setupGuards(page);
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'planner', 'planner-orientation': 'vertical' });
        await openExportModal(page);

        // La captura ocupa el hilo principal casi entera, y mirar la clase desde fuera puede llegar tarde:
        // la apunta la propia página, desde antes del clic.
        await page.evaluate(() => {
            const w = /** @type {any} */ (window);
            w.__vioExportando = false;
            new MutationObserver(() => {
                if (document.body.classList.contains('is-exporting')) w.__vioExportando = true;
            }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        });

        const downloadPromise = page.waitForEvent('download', { timeout: 45000 });
        await page.locator('#exportPages > button').click();

        // setExporting(true) es síncrono al entrar → misma tarea que el click.
        await expect(page.locator('#exportModal')).not.toHaveClass(/is-open/);
        await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__vioExportando)).toBe(true);

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(nombreExport('organizador\\.jpg'));

        // El `finally` quita la clase. Si solo la quitase el WATCHDOG tardaría 30 s y este
        // assert de 15 s fallaría: es la prueba barata de que el camino normal no lo necesita.
        await expect(page.locator('body')).not.toHaveClass(/is-exporting/, { timeout: 15000 });
        expect(erroresDelPlanner(guards.consoleErrors)).toEqual([]);
    });

    test('PDF del planner horizontal descarga el organizador A4h', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'share-sheet nativo / descarga de Blob URL no determinista en WebKit');
        test.slow();

        const guards = setupGuards(page);
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        await openExportModal(page);

        const downloadPromise = page.waitForEvent('download', { timeout: 45000 });
        await page.locator('#exportPDF').click();

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(nombreExport('organizador-A4h\\.pdf'));

        await expect(page.locator('body')).not.toHaveClass(/is-exporting/, { timeout: 15000 });
        expect(erroresDelPlanner(guards.consoleErrors)).toEqual([]);
    });

    test('una captura que acaba tarde no le apaga el watchdog al export siguiente', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'share-sheet nativo / descarga de Blob URL no determinista en WebKit');
        test.slow(); // el primer export termina de verdad: captura y descarga
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'planner', 'planner-orientation': 'vertical' });
        // Cada export se queda en su primera carga de fuente hasta que el test la suelta.
        await page.evaluate(() => {
            const w = /** @type {any} */ (window);
            w.__e2eFontHolds = [];
            w.__e2eFontsLibres = false;
            Object.getPrototypeOf(document.fonts).load = () =>
                w.__e2eFontsLibres ? Promise.resolve([]) : new Promise((resolve) => w.__e2eFontHolds.push(resolve));
        });
        const retenidos = () => page.evaluate(() => /** @type {any} */ (window).__e2eFontHolds.length);
        const cuerpo = page.locator('body');
        const avisos = page.locator('#planner-toast-container .edt-toast--warning');
        const exportar = async () => {
            await openExportModal(page);
            await page.locator('#exportPages > button').click();
        };
        // Tras cargar, no antes: así solo los temporizadores del export van por el reloj falso.
        await page.clock.install();

        await exportar();
        await expect.poll(retenidos, { timeout: 15000 }).toBe(1);
        await page.clock.fastForward(31_000);
        await expect(cuerpo).not.toHaveClass(/is-exporting/);
        await expect(avisos).toHaveCount(1);
        await page.evaluate(() =>
            document.querySelectorAll('#planner-toast-container .edt-toast').forEach((n) => n.remove())
        );

        await exportar();
        await expect.poll(retenidos, { timeout: 15000 }).toBe(2);
        await expect(cuerpo).toHaveClass(/is-exporting/);

        // El primero acaba tarde, con su descarga, mientras el segundo sigue colgado.
        const descarga = page.waitForEvent('download', { timeout: 45000 });
        await page.evaluate(() => {
            const w = /** @type {any} */ (window);
            w.__e2eFontsLibres = true;
            w.__e2eFontHolds[0]();
        });
        expect((await descarga).suggestedFilename()).toMatch(nombreExport('organizador\\.jpg'));
        await expect(cuerpo).toHaveClass(/is-exporting/);

        // Y el watchdog del segundo sigue vivo: si se cuelga, avisa y suelta el editor.
        await page.clock.fastForward(31_000);
        await expect(cuerpo).not.toHaveClass(/is-exporting/);
        await expect(avisos).toHaveCount(1);
    });

    test('un cuadernillo que el watchdog soltó y acaba tarde no repinta el folio con el mes viejo', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'cambia de mes con →: teclado físico, solo escritorio');
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'planner', 'planner-orientation': 'vertical' });
        await page.evaluate(() => {
            const w = /** @type {any} */ (window);
            w.__e2eFontHolds = [];
            w.__e2eFontsLibres = false;
            Object.getPrototypeOf(document.fonts).load = () =>
                w.__e2eFontsLibres ? Promise.resolve([]) : new Promise((resolve) => w.__e2eFontHolds.push(resolve));
        });
        const retenidos = () => page.evaluate(() => /** @type {any} */ (window).__e2eFontHolds.length);
        const mes = page.locator('#page1 .p1-header__month');
        const paginas = page.locator('#plannerPages .planner-page');
        const inicial = (await mes.textContent()) || '';
        await page.clock.install();

        await openExportModal(page);
        await page.locator('#exportBookletPDF').click();
        await expect(paginas).toHaveCount(3);
        await expect.poll(retenidos, { timeout: 15000 }).toBe(1);
        await page.clock.fastForward(31_000);
        await expect(page.locator('body')).not.toHaveClass(/is-exporting/);

        // Con el editor liberado se cambia de mes, y el render deja el folio en una página.
        await page.keyboard.press('ArrowRight');
        await expect(paginas).toHaveCount(1);
        await expect(mes).not.toHaveText(inicial);
        const nuevo = (await mes.textContent()) || '';

        // Al soltarlo, sus páginas ya no están: acaba con su aviso de error y repinta. Antes lo hacía con el mes viejo.
        await page.evaluate(() => {
            const w = /** @type {any} */ (window);
            w.__e2eFontsLibres = true;
            w.__e2eFontHolds[0]();
        });
        await expect(page.locator('#planner-toast-container .edt-toast--error')).toHaveCount(1);
        await expect(paginas).toHaveCount(1);
        await expect(mes).toHaveText(nuevo);
    });

    test('un cuadernillo que acaba tarde no repinta mientras siga viva otra captura más nueva, aunque acabe una tercera', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'share-sheet nativo / descarga de Blob URL no determinista en WebKit');
        test.slow(); // dos cuadernillos de tres capturas y un JPG, de verdad
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'planner', 'planner-orientation': 'vertical' });
        await page.evaluate(() => {
            const w = /** @type {any} */ (window);
            w.__e2eFontHolds = [];
            w.__e2eFontsLibres = false;
            Object.getPrototypeOf(document.fonts).load = () =>
                w.__e2eFontsLibres ? Promise.resolve([]) : new Promise((resolve) => w.__e2eFontHolds.push(resolve));
        });
        const retenidos = () => page.evaluate(() => /** @type {any} */ (window).__e2eFontHolds.length);
        const soltar = (/** @type {number} */ i) =>
            page.evaluate((n) => {
                const w = /** @type {any} */ (window);
                w.__e2eFontsLibres = true;
                w.__e2eFontHolds[n]();
            }, i);
        const paginas = page.locator('#plannerPages .planner-page');
        const cuerpo = page.locator('body');
        const cuadernillo = async () => {
            await openExportModal(page);
            await page.locator('#exportBookletPDF').click();
        };
        await page.clock.install();

        // Dos cuadernillos colgados que el watchdog suelta: el 1 y el 2 siguen vivos.
        for (const n of [1, 2]) {
            await cuadernillo();
            await expect.poll(retenidos, { timeout: 15000 }).toBe(n);
            await page.clock.fastForward(31_000);
            await expect(cuerpo).not.toHaveClass(/is-exporting/);
        }
        await expect(paginas).toHaveCount(3);

        // Un JPG acaba entero: ya no es la captura más reciente la que está viva, pero el 2 sí lo está.
        await page.evaluate(() => {
            /** @type {any} */ (window).__e2eFontsLibres = true;
        });
        await openExportModal(page);
        const jpg = page.waitForEvent('download', { timeout: 45000 });
        await page.locator('#exportPages > button').click();
        expect((await jpg).suggestedFilename()).toMatch(nombreExport('organizador\\.jpg'));

        // Acaba el 1: con el 2 aún capturando, su repintado (a una página) espera.
        const primero = page.waitForEvent('download', { timeout: 45000 });
        await soltar(0);
        expect((await primero).suggestedFilename()).toMatch(nombreExport('doble-cara\\.pdf'));
        await page.evaluate(() => 0);
        await expect(paginas).toHaveCount(3);

        // Acaba el 2 y ya no queda ninguna más nueva: repinta.
        const segundo = page.waitForEvent('download', { timeout: 45000 });
        await soltar(1);
        expect((await segundo).suggestedFilename()).toMatch(nombreExport('doble-cara\\.pdf'));
        await expect(paginas).toHaveCount(1);
    });
});

test.describe('Planner — Restablecer en la semanal', () => {
    test('vuelve a la semana 1, Cancelar la deshace y el JPG ya no sale «semana0»', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'navega con ←/→ y descarga un Blob: teclado físico y descarga, solo escritorio');
        test.slow(); // captura del horario con html-to-image
        // Sin reloj fijo: el de Playwright vacía performance.getEntriesByType y la sonda no vería el módulo.
        const guards = setupGuards(page);
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'weekly' });
        const semana = () =>
            page.evaluate(
                async (expr) => (await import(/* @vite-ignore */ eval(expr))).getWeek(),
                urlModulo('planner-state.ts')
            );
        expect(await semana()).toBe(1);

        // Todo mes tiene al menos 4 semanas: la 3 existe siempre y no es la de arranque.
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await expect.poll(semana).toBe(3);

        await page.locator('#configBtn').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await page.locator('#configReset').click();
        await expect.poll(semana).toBe(1);
        // Restablecer es borrador también para la semana, como el periodo de la mensual y la trimestral.
        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect.poll(semana).toBe(3);

        await page.locator('#configBtn').click();
        await page.locator('#configReset').click();
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect.poll(semana).toBe(1);

        await openExportModal(page);
        const descarga = page.waitForEvent('download', { timeout: 45000 });
        await page.locator('#exportPages > button').click();
        expect((await descarga).suggestedFilename()).toMatch(nombreExport('semana1\\.jpg'));
        await expect(page.locator('body')).not.toHaveClass(/is-exporting/, { timeout: 15000 });
        expect(erroresDelPlanner(guards.consoleErrors)).toEqual([]);
    });
});

// ─── Semanal: los textos se guardan por «día-franja», así que borrar una franja los tiene que mover

const SEED_FRANJAS = {
    'planner-style': 'weekly',
    'planner-week-config': JSON.stringify({
        days: [0, 1, 2, 3, 4],
        hours: ['8:00', '9:30', '11:30', '13:00', '15:00', '16:30'],
        cellTexts: {
            '0-0': { text: 'Lunes 8:00' },
            '0-1': { text: 'Lunes 9:30' },
            '0-2': { text: 'Lunes 11:30' },
            '2-3': { text: 'Miércoles 13:00' },
            '2-5': { text: 'Miércoles 16:30' },
        },
    }),
};

function textoCelda(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ clave) {
    return page.locator(`.pw-table__cell[data-cell="${clave}"] .pw-table__cell-text`);
}

async function clavesSemanal(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate(async (expr) => {
        const state = await import(/* @vite-ignore */ eval(expr));
        return Object.keys(state.getWeekConfig().cellTexts).sort();
    }, urlModulo('planner-state.ts'));
}

function borrarFranja(/** @type {import('@playwright/test').Page} */ page, /** @type {number} */ n) {
    return page.locator('#hoursInputs .planner-config__hour-row--deletable .planner-config__hour-label').nth(n).click();
}

test.describe('Planner — Semanal: cada texto va con su franja', () => {
    test('borrar una franja se lleva sus textos y sube los de debajo; Guardar es UNA acción de Deshacer', async ({
        page,
    }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_FRANJAS);
        const horas = page.locator('.pw-table__hour');
        await expect(horas).toHaveCount(6);
        await expect(textoCelda(page, '0-1')).toHaveText('Lunes 9:30');

        await page.locator('#configBtn').click();
        await expect(page.locator('#configWeekly')).toBeVisible();
        await borrarFranja(page, 1);
        await expect(horas).toHaveCount(5);
        await expect(horas.nth(1)).toHaveText('11:30');
        await expect(textoCelda(page, '0-0')).toHaveText('Lunes 8:00');
        await expect(textoCelda(page, '0-1')).toHaveText('Lunes 11:30');
        await expect(textoCelda(page, '2-2')).toHaveText('Miércoles 13:00');
        await expect(textoCelda(page, '2-4')).toHaveText('Miércoles 16:30');
        await expect(page.locator('.pw-table__cell-text', { hasText: 'Lunes 9:30' })).toHaveCount(0);

        // Una franja nueva nace vacía: con la clave «2-5» sin mover, el texto de la última reaparecía en ella.
        await page.locator('#hoursInputs .planner-config__hour-preview').click();
        await expect(horas).toHaveCount(6);
        await expect(page.locator('.pw-table__row').nth(5).locator('.pw-table__cell-text')).toHaveCount(0);

        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        expect(await clavesSemanal(page)).toEqual(['0-0', '0-1', '2-2', '2-4']);

        await page.locator('#btnUndo').click();
        await expect(horas).toHaveCount(6);
        await expect(horas.nth(1)).toHaveText('9:30');
        await expect(textoCelda(page, '0-1')).toHaveText('Lunes 9:30');
        await expect(textoCelda(page, '2-5')).toHaveText('Miércoles 16:30');
        expect(await clavesSemanal(page)).toEqual(['0-0', '0-1', '0-2', '2-3', '2-5']);

        await page.locator('#btnRedo').click();
        await expect(horas).toHaveCount(6);
        await expect(textoCelda(page, '0-1')).toHaveText('Lunes 11:30');
    });

    test('Cancelar devuelve franjas y textos; quitar un día no mueve los textos de los demás', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_FRANJAS);
        await page.locator('#configBtn').click();
        await expect(page.locator('#configWeekly')).toBeVisible();

        // Van por día de la SEMANA, no por columna: sin el lunes, el miércoles cambia de columna y no de clave.
        const lunes = page.locator('#daysPills .planner-config__pill').first();
        await lunes.click();
        await expect(textoCelda(page, '0-0')).toHaveCount(0);
        await expect(textoCelda(page, '2-3')).toHaveText('Miércoles 13:00');
        await lunes.click();
        await expect(textoCelda(page, '0-0')).toHaveText('Lunes 8:00');

        await borrarFranja(page, 0);
        await expect(textoCelda(page, '0-0')).toHaveText('Lunes 9:30');
        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(page.locator('.pw-table__hour')).toHaveCount(6);
        await expect(textoCelda(page, '0-0')).toHaveText('Lunes 8:00');
        expect(await clavesSemanal(page)).toEqual(['0-0', '0-1', '0-2', '2-3', '2-5']);
    });
});

// ─── Oráculo del dataset de festivos

// Se importa el módulo en vez de contar celdas: el mensual pinta UN mes y mezcla festivos con
// vacaciones.

async function holidaysModuleUrl(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate(
        () =>
            performance
                .getEntriesByType('resource')
                .map((r) => r.name)
                .find((u) => u.includes('planner-holidays.ts')) ?? null
    );
}

async function openPlannerForHolidays(/** @type {import('@playwright/test').Page} */ page) {
    // El buffer de resource-timing son 250 entradas y el planner carga ~120 recursos en dev:
    // si desbordara, la URL del módulo desaparecería sin dar error.
    await page.addInitScript(() => performance.setResourceTimingBufferSize(1000));
    await page.goto(PLANNER_URL);
    await waitForPlannerReady(page);
    await expect
        .poll(() => holidaysModuleUrl(page), {
            message: 'la app ya no carga planner-holidays.ts (import muerto o modulo renombrado)',
        })
        .not.toBeNull();
    return /** @type {string} */ (await holidaysModuleUrl(page));
}

/** Serializa getHolidays() a filas "M-D|nombre|tipo[|codigo]" ordenadas por fecha. */
async function holidayRows(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {string} */ modUrl,
    /** @type {number} */ year,
    /** @type {object} */ options
) {
    return page.evaluate(
        async ({ url, y, opts }) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            const rows = [...mod.getHolidays(y, opts).entries()].map(([key, v]) => ({ key, v }));
            rows.sort((a, b) => {
                const [am, ad] = a.key.split('-').map(Number);
                const [bm, bd] = b.key.split('-').map(Number);
                return am - bm || ad - bd;
            });
            return rows.map(({ key, v }) => {
                const code = v.ccaaCode || v.provinceCode || '';
                return `${key}|${v.name}|${v.type}${code ? '|' + code : ''}`;
            });
        },
        { url: modUrl, y: year, opts: options }
    );
}

test.describe('Planner — Oráculo de festivos', () => {
    test('nacionales de 2026: los 10 de la tabla, Viernes Santo incluido', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        // Pascua 2026 = 5-abr → Viernes Santo 3-abr.
        expect(await holidayRows(page, modUrl, 2026, { national: true })).toEqual([
            '0-1|Año Nuevo|national',
            '0-6|Reyes|national',
            '3-3|Viernes Santo|national',
            '4-1|Día del Trabajo|national',
            '7-15|Asunción|national',
            '9-12|Fiesta Nacional|national',
            '10-1|Todos los Santos|national',
            '11-6|Constitución|national',
            '11-8|Inmaculada|national',
            '11-25|Navidad|national',
        ]);
    });

    test('Andalucia 2026: Jueves Santo movil y traslado de domingo a lunes', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        // El traslado andaluz es DATO del año, no regla: el lunes es una entrada más
        // de la capa AND, y el domingo original sigue marcado (que también es verdad).
        expect(await holidayRows(page, modUrl, 2026, { national: true, ccaa: 'AND' })).toEqual([
            '0-1|Año Nuevo|national',
            '0-6|Reyes|national',
            '1-28|Día de Andalucía|ccaa|AND',
            '3-2|Jueves Santo|ccaa|AND',
            '3-3|Viernes Santo|national',
            '4-1|Día del Trabajo|national',
            '7-15|Asunción|national',
            '9-12|Fiesta Nacional|national',
            '10-1|Todos los Santos|national',
            '10-2|Todos los Santos (trasladado)|ccaa|AND',
            '11-6|Constitución|national',
            '11-7|Constitución (trasladado)|ccaa|AND',
            '11-8|Inmaculada|national',
            '11-25|Navidad|national',
        ]);
    });

    test('Madrid 2026: San Isidro y la Almudena entran y la capa capital nunca se traslada', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        expect(await holidayRows(page, modUrl, 2026, { national: false, province: 'MAD-MA' })).toEqual([
            '4-15|San Isidro|capital|MAD-MA',
            '10-9|Almudena|capital|MAD-MA',
        ]);
        // Con el diff oficial 2026 Madrid TAMBIÉN tiene los dos lunes trasladados;
        // la Almudena (9-nov, capa capital) se queda quieta — las fiestas locales no se trasladan.
        expect(await holidayRows(page, modUrl, 2026, { national: true, ccaa: 'MAD', province: 'MAD-MA' })).toEqual([
            '0-1|Año Nuevo|national',
            '0-6|Reyes|national',
            '3-2|Jueves Santo|ccaa|MAD',
            '3-3|Viernes Santo|national',
            '4-1|Día del Trabajo|national',
            '4-2|Dos de Mayo|ccaa|MAD',
            '4-15|San Isidro|capital|MAD-MA',
            '7-15|Asunción|national',
            '9-12|Fiesta Nacional|national',
            '10-1|Todos los Santos|national',
            '10-2|Todos los Santos (trasladado)|ccaa|MAD',
            '10-9|Almudena|capital|MAD-MA',
            '11-6|Constitución|national',
            '11-7|Constitución (trasladado)|ccaa|MAD',
            '11-8|Inmaculada|national',
            '11-25|Navidad|national',
        ]);
    });

    test('los traslados de domingo 2026 alcanzan EXACTAMENTE a los territorios del BOE', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        // BOE-A-2025-21667: 2-nov en 9 CCAA y 7-dic en 10.
        const censo = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            const nov = [];
            const dic = [];
            for (const { code } of mod.getCCAAList()) {
                const m = mod.getHolidays(2026, { national: false, ccaa: code });
                if (m.has('10-2')) nov.push(code);
                if (m.has('11-7')) dic.push(code);
            }
            const bal = mod.getHolidays(2026, { national: false, ccaa: 'BAL' }).get('2-2')?.name ?? null;
            return { nov: nov.sort(), dic: dic.sort(), bal };
        }, modUrl);

        expect(censo.nov).toEqual(['AND', 'ARA', 'AST', 'CAN', 'CLM', 'CYL', 'EXT', 'MAD', 'NAV']);
        expect(censo.dic).toEqual(['AND', 'ARA', 'AST', 'CNT', 'CYL', 'EXT', 'MAD', 'MEL', 'MUR', 'RIO']);
        expect(censo.bal).toBe('Día de Baleares (trasladado)');
    });

    test('la capa autonómica 2026 es el anexo ENTERO del BOE, territorio a territorio', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        // BOE-A-2025-21667: cada *** y cada ** que no esté en la capa nacional. La única fecha que no sale
        // de allí es el 1-mar balear, domingo, que se marca además de su lunes (como 1-nov y 6-dic).
        const BOE_2026 = {
            AND: ['1-28', '3-2', '10-2', '11-7'],
            ARA: ['3-2', '3-23', '10-2', '11-7'],
            AST: ['3-2', '8-8', '10-2', '11-7'],
            BAL: ['2-1', '2-2', '3-2', '3-6', '11-26'],
            CAN: ['3-2', '4-30', '10-2'],
            CNT: ['3-2', '6-28', '8-15', '11-7'],
            CLM: ['3-2', '3-6', '5-4', '10-2'],
            CYL: ['3-2', '3-23', '10-2', '11-7'],
            CAT: ['3-6', '5-24', '8-11', '11-26'],
            EXT: ['3-2', '8-8', '10-2', '11-7'],
            GAL: ['2-19', '3-2', '5-24', '6-25'],
            MAD: ['3-2', '4-2', '10-2', '11-7'],
            MUR: ['2-19', '3-2', '5-9', '11-7'],
            NAV: ['2-19', '3-2', '3-6', '10-2'],
            PVA: ['2-19', '3-2', '3-6', '6-25'],
            RIO: ['3-2', '3-6', '5-9', '11-7'],
            VAL: ['2-19', '3-6', '5-24', '9-9'],
            CEU: ['3-2', '4-27', '7-5', '8-2'],
            MEL: ['2-20', '3-2', '4-27', '11-7'],
        };
        const res = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            /** @type {Record<string, string[]>} */
            const capa = {};
            /** @type {string[]} */
            const sinNombre = [];
            for (const { code } of mod.getCCAAList()) {
                const m = mod.getHolidays(2026, { national: false, ccaa: code });
                capa[code] = [...m.keys()].sort((a, b) => {
                    const [am, ad] = a.split('-').map(Number);
                    const [bm, bd] = b.split('-').map(Number);
                    return am - bm || ad - bd;
                });
                for (const v of m.values()) if (v.name === v.id) sinNombre.push(`${code}:${v.id}`);
            }
            return { capa, sinNombre };
        }, modUrl);

        expect(res.capa).toEqual(BOE_2026);
        // Un id sin entrada en HOLIDAY_NAMES no da error: sale crudo en el folio («la-bien-aparecida»).
        expect(res.sinNombre).toEqual([]);
    });

    test('la capa capital 2026 son las DOS fiestas locales de cada capital, según su boletín', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        const BOLETINES_2026 = {
            'AND-AL': ['2026-06-24', '2026-08-29'],
            'AND-CA': ['2026-02-16', '2026-10-07'],
            'AND-CO': ['2026-09-08', '2026-10-24'],
            'AND-GR': ['2026-01-02', '2026-06-04'],
            'AND-HU': ['2026-08-03', '2026-09-08'],
            'AND-JA': ['2026-06-11', '2026-11-25'],
            'AND-MA': ['2026-08-19', '2026-09-08'],
            'AND-SE': ['2026-04-22', '2026-06-04'],
            'ARA-HU': ['2026-01-22', '2026-08-10'],
            'ARA-TE': ['2026-04-07', '2026-07-13'],
            'ARA-ZA': ['2026-01-29', '2026-03-05'],
            'CYL-AV': ['2026-05-02', '2026-10-15'],
            'CYL-BU': ['2026-06-12', '2026-06-29'],
            'CYL-LE': ['2026-06-24', '2026-10-05'],
            'CYL-SA': ['2026-06-12', '2026-09-08'],
            'CYL-VA': ['2026-05-13', '2026-09-08'],
            'CAT-BA': ['2026-05-25', '2026-09-24'],
            'CAT-GI': ['2026-07-25', '2026-10-29'],
            'CAT-TA': ['2026-08-19', '2026-09-23'],
            'CAT-LL': ['2026-05-11', '2026-09-29'],
            'VAL-AL': ['2026-04-16', '2026-06-23'],
            'VAL-CS': ['2026-03-09', '2026-06-29'],
            'VAL-VA': ['2026-01-22', '2026-04-13'],
            'GAL-CO': ['2026-02-17', '2026-10-07'],
            'GAL-PO': ['2026-02-18', '2026-07-11'],
            'MAD-MA': ['2026-05-15', '2026-11-09'],
            'MUR-MU': ['2026-04-07', '2026-09-15'],
            'MEL-ME': ['2026-09-08', '2026-09-17'],
            'PVA-BI': ['2026-07-31', '2026-08-28'],
            'PVA-SS': ['2026-01-20', '2026-07-31'],
            'PVA-VI': ['2026-04-28', '2026-08-05'],
        };
        const claveDelMap = (/** @type {string} */ iso) => {
            const [, mes, dia] = iso.split('-').map(Number);
            return `${mes - 1}-${dia}`;
        };
        const esperado = Object.fromEntries(
            Object.entries(BOLETINES_2026).map(([code, fechas]) => [code, fechas.map(claveDelMap)])
        );

        const res = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            /** @type {Record<string, string[]>} */
            const capa = {};
            /** @type {string[]} */
            const sinNombre = [];
            /** @type {string[]} */
            const tapadas = [];
            for (const { code } of mod.getProvinceList('__ALL__')) {
                const m = mod.getHolidays(2026, { national: false, province: code });
                capa[code] = [...m.keys()].sort((a, b) => {
                    const [am, ad] = a.split('-').map(Number);
                    const [bm, bd] = b.split('-').map(Number);
                    return am - bm || ad - bd;
                });
                for (const v of m.values()) if (!v.name || v.name === v.id) sinNombre.push(`${code}:${v.id}`);
                // Con su comunidad puesta, el nacional y el autonómico entran antes y darían el nombre del día.
                const conSuCcaa = mod.getHolidays(2026, { national: true, ccaa: code.split('-')[0], province: code });
                for (const key of m.keys()) {
                    const v = conSuCcaa.get(key);
                    if (v.type !== 'capital') tapadas.push(`${code}:${key}→${v.id}`);
                }
            }
            const nombre = (/** @type {string} */ code, /** @type {string} */ key) =>
                mod.getHolidays(2026, { national: false, province: code }).get(key)?.name;
            // Los tres que antes llevaban el nombre de la feria y no el del boletín; el de Málaga, acortado para la celda.
            const nombres = [nombre('AND-MA', '7-19'), nombre('AND-JA', '5-11'), nombre('MUR-MU', '8-15')];
            return { capa, sinNombre, tapadas, nombres };
        }, modUrl);

        expect(res.nombres).toEqual(['Incorporación a Castilla', 'Virgen de la Capilla', 'Romería de la Fuensanta']);
        expect(res.capa).toEqual(esperado);
        expect(Object.values(res.capa).flat()).toHaveLength(62);
        expect(res.sinNombre).toEqual([]);
        // Ninguna local de 2026 cae en un festivo de su comunidad: si pasara, su nombre no se vería en el folio.
        expect(res.tapadas).toEqual([]);
    });

    test('Melilla 2026: el Día de Melilla es fiesta LOCAL (capa capital), no autonómica', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        expect(await holidayRows(page, modUrl, 2026, { national: false, province: 'MEL-ME' })).toEqual([
            '8-8|Virgen de la Victoria|capital|MEL-ME',
            '8-17|Día de Melilla|capital|MEL-ME',
        ]);
        // getHolidays no mira CAPITAL_META: sin su entrada, el selector de provincia no ofrecería Melilla.
        const provincias = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            return mod.getProvinceList('MEL').map((/** @type {{code: string}} */ p) => p.code);
        }, modUrl);
        expect(provincias).toEqual(['MEL-ME']);
    });

    test('con «Todos los festivos», la capital elegida no la tapa la fiesta de otra comunidad', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        // El 15-sep es La Bien Aparecida (Cantabria) y la Romería de la Fuensanta: gana la capital elegida.
        // El 2-may de Ávila es el Dos de Mayo de Madrid, y el 25-jul de Girona, el Santiago de Galicia y el País Vasco.
        const res = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            const dia = (/** @type {string} */ province, /** @type {string} */ key) => {
                const v = mod.getHolidays(2026, { national: true, ccaa: '__ALL__', province }).get(key);
                return `${v?.id}|${v?.provinceCode ?? v?.ccaaCode}`;
            };
            return { murcia: dia('MUR-MU', '8-15'), avila: dia('CYL-AV', '4-2'), girona: dia('CAT-GI', '6-25') };
        }, modUrl);
        expect(res).toEqual({
            murcia: 'romeria-de-la-fuensanta|MUR-MU',
            avila: 'san-segundo|CYL-AV',
            girona: 'santiago-apostol|CAT-GI',
        });
    });

    test('el censo de CCAA y de capitales no encoge sin que se vea', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        const censo = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            return {
                ccaa: mod.getCCAAList().map((/** @type {{code: string}} */ e) => e.code),
                cat: mod.getProvinceList('CAT').map((/** @type {{code: string}} */ e) => e.code),
                etiquetas: ['MAD-MA', 'MUR-MU', 'PVA-BI', 'PVA-SS', 'PVA-VI'].map(mod.getProvinceName),
            };
        }, modUrl);

        // Ordenamos NOSOTROS por código: el módulo ordena por NOMBRE con localeCompare('es') y
        // la colación de Chromium y la de WebKit no coinciden → assertar ese orden sería flaky.
        expect([...censo.ccaa].sort()).toEqual([
            'AND',
            'ARA',
            'AST',
            'BAL',
            'CAN',
            'CAT',
            'CEU',
            'CLM',
            'CNT',
            'CYL',
            'EXT',
            'GAL',
            'MAD',
            'MEL',
            'MUR',
            'NAV',
            'PVA',
            'RIO',
            'VAL',
        ]);
        expect([...censo.cat].sort()).toEqual(['CAT-BA', 'CAT-GI', 'CAT-LL', 'CAT-TA']);
        // La etiqueta es la CAPITAL; el código no cambia porque viaja en los guardados y en los códigos PLN1.
        // Madrid y Murcia llevan «capital»: a secas, el prefijo del folio sería el mismo que el de su comunidad.
        // Y PVA-SS es «Donostia»: con «San Sebastián», el 20-ene salía «San Sebastián: San Sebastián».
        expect(censo.etiquetas).toEqual(['Madrid capital', 'Murcia capital', 'Bilbao', 'Donostia', 'Vitoria-Gasteiz']);
    });

    test('un año fuera de la ventana devuelve VACÍO, no un calendario inventado', async ({ page }) => {
        const modUrl = await openPlannerForHolidays(page);
        // El Computus respondía a cualquier año con fechas plausibles y falsas; ahora solo hay
        // festivos para los años estampados en HOLIDAYS_BY_YEAR.
        const res = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            return {
                y2031: mod.getHolidays(2031, { national: true, ccaa: '__ALL__', province: '__ALL__' }).size,
                y2025: mod.getHolidays(2025, { national: true }).size,
                has2026: mod.hasHolidayData(2026),
                has2031: mod.hasHolidayData(2031),
            };
        }, modUrl);
        expect(res).toEqual({ y2031: 0, y2025: 0, has2026: true, has2031: false });
    });
});

// ─── Festivos que caen el mismo día: la celda pinta el primero y «+N», y el title los lista todos

/** El 8-sep de 2026 con CCAA y capital en «Todos», en el orden en que entran en getHolidays. */
const OCHO_SEP_TODOS = [
    'Asturias: Día de Asturias',
    'Extremadura: Día Extremadura',
    'Córdoba: Virgen de la Fuensanta',
    'Huelva: La Cinta',
    'Málaga: Virgen de la Victoria',
    'Salamanca: Virgen de la Vega',
    'Valladolid: Virgen de San Lorenzo',
    'Melilla: Virgen de la Victoria',
];
const TODOS = JSON.stringify({ ccaa: '__ALL__', province: '__ALL__' });

/** Vista y festivos sembrados, con el reloj en septiembre de 2026: la tabla de festivos es por año explícito. */
async function festivosEn(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {string} */ vista,
    /** @type {string} */ festivos
) {
    await page.clock.setFixedTime(new Date('2026-09-05T10:00:00'));
    await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': vista, 'planner-holidays-config': festivos });
}

test.describe('Planner — Festivos que caen el mismo día', () => {
    test('getHolidays: el primero es el de siempre, los demás van en `others` y ninguno entra dos veces', async ({
        page,
    }) => {
        const modUrl = await openPlannerForHolidays(page);
        const res = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            const dia = (/** @type {object} */ opts, /** @type {string} */ key) => {
                const v = mod.getHolidays(2026, { national: true, ...opts }).get(key);
                return [v, ...(v?.others ?? [])].map((h) => `${h.id}|${h.provinceCode ?? h.ccaaCode ?? ''}`);
            };
            return {
                todos: dia({ ccaa: '__ALL__', province: '__ALL__' }, '8-8'),
                andalucia: dia({ ccaa: 'AND', province: '__ALL__' }, '8-8'),
                // La capital elegida entra delante y no se repite al final, donde iba antes con una sola comunidad.
                murcia: dia({ ccaa: '__ALL__', province: 'MUR-MU' }, '8-15'),
                // Con la comunidad y la capital de fábrica el día tiene un solo festivo: sin `others`.
                malaga: mod.getHolidays(2026, { national: true, ccaa: 'AND', province: 'AND-MA' }).get('8-8'),
            };
        }, modUrl);

        expect(res.todos).toEqual([
            'dia-de-asturias|AST',
            'dia-de-extremadura|EXT',
            'virgen-de-la-fuensanta|AND-CO',
            'la-cinta|AND-HU',
            'virgen-de-la-victoria|AND-MA',
            'virgen-de-la-vega|CYL-SA',
            'virgen-de-san-lorenzo|CYL-VA',
            'virgen-de-la-victoria|MEL-ME',
        ]);
        expect(res.andalucia).toEqual([
            'virgen-de-la-fuensanta|AND-CO',
            'la-cinta|AND-HU',
            'virgen-de-la-victoria|AND-MA',
        ]);
        expect(res.murcia).toEqual(['romeria-de-la-fuensanta|MUR-MU', 'la-bien-aparecida|CNT']);
        expect(res.malaga).toEqual({
            id: 'virgen-de-la-victoria',
            name: 'Virgen de la Victoria',
            type: 'capital',
            provinceCode: 'AND-MA',
        });
    });

    test('mensual: el 8-sep pinta el primero y «+7», y el title los lista; con una comunidad, sus capitales', async ({
        page,
    }) => {
        await festivosEn(page, 'monthly', TODOS);
        const ocho = page.locator('.pm-cell[data-date="2026-09-08"] .pm-cell__info');
        await expect(ocho).toHaveText('Asturias: Día de Asturias +7');
        await expect(ocho).toHaveAttribute('title', OCHO_SEP_TODOS.join('\n'));
        // Un día con un solo festivo se pinta como siempre.
        const diada = page.locator('.pm-cell[data-date="2026-09-11"] .pm-cell__info');
        await expect(diada).toHaveText('Cataluña: Diada');
        await expect(diada).toHaveAttribute('title', 'Cataluña: Diada');

        await festivosEn(page, 'monthly', JSON.stringify({ ccaa: 'AND', province: '__ALL__' }));
        await expect(ocho).toHaveText('Córdoba: Virgen de la Fuensanta +2');
        await expect(ocho).toHaveAttribute('title', OCHO_SEP_TODOS.slice(2, 5).join('\n'));
    });

    test('trimestral: también «+N», con la lista entera en el title', async ({ page }) => {
        await festivosEn(page, 'quarterly', TODOS);
        const ocho = page.locator('.pq-day[data-date="2026-09-08"] .pq-day__holiday');
        await expect(ocho).toHaveText('Asturias: Día de Asturias +7');
        await expect(ocho).toHaveAttribute('title', OCHO_SEP_TODOS.join('\n'));
        const sanIgnacio = page.locator('.pq-day[data-date="2026-07-31"] .pq-day__holiday');
        await expect(sanIgnacio).toHaveText('Bilbao: San Ignacio +1');
        await expect(sanIgnacio).toHaveAttribute('title', 'Bilbao: San Ignacio\nDonostia: San Ignacio');
    });

    test('las páginas de calendario del cuadernillo llevan el «+N» (sin territorio, como siempre)', async ({
        page,
    }) => {
        await page.addInitScript(() => performance.setResourceTimingBufferSize(1000));
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const res = await page.evaluate(async (expr) => {
            const mod = await import(/* @vite-ignore */ eval(expr));
            const opts = { showHolidays: true, ccaa: '__ALL__', province: '__ALL__' };
            const celda = (/** @type {Function} */ pintar, /** @type {number} */ mes, /** @type {string} */ fecha) => {
                const hoja = document.createElement('div');
                pintar(hoja, 2026, mes, opts);
                return hoja.querySelector(`[data-date="${fecha}"] .p-cal__cell-info`)?.textContent ?? null;
            };
            // El 8-sep es martes (página 2, lunes a miércoles) y el 4-jun, jueves (página 3).
            return [celda(mod.renderPage2, 8, '2026-09-08'), celda(mod.renderPage3, 5, '2026-06-04')];
        }, urlModulo('planner-ui-planner.ts'));
        expect(res).toEqual(['Día de Asturias +7', 'Corpus Christi +2']);
    });

    test('el repintado de UNA celda (el ✦ del mini-editor) conserva el «+N»', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'entra por #textToggle, que en el editor público es de escritorio');
        await festivosEn(page, 'monthly', TODOS);
        await page.locator('#textToggle').click();
        const celda = page.locator('.pm-cell[data-date="2026-09-08"]');
        await expect(celda).toHaveClass(/is-cell-editable/);
        // Centinela en OTRA celda: si se repintara el folio entero, desaparecería y el test no probaría el diffing.
        await page.evaluate(() =>
            document.querySelector('.pm-cell[data-date="2026-09-10"]')?.setAttribute('data-e2e-centinela', 'vivo')
        );

        await celda.click();
        const libre = page.locator('.planner-cell-editor .planner-cell-editor__fmt-btn--vacation');
        await libre.click();
        await expect(celda.locator('.pm-cell__info')).toHaveCount(0);
        await libre.click();
        await expect(celda.locator('.pm-cell__info')).toHaveText('Asturias: Día de Asturias +7');
        await expect(celda.locator('.pm-cell__info')).toHaveAttribute('title', OCHO_SEP_TODOS.join('\n'));
        await expect(page.locator('[data-e2e-centinela="vivo"]')).toHaveCount(1);
    });
});

// ─── i18n — el chrome, el consentimiento y los festivos siguen al idioma

const DICC_MT = /** @type {Array<Record<string, string>>} */ ([
    { es: 'Reunión equipo', en: 'Team meeting', de: 'Teambesprechung' },
    { es: 'Comprar pan', en: 'Buy bread', de: 'Brot kaufen' },
    { es: 'Dentista', en: 'Dentist', de: 'Zahnarzt' },
    { es: 'Gimnasio', en: 'Gym', de: 'Fitnessstudio' },
    { es: 'Farmacia', en: 'Pharmacy', de: 'Apotheke' },
    { es: 'Cena', en: 'Dinner', de: 'Abendessen' },
]);

// Mock HONESTO de MyMemory: solo traduce si `q` está en el idioma de origen del langpair (si no, `MAL …`).
// `caidos` aborta como una red caída; con `puerta` la respuesta espera: menos de 8 s o mymemory.ts la da por caída.
async function mockMyMemory(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {Set<string>} */ caidos = new Set(),
    /** @type {Promise<unknown> | null} */ puerta = null
) {
    /** @type {Array<{ q: string, langpair: string }>} */
    const llamadas = [];
    await page.route('**/api.mymemory.translated.net/**', async (route) => {
        const params = new URL(route.request().url()).searchParams;
        const q = params.get('q') || '';
        const langpair = params.get('langpair') || '';
        llamadas.push({ q, langpair });
        if (puerta) await puerta;
        if (caidos.has(q)) return route.abort();
        const [from = '', to = ''] = langpair.split('|');
        const entrada = DICC_MT.find((d) => d[from] === q);
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                responseStatus: 200,
                responseData: { translatedText: entrada ? entrada[to] : `MAL ${langpair}: ${q}` },
            }),
        });
    });
    return llamadas;
}

/** Las llamadas cuyo texto NO está en el idioma de origen que declaran: un langpair falso. */
function paresFalsos(/** @type {Array<{ q: string, langpair: string }>} */ llamadas) {
    return llamadas.filter(({ q, langpair }) => !DICC_MT.some((d) => d[langpair.split('|')[0] || ''] === q));
}

/** Retiene las respuestas del mock hasta `abrir()`: deja una traducción EN VUELO. */
function crearPuerta() {
    /** @type {() => void} */
    let abrir = () => {};
    /** @type {Promise<void>} */
    const cerrada = new Promise((resolve) => {
        abrir = () => resolve();
    });
    return { cerrada, abrir: () => abrir() };
}

/** Siembra la semanal con estas celdas y el consentimiento ya dado (sin él sale el diálogo). */
function sembrarSemanal(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {Record<string, string>} */ celdas
) {
    return page.addInitScript((textos) => {
        localStorage.setItem('planner-translation-consent', 'granted');
        localStorage.setItem('planner-style', 'weekly');
        localStorage.setItem(
            'planner-week-config',
            JSON.stringify({
                days: [0, 1, 2, 3, 4],
                hours: ['8:00', '9:30'],
                cellTexts: Object.fromEntries(Object.entries(textos).map(([k, text]) => [k, { text }])),
            })
        );
    }, celdas);
}

/** Textos de esas celdas de la semanal según localStorage (escritura debounced: usar con poll). */
function textosSemanal(/** @type {import('@playwright/test').Page} */ page, /** @type {string[]} */ claves) {
    return () =>
        page.evaluate((ks) => {
            const c = JSON.parse(localStorage.getItem('planner-week-config') || '{}').cellTexts || {};
            return ks.map((k) => c[k]?.text ?? null);
        }, claves);
}

/** Reescribe una celda de la semanal desde el panel Textos (escritorio) y guarda el panel. */
async function reescribirCelda(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {string} */ celda,
    /** @type {string} */ texto
) {
    await page.locator('#textToggle').click();
    await expect(page.locator('#textPanel')).toBeVisible();
    const td = page.locator(`.pw-table__cell[data-cell="${celda}"]`);
    await expect(td).toHaveClass(/is-cell-editable/);
    await td.click();
    const input = page.locator('.planner-cell-editor__input');
    await expect(input).toBeFocused();
    // UNA palabra a propósito: el espacio al final de un contenteditable sale como &nbsp; y el mock no lo casaría.
    await input.fill(texto);
    await page.locator('.planner-cell-editor__fmt-btn--confirm').click();
    await expect(page.locator('.planner-cell-editor')).toHaveCount(0);
    await page.locator('#textSave').click();
    await expect(page.locator('#textPanel')).toBeHidden();
}

/** Añadir código desde «Mis planners» y confirmarlo con Guardar. */
async function importarCodigo(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ codigo) {
    await abrirGuardados(page);
    await page.locator('#savedImportBtn').click();
    const dlg = page.locator('.edt-dlg-overlay');
    await expect(dlg).toBeVisible();
    await dlg.locator('textarea').fill(codigo);
    await dlg.locator('.edt-dlg__ok').click();
    await expect(dlg).toHaveCount(0);
    // El import decodifica en asíncrono: Guardar antes del toast cerraría el panel y lo descartaría.
    await expect(page.locator('#planner-toast-container .edt-toast--success').last()).toBeVisible();
    await page.locator('#savedSave').click();
    await expect(page.locator('#savedPanel')).toBeHidden();
}

const PERMISO = '[data-ajuste="planner-translation-consent"]';

/** El permiso de traducción se cambia en el menú del engranaje de la cabecera. Devuelve dónde buscar sus opciones. */
async function abrirAjustesPlanner(/** @type {import('@playwright/test').Page} */ page, /** @type {boolean} */ _movil) {
    const menu = page.locator('#settingsMenu');
    if (!(await menu.isVisible())) await page.locator('#settingsToggle').click();
    await expect(menu).toBeVisible();
    return page.locator('site-header');
}

async function cerrarAjustes(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {import('@playwright/test').Locator} */ _panel,
    /** @type {boolean} */ _movil
) {
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsMenu')).toBeHidden();
}

test.describe('Planner — i18n', () => {
    test('con EN guardado, el arranque ya sale traducido y documentElement.lang le sigue', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('planner-lang', 'en'));
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
        await expect(page.locator('#designBtn span')).toHaveText('Design');
        await expect(page.locator('#styleWeekly span')).toHaveText('Weekly');
        // El h1 de la app es sr-only pero existe SIEMPRE y se traduce.
        await expect(page.locator('main > h1')).toHaveText('Planner');
        // aria vía [data-i18n-aria]: antes del motor nadie los re-traducía.
        await expect(page.locator('#langToggle')).toHaveAttribute('aria-label', 'Change language');
    });

    test('los nombres de festivo salen del diccionario por id según el idioma', async ({ page }) => {
        await page.addInitScript(() => {
            performance.setResourceTimingBufferSize(1000);
            localStorage.setItem('planner-lang', 'en');
        });
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const modUrl = await holidaysModuleUrl(page);
        expect(modUrl).not.toBeNull();

        const res = await page.evaluate(async (url) => {
            const mod = /** @type {any} */ (await import(/* @vite-ignore */ url));
            const nat = mod.getHolidays(2026, { national: true });
            return {
                viernes: nat.get('3-3')?.name,
                // La Mercè NO tiene clave: los nombres propios se quedan en su forma canónica.
                merce: mod.getHolidays(2026, { national: false, province: 'CAT-BA' }).get('8-24')?.name,
                cat: mod.getCCAAList().find((/** @type {{code: string}} */ c) => c.code === 'CAT')?.name,
                // La Diada tiene forma canónica en EN; Sant Esteve, como Sant Joan, no lleva clave.
                diada: mod.getHolidays(2026, { national: false, ccaa: 'CAT' }).get('8-11')?.name,
                esteve: mod.getHolidays(2026, { national: false, ccaa: 'CAT' }).get('11-26')?.name,
                // Una local SIN forma canónica no se traduce; con ella (el Santiago, la Ceniza), sí.
                pasqua: mod.getHolidays(2026, { national: false, province: 'CAT-BA' }).get('4-25')?.name,
                jaume: mod.getHolidays(2026, { national: false, province: 'CAT-GI' }).get('6-25')?.name,
                ceniza: mod.getHolidays(2026, { national: false, province: 'GAL-PO' }).get('1-18')?.name,
            };
        }, modUrl);

        expect(res).toEqual({
            viernes: 'Good Friday',
            merce: 'La Mercè',
            cat: 'Catalonia',
            diada: 'National Day of Catalonia',
            esteve: 'Sant Esteve',
            pasqua: 'Segona Pasqua',
            jaume: "St James's Day",
            ceniza: 'Ash Wednesday',
        });
    });

    test('traducir pide consentimiento UNA vez; denegarlo cambia el idioma sin enviar nada', async ({ page }) => {
        await page.addInitScript(() => {
            // Una celda con texto: sin ella el cambio de idioma es instantáneo y no pregunta.
            // ⚠️ days y hours son OBLIGATORIOS: sin ellos loadWeekConfig descarta el objeto entero.
            localStorage.setItem(
                'planner-week-config',
                JSON.stringify({
                    days: [0, 1, 2, 3, 4],
                    hours: ['8:00', '9:30'],
                    cellTexts: { '0-0': { text: 'Reunión equipo' } },
                })
            );
        });
        let llamadasApi = 0;
        for (const ruta of ['**/api.mymemory.translated.net/**']) {
            await page.route(ruta, (route) => {
                llamadasApi++;
                return route.abort();
            });
        }
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        // No hace falta cambiar a Semanal: el snapshot traducible recorre TODOS los estilos.
        await pulsarIdioma(page);
        const dlg = page.locator('.edt-dlg-overlay');
        await expect(dlg).toBeVisible();
        // Dice a quién va el texto
        await expect(dlg).toContainText('MyMemory');
        // D7: el diálogo dice dónde se cambia la elección
        await expect(dlg).toContainText('con el engranaje de arriba');

        // El diálogo sale en el idioma ACTIVO (aún es): el botón de rechazo es «No traducir».
        await dlg.getByRole('button', { name: 'No traducir' }).click();
        await expect(dlg).toHaveCount(0);
        // El idioma cambia igual; la celda conserva su texto y NO ha salido ninguna petición.
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        expect(await page.evaluate(() => localStorage.getItem('planner-translation-consent'))).toBe('denied');

        // Segundo cambio (EN→DE): la elección se recuerda, no re-pregunta.
        await pulsarIdioma(page);
        await expect(page.locator('.edt-dlg-overlay')).toHaveCount(0);
        await expect(page.locator('#langLabel')).toHaveText('DEU');

        // Tercero (DE→ES): los textos YA están en español (textsLang), así que ni pregunta ni traduce.
        await pulsarIdioma(page);
        await expect(page.locator('.edt-dlg-overlay')).toHaveCount(0);
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        expect(llamadasApi).toBe(0);
        expect(
            await page.evaluate(() => JSON.parse(localStorage.getItem('planner-week-config')).cellTexts['0-0'].text)
        ).toBe('Reunión equipo');
    });

    test('El engranaje manda en el permiso: «No, nunca» ni pregunta ni envía y «Preguntar» vuelve a preguntar (D7)', async ({
        page,
    }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        await page.addInitScript(() => {
            // Sin permiso sembrado: el de fábrica es «Preguntar» (D4)
            localStorage.setItem(
                'planner-week-config',
                JSON.stringify({
                    days: [0, 1, 2, 3, 4],
                    hours: ['8:00', '9:30'],
                    cellTexts: { '0-0': { text: 'Reunión equipo' } },
                })
            );
            /** @type {Array<{ clave: string, valor: string }>} */
            const cambios = [];
            window.addEventListener('ajustes:cambio', (ev) => cambios.push(/** @type {CustomEvent} */ (ev).detail));
            /** @type {any} */ (window).__cambios = cambios;
        });
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const textoCelda = () =>
            page.evaluate(() => JSON.parse(localStorage.getItem('planner-week-config') || '{}').cellTexts['0-0'].text);
        const permiso = () => page.evaluate(() => localStorage.getItem('planner-translation-consent'));

        let ajustes = await abrirAjustesPlanner(page, movil);
        await expect(ajustes.locator(`${PERMISO} input[value="ask"]`)).toBeChecked();
        await ajustes.locator(`${PERMISO} input[value="denied"]`).check();
        await cerrarAjustes(page, ajustes, movil);
        expect(await permiso()).toBe('denied');

        // «No, nunca»: el idioma cambia, sin diálogo ni petición, y la celda sigue en castellano
        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(page.locator('.edt-dlg-overlay')).toHaveCount(0);
        expect(llamadas).toEqual([]);
        await expect.poll(textoCelda).toBe('Reunión equipo');

        // «Preguntar» vuelve a preguntar, y el diálogo (ya en inglés) dice dónde se cambia
        ajustes = await abrirAjustesPlanner(page, movil);
        await ajustes.locator(`${PERMISO} input[value="ask"]`).check();
        await cerrarAjustes(page, ajustes, movil);
        await pulsarIdioma(page);
        const dlg = page.locator('.edt-dlg-overlay');
        await expect(dlg).toBeVisible();
        await expect(dlg).toContainText('with the gear at the top');
        await dlg.getByRole('button', { name: 'Yes, translate' }).click();
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await expect.poll(textoCelda).toBe('Teambesprechung');
        expect(paresFalsos(llamadas)).toEqual([]);

        // Lo respondido se guarda como el ajuste y lo avisa: el panel pasa a marcar «Sí, sin preguntar»
        expect(await permiso()).toBe('granted');
        expect(await page.evaluate(() => /** @type {any} */ (window).__cambios.at(-1))).toEqual({
            clave: 'planner-translation-consent',
            valor: 'granted',
        });
        ajustes = await abrirAjustesPlanner(page, movil);
        await expect(ajustes.locator(`${PERMISO} input[value="granted"]`)).toBeChecked();
    });

    test('«No, nunca» elegido con la traducción en marcha para los lotes que faltan: lo no enviado queda sin traducir', async ({
        page,
    }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        // Seis textos distintos: un lote de cinco y otro de uno (CHUNK_SIZE de planner-translation.ts).
        const textos = ['Reunión equipo', 'Comprar pan', 'Dentista', 'Gimnasio', 'Farmacia', 'Cena'];
        await sembrarSemanal(page, Object.fromEntries(textos.map((t, i) => [`${i % 5}-${Math.floor(i / 5)}`, t])));
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        await pulsarIdioma(page); // ES → EN: el primer lote se queda esperando en el mock
        await expect.poll(() => llamadas.length).toBe(5);
        const ajustes = await abrirAjustesPlanner(page, movil);
        await ajustes.locator(`${PERMISO} input[value="denied"]`).check();
        await cerrarAjustes(page, ajustes, movil);
        puerta.abrir();

        await expect(page.locator('#langLabel')).toHaveText('ENG');
        // Con el permiso retirado no habrá reintento: sale el aviso de traducción desactivada, no el de parcial.
        await expect(page.locator('#planner-toast-container .edt-toast').last()).toContainText(
            'Translation is turned off'
        );
        await expect(page.locator('#planner-toast-container .edt-toast--warning')).toHaveCount(0);
        await expect
            .poll(textosSemanal(page, ['0-0', '1-0', '2-0', '3-0', '4-0', '0-1']))
            .toEqual(['Team meeting', 'Buy bread', 'Dentist', 'Gym', 'Pharmacy', 'Cena']);
        expect(llamadas).toHaveLength(5);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('un fallo de red NO se cachea como traducción: el siguiente cambio de idioma reintenta', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('planner-translation-consent', 'granted');
            localStorage.setItem(
                'planner-week-config',
                JSON.stringify({
                    days: [0, 1, 2, 3, 4],
                    hours: ['8:00', '9:30'],
                    cellTexts: { '0-0': { text: 'Reunión equipo' } },
                })
            );
        });

        // Primera tanda: la API cae. La celda debe conservar su texto y NO quedar cacheada.
        const caidos = new Set(['Reunión equipo']);
        const llamadas = await mockMyMemory(page, caidos);

        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        const textoCelda = () =>
            page.evaluate(() => JSON.parse(localStorage.getItem('planner-week-config')).cellTexts['0-0'].text);

        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        expect(llamadas.length).toBeGreaterThan(0);
        // Con la API caída la celda se queda con su texto de origen, no vacía.
        await expect.poll(textoCelda).toBe('Reunión equipo');
        // Y la clave NO entra en el mapa `src`: es lo que la deja sucia para el reintento.
        expect(
            await page.evaluate(() => {
                const c = JSON.parse(localStorage.getItem('planner-translation-cache') || '{}');
                return c.src?.en?.weekly?.['0-0'] ?? null;
            })
        ).toBe(null);

        // Segunda tanda con la API viva: el badge dice EN, pero la celda sigue en español y viaja como tal.
        caidos.clear();
        await pulsarIdioma(page); // EN → DE
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await expect.poll(textoCelda).toBe('Teambesprechung');
        await pulsarIdioma(page); // DE → ES
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        await expect.poll(textoCelda).toBe('Reunión equipo');
        await pulsarIdioma(page); // ES → EN, reintento
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect.poll(textoCelda).toBe('Team meeting');
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('tras un fallo PARCIAL cada celda viaja desde SU idioma, no desde el del badge', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('planner-translation-consent', 'granted');
            localStorage.setItem(
                'planner-week-config',
                JSON.stringify({
                    days: [0, 1, 2, 3, 4],
                    hours: ['8:00', '9:30'],
                    cellTexts: { '0-0': { text: 'Reunión equipo' }, '0-1': { text: 'Comprar pan' } },
                })
            );
        });
        const caidos = new Set(['Reunión equipo']);
        const llamadas = await mockMyMemory(page, caidos);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        const celdas = () =>
            page.evaluate(() => {
                const c = JSON.parse(localStorage.getItem('planner-week-config') || '{}').cellTexts;
                return [c['0-0'].text, c['0-1'].text];
            });

        // ES→EN con una celda caída: la otra se traduce y la caída se queda en español.
        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect.poll(celdas).toEqual(['Reunión equipo', 'Buy bread']);

        // EN→DE con la API viva: la rezagada sale como español (es|de), no como inglés.
        caidos.clear();
        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await expect.poll(celdas).toEqual(['Teambesprechung', 'Brot kaufen']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('una caché escrita por la versión anterior tras un fallo total se cura al cargar', async ({ page }) => {
        await page.addInitScript(() => {
            const vacio = { weekly: {}, planner: {}, monthly: {}, quarterly: {} };
            localStorage.setItem('planner-lang', 'en');
            localStorage.setItem('planner-translation-consent', 'granted');
            localStorage.setItem(
                'planner-week-config',
                JSON.stringify({
                    days: [0, 1, 2, 3, 4],
                    hours: ['8:00', '9:30'],
                    cellTexts: { '0-0': { text: 'Reunión equipo' } },
                })
            );
            // Lo que dejaba la versión anterior tras un fallo ES→EN: el texto de ORIGEN guardado bajo el destino.
            localStorage.setItem(
                'planner-translation-cache',
                JSON.stringify({
                    version: 0,
                    textsLang: 'en',
                    langs: {
                        es: { ...vacio, weekly: { '0-0': 'Reunión equipo' } },
                        en: { ...vacio, weekly: { '0-0': 'Reunión equipo' } },
                    },
                    src: { en: vacio },
                })
            );
        });
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');

        const textoCelda = () =>
            page.evaluate(() => JSON.parse(localStorage.getItem('planner-week-config')).cellTexts['0-0'].text);

        await pulsarIdioma(page); // EN → DE: la celda viaja como español
        await expect.poll(textoCelda).toBe('Teambesprechung');
        await pulsarIdioma(page); // DE → ES
        await expect.poll(textoCelda).toBe('Reunión equipo');
        // Sin la limpieza, detectLangs la daba por inglesa y ES→EN no la traducía nunca.
        await pulsarIdioma(page); // ES → EN
        await expect.poll(textoCelda).toBe('Team meeting');
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('mensual y trimestral comparten almacén: cada texto viaja UNA vez y se ve en las dos vistas', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            const d = new Date();
            const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            localStorage.setItem('planner-translation-consent', 'granted');
            localStorage.setItem('planner-style', 'monthly');
            localStorage.setItem(
                'planner-cell-texts',
                JSON.stringify({ [`${mes}-15`]: { text: 'Dentista' }, [`${mes}-20`]: { text: 'Comprar pan' } })
            );
        });
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await expect(page.locator('.pm-cell__user-text')).toHaveText(['Dentista', 'Comprar pan']);

        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(page.locator('.pm-cell__user-text')).toHaveText(['Dentist', 'Buy bread']);
        // Una petición por celda: el almacén es UNO aunque lo pinten dos vistas.
        expect(llamadas.map((l) => l.q).sort()).toEqual(['Comprar pan', 'Dentista']);

        await elegirVista(page, 'styleQuarterly');
        await expect(page.locator('.pq-day__user-text')).toHaveText(['Dentist', 'Buy bread']);
    });

    test('volver al idioma original devuelve el texto escrito, sin pedir una retraducción', async ({ page }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celda = textosSemanal(page, ['0-0']);

        await pulsarIdioma(page); // ES → EN
        await expect.poll(celda).toEqual(['Team meeting']);
        await pulsarIdioma(page); // EN → DE
        await expect.poll(celda).toEqual(['Teambesprechung']);
        await pulsarIdioma(page); // DE → ES
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        await expect.poll(celda).toEqual(['Reunión equipo']);
        // Antes iba `en|de` y luego `de|es`: la celda recibía la retraducción de su propia traducción.
        expect(llamadas.map((l) => l.langpair)).toEqual(['es|en', 'es|de']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('lo escrito sobre una traducción pasa a ser el original, en el idioma en que se escribió', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await sembrarSemanal(page, { '4-1': 'Reunión equipo' });
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celda = textosSemanal(page, ['4-1']);

        await pulsarIdioma(page); // ES → EN
        await expect.poll(celda).toEqual(['Team meeting']);
        await reescribirCelda(page, '4-1', 'Dentist');

        await pulsarIdioma(page); // EN → DE: sale del inglés escrito, no del español de antes
        await expect.poll(celda).toEqual(['Zahnarzt']);
        await pulsarIdioma(page); // DE → ES
        await expect.poll(celda).toEqual(['Dentista']);
        await pulsarIdioma(page); // ES → EN: vuelve lo que se escribió, sin petición
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect.poll(celda).toEqual(['Dentist']);
        expect(llamadas.map((l) => l.langpair)).toEqual(['es|en', 'en|de', 'en|es']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('un fallo PARCIAL avisa de cuántas celdas se quedaron sin traducir', async ({ page }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo', '0-1': 'Comprar pan' });
        const caidos = new Set(['Reunión equipo']);
        await mockMyMemory(page, caidos);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const avisos = page.locator('#planner-toast-container .edt-toast--warning');

        await pulsarIdioma(page); // ES → EN con una celda caída
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        // En el idioma NUEVO: el aviso sale después de setLang.
        await expect(avisos).toHaveText([
            'Texts not translated: 1. They keep their language and will be retried on the next language change.',
        ]);

        caidos.clear();
        await pulsarIdioma(page); // EN → DE: el reintento va bien y no avisa
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await expect.poll(textosSemanal(page, ['0-0', '0-1'])).toEqual(['Teambesprechung', 'Brot kaufen']);
        await expect(avisos.filter({ hasText: 'Nicht übersetzte Texte' })).toHaveCount(0);
    });

    test('el organizador traduce A5 y A4 aunque solo se vea una, y el texto común viaja UNA vez', async ({ page }) => {
        const llamadas = await mockMyMemory(page);
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'planner',
            'planner-orientation': 'vertical',
            'planner-translation-consent': 'granted',
            'planner-a5-config': JSON.stringify({ sectionTexts: { goals: { text: 'Reunión equipo' } } }),
            // todo-7 solo existe en A4 (8 tareas; A5 tiene 6): con la vista en A5 no se ve, pero es del usuario.
            'planner-a4-config': JSON.stringify({
                sectionTexts: { goals: { text: 'Reunión equipo' }, 'todo-7': { text: 'Comprar pan' } },
            }),
        });
        const goals = page.locator('#page1 .planner-section-text[data-section="goals"]');
        await expect(goals).toHaveText('Reunión equipo');

        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(goals).toHaveText('Team meeting');
        const a4 = () =>
            page.evaluate(() => {
                const s = JSON.parse(localStorage.getItem('planner-a4-config') || '{}').sectionTexts || {};
                return [s.goals?.text ?? null, s['todo-7']?.text ?? null];
            });
        await expect.poll(a4).toEqual(['Team meeting', 'Buy bread']);
        expect(llamadas.map((l) => l.q).sort()).toEqual(['Comprar pan', 'Reunión equipo']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('un texto que falla en el organizador cuenta UNA vez aunque esté en A5 y en A4', async ({ page }) => {
        await mockMyMemory(page, new Set(['Reunión equipo']));
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'planner',
            'planner-orientation': 'vertical',
            'planner-translation-consent': 'granted',
            'planner-a5-config': JSON.stringify({ sectionTexts: { goals: { text: 'Reunión equipo' } } }),
            'planner-a4-config': JSON.stringify({
                sectionTexts: { goals: { text: 'Reunión equipo' }, 'todo-7': { text: 'Comprar pan' } },
            }),
        });

        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        // Dos celdas caídas (la de A5 y su copia en A4) y un solo texto para quien lee el aviso.
        await expect(page.locator('#planner-toast-container .edt-toast--warning')).toHaveText([
            'Texts not translated: 1. They keep their language and will be retried on the next language change.',
        ]);
    });

    test('con Config abierto la traducción espera a que se cierre: ni Guardar ni Cancelar la deshacen', async ({
        page,
    }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        const primera = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), primera.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celda = textoCelda(page, '0-0');
        const dias = page.locator('.pw-table__day-header');
        const abrirConfig = async () => {
            await page.locator('#configBtn').click();
            await expect(page.locator('#configWeekly')).toBeVisible();
        };

        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(1);
        await abrirConfig();
        primera.abrir();
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        // Con Config abierto espera: su Guardar escribía el borrador de la apertura y la deshacía.
        await expect(celda).toHaveText('Reunión equipo');
        await page.locator('#daysPills .planner-config__pill').nth(4).click();
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(celda).toHaveText('Team meeting');
        await expect(dias).toHaveCount(4);

        // UN paso de Deshacer: la traducción entra en el de Guardar, no en uno propio.
        await page.locator('#btnUndo').click();
        await expect(dias).toHaveCount(5);
        await expect(celda).toHaveText('Reunión equipo');
        await expect(page.locator('#btnUndo')).toBeDisabled();
        await page.locator('#btnRedo').click();
        await expect(celda).toHaveText('Team meeting');

        // Y el Cancelar devolvía los textos de la apertura.
        await page.unroute('**/api.mymemory.translated.net/**');
        const segunda = crearPuerta();
        const otras = await mockMyMemory(page, new Set(), segunda.cerrada);
        await pulsarIdioma(page); // EN → DE
        await expect.poll(() => otras.length).toBe(1);
        await abrirConfig();
        segunda.abrir();
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await expect(celda).toHaveText('Team meeting');
        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(celda).toHaveText('Teambesprechung');
        await expect(dias).toHaveCount(4);
        expect(llamadas).toHaveLength(1);
        expect(otras).toHaveLength(1);
        expect(paresFalsos([...llamadas, ...otras])).toEqual([]);
    });

    test('con Config abierto, borrar una franja antes de Guardar no deja sin traducir los textos que suben', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem('planner-translation-consent', 'granted');
            localStorage.setItem('planner-style', 'weekly');
            localStorage.setItem(
                'planner-week-config',
                JSON.stringify({
                    days: [0, 1, 2, 3, 4],
                    hours: ['8:00', '9:30', '11:30', '13:00', '15:00'],
                    cellTexts: { '0-0': { text: 'Reunión equipo' }, '0-1': { text: 'Comprar pan' } },
                })
            );
        });
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celda = textoCelda(page, '0-0');

        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(2);
        await page.locator('#configBtn').click();
        await expect(page.locator('#configWeekly')).toBeVisible();
        puerta.abrir();
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await borrarFranja(page, 0);
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        // «Comprar pan» subió a la franja 0: aplicada por clave, esa celda se saltaba y seguía en español.
        await expect(celda).toHaveText('Buy bread');

        llamadas.length = 0;
        await pulsarIdioma(page); // EN → DE: desde su original en español, no desde el de la franja borrada
        await expect(celda).toHaveText('Brot kaufen');
        expect(llamadas).toEqual([{ q: 'Comprar pan', langpair: 'es|de' }]);
        await pulsarIdioma(page); // DE → ES: se restaura lo escrito, sin petición
        await expect(celda).toHaveText('Comprar pan');
        expect(llamadas).toHaveLength(1);
    });

    test('el Cancelar de Mis planners devuelve el folio de la apertura y no descarta la traducción que esperaba', async ({
        page,
    }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        const primera = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), primera.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        // El folio por defecto (el organizador vacío): `e30` es «{}» y `3774ul` su checksum.
        await page.evaluate(async (expr) => {
            localStorage.removeItem('planner-saved-v1');
            const saved = await import(/* @vite-ignore */ eval(expr));
            saved.PlannerSaved.add({ name: 'E2E-otro-folio', code: 'PLNU1.e30.3774ul', key: 'kE2E-otro' });
        }, urlModulo('planner-saved.ts'));
        const celda = textoCelda(page, '0-0');
        const aplicarOtro = async () => {
            await page.locator('#savedList .edt-saved-card[data-id] .edt-saved-card__apply').first().click();
            await expect.poll(() => estiloGuardado(page)).toBe('planner');
        };
        const cancelar = async () => {
            await page.locator('#savedCancel').click();
            await expect(page.locator('#savedPanel')).toBeHidden();
            await expect.poll(() => estiloGuardado(page)).toBe('weekly');
        };

        // Llega con el panel abierto y espera; se aplica otro folio y se cancela: vuelve el de la apertura.
        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(1);
        await abrirGuardados(page);
        primera.abrir();
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(celda).toHaveText('Reunión equipo');
        await aplicarOtro();
        await cancelar();
        await expect(celda).toHaveText('Team meeting');

        // Y si el otro folio ya estaba aplicado cuando llega, se decide al cerrar el panel.
        await page.unroute('**/api.mymemory.translated.net/**');
        const segunda = crearPuerta();
        const otras = await mockMyMemory(page, new Set(), segunda.cerrada);
        await pulsarIdioma(page); // EN → DE
        await expect.poll(() => otras.length).toBe(1);
        await abrirGuardados(page);
        await aplicarOtro();
        segunda.abrir();
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await cancelar();
        await expect(celda).toHaveText('Teambesprechung');
        expect(otras).toEqual([{ q: 'Reunión equipo', langpair: 'es|de' }]);
        expect(paresFalsos([...llamadas, ...otras])).toEqual([]);
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('borrar una franja no le quita su original de traducción a los textos que suben', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('planner-translation-consent', 'granted');
            localStorage.setItem('planner-style', 'weekly');
            localStorage.setItem(
                'planner-week-config',
                JSON.stringify({
                    days: [0, 1, 2, 3, 4],
                    hours: ['8:00', '9:30', '11:30', '13:00', '15:00'],
                    cellTexts: { '0-0': { text: 'Reunión equipo' }, '0-1': { text: 'Comprar pan' } },
                })
            );
        });
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celda = textoCelda(page, '0-0');

        await pulsarIdioma(page); // ES → EN
        await expect(textoCelda(page, '0-1')).toHaveText('Buy bread');
        await page.locator('#configBtn').click();
        await expect(page.locator('#configWeekly')).toBeVisible();
        await borrarFranja(page, 0);
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(celda).toHaveText('Buy bread');

        llamadas.length = 0;
        await pulsarIdioma(page); // EN → DE: desde su original en español, no desde la traducción inglesa
        await expect(celda).toHaveText('Brot kaufen');
        expect(llamadas).toEqual([{ q: 'Comprar pan', langpair: 'es|de' }]);
        await pulsarIdioma(page); // DE → ES: se restaura lo escrito, sin petición
        await expect(celda).toHaveText('Comprar pan');
        expect(llamadas).toHaveLength(1);
    });

    test('la clave que dejó el contador de versión retirado se borra al arrancar', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-translation-text-version': '7' });
        expect(await page.evaluate(() => localStorage.getItem('planner-translation-text-version'))).toBeNull();
    });

    test('lo que se escribe con la traducción en vuelo no lo pisa la traducción', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await sembrarSemanal(page, { '0-0': 'Reunión equipo', '4-1': 'Comprar pan' });
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celdas = textosSemanal(page, ['0-0', '4-1']);

        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(2);
        await reescribirCelda(page, '4-1', 'Dentista');
        puerta.abrir();

        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect.poll(celdas).toEqual(['Team meeting', 'Dentista']);
        // La reescrita sigue en SU idioma: el siguiente cambio la manda como español.
        await pulsarIdioma(page); // EN → DE
        await expect.poll(celdas).toEqual(['Teambesprechung', 'Zahnarzt']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('la traducción que llega con Textos abierto espera a que se cierre y no pisa lo tecleado mientras', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'planner',
            'planner-orientation': 'vertical',
            'planner-translation-consent': 'granted',
            'planner-a5-config': JSON.stringify({ sectionTexts: { goals: { text: 'Reunión equipo' } } }),
        });
        const texto = (/** @type {string} */ s) => page.locator(`#page1 .planner-section-text[data-section="${s}"]`);

        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(1);
        await abrirTextos(page);
        const input = await editarSeccion(page, 'priority');
        puerta.abrir();
        // La respuesta llegó (el contador ya dice 1/1), pero con Textos abierto no entra ni el idioma de la interfaz.
        await expect(page.locator('#langLabel')).toHaveText(/1\/1/);
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
        // Tampoco los textos: su Cancelar devolvería los de la apertura.
        await expect(texto('goals')).toHaveText('Reunión equipo');

        await input.pressSequentially('Dentist');
        await page.locator('.planner-cell-editor__fmt-btn--confirm').click();
        await expect(page.locator('.planner-cell-editor')).toHaveCount(0);
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(texto('goals')).toHaveText('Team meeting');
        await expect(texto('priority')).toHaveText('Dentist');

        await pulsarIdioma(page); // EN → DE
        await expect(texto('goals')).toHaveText('Teambesprechung');
        await expect(texto('priority')).toHaveText('Zahnarzt');
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('un planner aplicado con la traducción en vuelo no recibe la traducción del anterior', async ({ page }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celda = textosSemanal(page, ['0-0']);
        const celdaDom = page.locator('#page1 .pw-table__cell[data-cell="0-0"] .pw-table__cell-text');
        const aleman = craftCode(
            JSON.stringify({
                st: 'weekly',
                tl: 'de',
                wk: { dy: [0, 1, 2, 3, 4], hu: ['8:00', '9:30'], ct: { '0-0': { t: 'Zahnarzt' } } },
            })
        );

        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(1);
        await importarCodigo(page, aleman);
        puerta.abrir();

        await expect(page.locator('#langLabel')).toHaveText('ENG');
        // En el DOM y no en localStorage: la importación ya escribió «Zahnarzt» y la escritura es diferida.
        await expect(celdaDom).toHaveText('Zahnarzt');
        // El código dice alemán: EN → DE no tiene nada que pedir, y DE → ES sale como alemán.
        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await expect.poll(celda).toEqual(['Zahnarzt']);
        expect(llamadas).toHaveLength(1);
        await pulsarIdioma(page);
        await expect.poll(celda).toEqual(['Dentista']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('un planner SIN idioma aplicado en vuelo se queda en el idioma de la interfaz de antes', async ({ page }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celda = page.locator('#page1 .pw-table__cell[data-cell="0-0"] .pw-table__cell-text');
        // Sin `tl`, como un «Mis planners» guardado antes de traducir nunca: su texto es del idioma de la interfaz.
        const sinIdioma = craftCode(
            JSON.stringify({
                st: 'weekly',
                wk: { dy: [0, 1, 2, 3, 4], hu: ['8:00', '9:30'], ct: { '0-0': { t: 'Dentista' } } },
            })
        );

        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(1);
        await importarCodigo(page, sinIdioma);
        puerta.abrir();

        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(celda).toHaveText('Dentista');
        // El badge ya dice EN, pero «Dentista» se importó con la interfaz en ES: EN → DE lo manda como español.
        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await expect(celda).toHaveText('Zahnarzt');
        expect(llamadas.map((l) => l.langpair)).toEqual(['es|en', 'es|de']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('el idioma de cada celda viaja en el código: otro equipo no manda un par falso tras un fallo parcial', async ({
        page,
    }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo', '0-1': 'Comprar pan' });
        const caidos = new Set(['Reunión equipo']);
        const llamadas = await mockMyMemory(page, caidos);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celdas = textosSemanal(page, ['0-0', '0-1']);
        const payload = () =>
            page.evaluate(async (expr) => {
                const mod = await import(/* @vite-ignore */ eval(expr));
                return mod.getPersistablePlannerState();
            }, urlModulo('planner-persist.ts'));

        await pulsarIdioma(page); // ES → EN: 0-0 se queda en español
        await expect.poll(celdas).toEqual(['Reunión equipo', 'Buy bread']);
        expect((await payload()).cellLangs).toEqual({ weekly: { '0-0': 'es' } });
        const codigo = await page.evaluate(async (expr) => {
            const mod = await import(/* @vite-ignore */ eval(expr));
            return mod.PlannerShareCode.encodeCurrent();
        }, urlModulo('planner-share-code.ts'));

        // «Otro equipo»: ni caché de traducción ni idioma de la interfaz, solo el código (la siembra se repite).
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await waitForPlannerReady(page);
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        await importarCodigo(page, codigo);
        await expect.poll(celdas).toEqual(['Reunión equipo', 'Buy bread']);

        caidos.clear();
        llamadas.length = 0;
        await pulsarIdioma(page); // ES → EN: sin el mapa del código, 0-0 pasaba por inglesa y no se traducía
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect.poll(celdas).toEqual(['Team meeting', 'Buy bread']);
        expect(llamadas.map((l) => l.langpair)).toEqual(['es|en']);
        expect(paresFalsos(llamadas)).toEqual([]);
        // Sin excepciones el payload es el de siempre: un `cellLangs: {}` cambiaría el hash de «Mis planners».
        expect(await payload()).not.toHaveProperty('cellLangs');
    });

    test('el botón de idioma no repinta a mitad de una descarga: la interfaz cambia al terminar', async ({ page }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const lunes = page.locator('.pw-table__day-name').first();
        await expect(lunes).toHaveText('LUNES');

        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(1);
        // La clase que pone createExportGuard: una captura real no se deja retener desde aquí.
        await page.evaluate(() => {
            document.body.classList.add('is-exporting');
            const w = /** @type {any} */ (window);
            w.__e2eMutaciones = 0;
            new MutationObserver((m) => (w.__e2eMutaciones += m.length)).observe(
                /** @type {Element} */ (document.querySelector('.planner-pages')),
                { childList: true, subtree: true, characterData: true }
            );
        });
        puerta.abrir();
        // El 1/1 lo pinta la respuesta; sin aplazar, el setLang de detrás ponía «ENG» y repintaba en el mismo turno.
        await expect(page.locator('#langLabel')).toHaveText(/1\/1/);
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
        expect(await page.evaluate(() => /** @type {any} */ (window).__e2eMutaciones)).toBe(0);

        await page.evaluate(() => document.body.classList.remove('is-exporting'));
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(lunes).toHaveText('MONDAY');
        await expect(textoCelda(page, '0-0')).toHaveText('Team meeting');
    });

    test('con Textos abierto el botón de idioma espera a que se cierre y no le quita la edición de celdas', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const vacia = page.locator('.pw-table__cell[data-cell="4-1"]');

        await pulsarIdioma(page); // ES → EN, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(1);
        await abrirTextos(page);
        await expect(vacia).toHaveClass(/is-cell-editable/);
        puerta.abrir();
        await expect(page.locator('#langLabel')).toHaveText(/1\/1/);
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
        // El render del setLang rehacía el folio y las celdas perdían la edición con el panel aún abierto.
        await expect(vacia).toHaveClass(/is-cell-editable/);

        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(textoCelda(page, '0-0')).toHaveText('Team meeting');
    });

    test('la decisión que espera a cerrar Mis planners avisa, tarde, de lo que se quedó sin traducir', async ({
        page,
    }) => {
        const avisos = await decisionAplazadaConUnaCaida(page);
        await page.locator('#savedCancel').click();
        await expect(page.locator('#savedPanel')).toBeHidden();
        await expect(textoCelda(page, '0-0')).toHaveText('Team meeting');
        await expect(textoCelda(page, '0-1')).toHaveText('Comprar pan');
        await expect(avisos).toHaveText([
            'Texts not translated: 1. They keep their language and will be retried on the next language change.',
        ]);
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('y si mientras tanto se retiró el permiso, el aviso es el de la traducción desactivada', async ({ page }) => {
        const avisos = await decisionAplazadaConUnaCaida(page);
        // Lo que hace escribirAjuste al elegir «No, nunca» en Ajustes › Planner.
        await page.evaluate(() => {
            localStorage.setItem('planner-translation-consent', 'denied');
            const detail = { clave: 'planner-translation-consent', valor: 'denied' };
            window.dispatchEvent(new CustomEvent('ajustes:cambio', { detail }));
        });
        await page.locator('#savedCancel').click();
        await expect(page.locator('#savedPanel')).toBeHidden();
        await expect(textoCelda(page, '0-0')).toHaveText('Team meeting');
        // Sin reintento posible, «se reintentarán» mentiría.
        await expect(page.locator('#planner-toast-container .edt-toast', { hasText: 'turned off' })).toBeVisible();
        await expect(avisos).toHaveCount(0);
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });
});

/**
 * Deja una traducción ES → EN con «Comprar pan» caído esperando a que se cierre Mis planners, con otro folio
 * aplicado: es el caso en que swapLanguage ya devolvió 0 y lo que falla solo se sabe al decidir.
 */
async function decisionAplazadaConUnaCaida(/** @type {import('@playwright/test').Page} */ page) {
    await sembrarSemanal(page, { '0-0': 'Reunión equipo', '0-1': 'Comprar pan' });
    const puerta = crearPuerta();
    const llamadas = await mockMyMemory(page, new Set(['Comprar pan']), puerta.cerrada);
    await page.goto(PLANNER_URL);
    await waitForPlannerReady(page);
    // El folio por defecto (el organizador vacío): `e30` es «{}» y `3774ul` su checksum.
    await page.evaluate(async (expr) => {
        localStorage.removeItem('planner-saved-v1');
        const saved = await import(/* @vite-ignore */ eval(expr));
        saved.PlannerSaved.add({ name: 'E2E-otro-folio', code: 'PLNU1.e30.3774ul', key: 'kE2E-otro' });
    }, urlModulo('planner-saved.ts'));

    await pulsarIdioma(page); // ES → EN, retenida en el mock
    await expect.poll(() => llamadas.length).toBe(2);
    await abrirGuardados(page);
    await page.locator('#savedList .edt-saved-card[data-id] .edt-saved-card__apply').first().click();
    await expect.poll(() => estiloGuardado(page)).toBe('planner');
    puerta.abrir();
    await expect(page.locator('#langLabel')).toHaveText('ENG');
    const avisos = page.locator('#planner-toast-container .edt-toast--warning');
    // Se decide al cerrar el panel: hasta entonces no hay nada que contar.
    await expect(avisos).toHaveCount(0);
    return avisos;
}

const GENERAL = 'lang-preference';

/** Lo que hace `escribirAjuste` al elegir el idioma en los ajustes: guarda y avisa por `ajustes:cambio`. */
async function cambiarAjusteIdioma(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ valor) {
    await page.evaluate(
        ({ clave, valor }) => {
            localStorage.setItem(clave, valor);
            window.dispatchEvent(new CustomEvent('ajustes:cambio', { detail: { clave, valor } }));
        },
        { clave: GENERAL, valor }
    );
}

/** El idioma que eligió el botón, cómo estaba el ajuste de idioma al pulsarlo y el propio ajuste. */
function eleccion(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate(() => ({
        lang: localStorage.getItem('planner-lang'),
        marca: localStorage.getItem('planner-lang-site'),
        general: localStorage.getItem('lang-preference'),
    }));
}

/** `textsLang` de la caché de traducción, que se escribe sin retardo. */
function idiomaTextos(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('planner-translation-cache') || '{}').textsLang ?? null);
}

async function recargar(/** @type {import('@playwright/test').Page} */ page) {
    await page.reload();
    await waitForPlannerReady(page);
}

test.describe('Planner — Sigue al ajuste de idioma', () => {
    test('con el ajuste de idioma en inglés abre en inglés, sin elegir nada por el usuario', async ({ page }) => {
        for (const url of [PLANNER_URL]) {
            await gotoPlannerSeeded(page, url, { ...SEED_H, [GENERAL]: 'en' });
            await expect(page.locator('#langLabel')).toHaveText('ENG');
            await expect(page.locator('html')).toHaveAttribute('lang', 'en');
            await expect(page.locator('main > h1')).toHaveText('Planner');
            expect(await eleccion(page)).toEqual({ lang: null, marca: null, general: 'en' });
        }
    });

    test('el inglés que Stock dejó en stock-lang-v1 también vale: pasa a la clave del sitio', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, { ...SEED_H, 'stock-lang-v1': 'en' });
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        expect(
            await page.evaluate(() => [localStorage.getItem('lang-preference'), localStorage.getItem('stock-lang-v1')])
        ).toEqual(['en', null]);
    });

    test('el botón parte del ajuste de idioma (EN → ES → DE → EN) y no lo escribe', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, { ...SEED_H, [GENERAL]: 'en' });
        const label = page.locator('#langLabel');
        await expect(label).toHaveText('ENG');
        for (const siguiente of ['ESP', 'DEU', 'ENG']) {
            await pulsarIdioma(page);
            await expect(label).toHaveText(siguiente);
        }
        expect(await eleccion(page)).toEqual({ lang: 'en', marca: 'en', general: 'en' });
    });

    test('gana la última elección: el botón después del ajuste de idioma manda, y el ajuste de idioma después vuelve a mandar', async ({
        page,
    }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        const label = page.locator('#langLabel');
        await pulsarIdioma(page); // ES → EN
        await pulsarIdioma(page); // EN → DE
        await expect(label).toHaveText('DEU');
        expect(await eleccion(page)).toEqual({ lang: 'de', marca: 'es', general: null });
        await recargar(page);
        await expect(label).toHaveText('DEU');

        // Con el planner cerrado (el mismo documento no recibe su propio `storage`): manda el ajuste de idioma al abrir.
        await page.evaluate(() => localStorage.setItem('lang-preference', 'en'));
        await recargar(page);
        await expect(label).toHaveText('ENG');
        expect(await eleccion(page)).toEqual({ lang: 'en', marca: 'en', general: 'en' });

        await pulsarIdioma(page); // EN → ES
        await pulsarIdioma(page); // ES → DE
        await expect(label).toHaveText('DEU');
        await recargar(page);
        await expect(label).toHaveText('DEU');

        // Con el planner abierto: el cambio llega en el acto y también se recuerda.
        await cambiarAjusteIdioma(page, 'es');
        await expect(label).toHaveText('ESP');
        expect(await eleccion(page)).toEqual({ lang: 'es', marca: 'es', general: 'es' });
        await recargar(page);
        await expect(label).toHaveText('ESP');
    });

    test('un planner-lang de antes, sin marca, sigue mandando al actualizar y se marca con el ajuste de idioma', async ({
        page,
    }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, { ...SEED_H, 'planner-lang': 'de', [GENERAL]: 'en' });
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        expect(await eleccion(page)).toEqual({ lang: 'de', marca: 'en', general: 'en' });
        await cambiarAjusteIdioma(page, 'es');
        await expect(page.locator('#langLabel')).toHaveText('ESP');
    });

    test('un cambio del ajuste de idioma con un panel abierto espera a que se cierre y no deja paso en el historial', async ({
        page,
    }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        await page.locator('#configBtn').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await cambiarAjusteIdioma(page, 'en');
        // El aviso es síncrono: sin aplazar, el <html> ya diría `en` al volver del evaluate.
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        await page.locator('#configCancel').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('#btnUndo')).toBeDisabled();
    });

    test('un cambio del ajuste de idioma a mitad de una traducción espera a que acabe, y gana por ser el último', async ({
        page,
    }) => {
        await sembrarSemanal(page, { '0-0': 'Team meeting' });
        await page.addInitScript(() => localStorage.setItem('planner-lang', 'en'));
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');

        await pulsarIdioma(page); // EN → DE, retenida en el mock
        await expect.poll(() => llamadas.length).toBe(1);
        await cambiarAjusteIdioma(page, 'en');
        puerta.abrir();

        // Sin aplazar, el setLang('de') del final de la traducción pisaba el cambio del ajuste de idioma, que llegó después
        await expect.poll(textosSemanal(page, ['0-0'])).toEqual(['Teambesprechung']);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        expect(await eleccion(page)).toEqual({ lang: 'en', marca: 'en', general: 'en' });
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('un cambio del ajuste de idioma durante una descarga espera a que termine', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        await page.evaluate(() => document.body.classList.add('is-exporting'));
        await cambiarAjusteIdioma(page, 'en');
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');
        await page.evaluate(() => document.body.classList.remove('is-exporting'));
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('#langLabel')).toHaveText('ENG');
    });

    test('cambiar el ajuste de idioma no traduce ni pregunta ni deja paso en el historial: los textos siguen como estaban', async ({
        page,
    }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo', '0-1': 'Comprar pan' });
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await expect.poll(() => idiomaTextos(page)).toBe('es');

        await cambiarAjusteIdioma(page, 'en');
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(page.locator('.edt-dlg-overlay')).toHaveCount(0);
        await expect(page.locator('#btnUndo')).toBeDisabled();
        await expect.poll(textosSemanal(page, ['0-0', '0-1'])).toEqual(['Reunión equipo', 'Comprar pan']);
        expect(await idiomaTextos(page)).toBe('es');
        expect(llamadas).toEqual([]);
    });

    test('con textos en castellano abre en inglés sin traducirlos, y el botón los manda como castellano', async ({
        page,
    }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        await page.addInitScript(() => localStorage.setItem('lang-preference', 'en'));
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const celda = textosSemanal(page, ['0-0']);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect.poll(celda).toEqual(['Reunión equipo']);
        await expect.poll(() => idiomaTextos(page)).toBe('es');

        await pulsarIdioma(page); // EN → ES: ya están en castellano, no hay nada que pedir
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        expect(llamadas).toEqual([]);
        await pulsarIdioma(page); // ES → DE
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await expect.poll(celda).toEqual(['Teambesprechung']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('lo escrito antes de cambiar el ajuste de idioma nace en su idioma y el botón no lo manda como inglés', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await sembrarSemanal(page, {});
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        expect(await idiomaTextos(page)).toBe(null);
        await reescribirCelda(page, '0-0', 'Dentista');
        await expect.poll(() => idiomaTextos(page)).toBe('es');

        await cambiarAjusteIdioma(page, 'en');
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await pulsarIdioma(page); // EN → ES
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        const celda = textosSemanal(page, ['0-0']);
        await expect.poll(celda).toEqual(['Dentista']);
        expect(llamadas).toEqual([]);
        await pulsarIdioma(page); // ES → DE
        await expect.poll(celda).toEqual(['Zahnarzt']);
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('el idioma que cambia otra pestaña llega sin recargar', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'la sincronía no depende del ancho');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        const otra = await page.context().newPage();
        await otra.goto('/');
        await otra.evaluate(() => localStorage.setItem('lang-preference', 'en'));
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await otra.close();
    });

    test('una tarjeta de antes sin idioma de los textos no se sella en inglés al Guardarla con el ajuste de idioma en inglés', async ({
        page,
    }) => {
        const llamadas = await mockMyMemory(page);
        // Sin `tl`: el idioma de los textos solo se escribía al traducir, y el planner abría en castellano.
        const vieja = craftCode(
            JSON.stringify({
                st: 'weekly',
                wk: { dy: [0, 1, 2, 3, 4], hu: ['8:00', '9:30'], ct: { '0-0': { t: 'Reunión equipo' } } },
            })
        );
        const tarjeta = { id: 'plVieja', name: 'Vieja', createdAt: 1, bgSwatch: '#ffffff', thumb: null, key: 'kVieja' };
        await gotoPlannerSeeded(page, PLANNER_URL, {
            [GENERAL]: 'en',
            'planner-translation-consent': 'granted',
            'planner-saved-v1': JSON.stringify([{ ...tarjeta, code: vieja }]),
        });
        await expect(page.locator('#langLabel')).toHaveText('ENG');

        await abrirGuardados(page);
        await page.locator('#savedList .edt-saved-card[data-id] .edt-saved-card__apply').first().click();
        await expect(textoCelda(page, '0-0')).toHaveText('Reunión equipo');
        await page.locator('#savedSave').click();
        await expect(page.locator('#savedPanel')).toBeHidden();
        // Guardar sellaba el idioma de la interfaz, 'en', y el botón mandaba «Reunión equipo» como inglés.
        await expect.poll(() => idiomaTextos(page)).toBe('es');

        await pulsarIdioma(page); // EN → ES: ya está en castellano, no hay nada que pedir
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        expect(llamadas).toEqual([]);
        await pulsarIdioma(page); // ES → DE
        await expect(textoCelda(page, '0-0')).toHaveText('Teambesprechung');
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('el idioma de antes de seguir al ajuste de idioma se congela: pulsar el botón no cambia el de las tarjetas sin idioma', async ({
        page,
    }) => {
        const llamadas = await mockMyMemory(page);
        const vieja = craftCode(
            JSON.stringify({
                st: 'weekly',
                wk: { dy: [0, 1, 2, 3, 4], hu: ['8:00', '9:30'], ct: { '0-0': { t: 'Team meeting' } } },
            })
        );
        const tarjeta = { id: 'plVieja', name: 'Vieja', createdAt: 1, bgSwatch: '#ffffff', thumb: null, key: 'kVieja' };
        // Quien usaba el planner en inglés antes de seguir al ajuste de idioma: su planner-lang aún no tiene marca.
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-lang': 'en',
            'planner-translation-consent': 'granted',
            'planner-saved-v1': JSON.stringify([{ ...tarjeta, code: vieja }]),
        });
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await pulsarIdioma(page); // EN → DE, sin textos: reescribe planner-lang
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        await recargar(page);
        await expect(page.locator('#langLabel')).toHaveText('DEU');

        await abrirGuardados(page);
        await page.locator('#savedList .edt-saved-card[data-id] .edt-saved-card__apply').first().click();
        await expect(textoCelda(page, '0-0')).toHaveText('Team meeting');
        await page.locator('#savedSave').click();
        await expect(page.locator('#savedPanel')).toBeHidden();
        // Leído de planner-lang en cada arranque, ya sería 'de', y DE → ES mandaría «Team meeting» como alemán.
        await expect.poll(() => idiomaTextos(page)).toBe('en');
        await pulsarIdioma(page); // DE → ES
        await expect(textoCelda(page, '0-0')).toHaveText('Reunión equipo');
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('pulsar el botón descarta el cambio del ajuste de idioma que esperaba a que se cerrase un panel', async ({
        page,
    }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        await page.clock.install();
        await page.locator('#configBtn').click();
        await expect(page.locator('#configPanel')).toBeVisible();
        await cambiarAjusteIdioma(page, 'en');
        await expect(page.locator('#langLabel')).toHaveText('ESP');

        // Cerrar y pulsar en la misma tarea: el reintento del aplazado (cada 300 ms) aún no ha llegado.
        await page.evaluate(() => {
            document.getElementById('configCancel')?.click();
            document.getElementById('langToggle')?.click();
        });
        await expect(page.locator('#langLabel')).toHaveText('DEU'); // el ciclo es [en, es, de]: tras ESP, DEU
        await page.clock.runFor(1000);
        // Sin descartarlo, al quedar libre el aplazado pisaba la elección más reciente, la del botón.
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        expect(await eleccion(page)).toEqual({ lang: 'de', marca: 'en', general: 'en' });
    });

    test('la marca del botón es la de su clic: un cambio del ajuste de idioma que llega en vuelo no pasa por anterior al botón', async ({
        page,
    }) => {
        await sembrarSemanal(page, { '0-0': 'Reunión equipo' });
        await page.addInitScript(() => localStorage.setItem('lang-preference', 'en'));
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await page.clock.install();

        await pulsarIdioma(page); // EN → ES: los textos ya están en castellano
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        await pulsarIdioma(page); // ES → DE, retenida en el mock, con el ajuste de idioma aún en inglés
        await expect.poll(() => llamadas.length).toBe(1);
        await cambiarAjusteIdioma(page, 'es');
        // Parado: el aplazado no entra entre el final de la traducción y la lectura de abajo.
        await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
        puerta.abrir();
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        // Si la pestaña se cerrase aquí, el ajuste de idioma ('es') ya no es la marca y al abrir manda él, que es posterior al clic.
        expect(await eleccion(page)).toEqual({ lang: 'de', marca: 'en', general: 'es' });

        await page.clock.resume();
        await expect(page.locator('#langLabel')).toHaveText('ESP');
        expect(await eleccion(page)).toEqual({ lang: 'es', marca: 'es', general: 'es' });
    });
});

// ─── «Traducir mis textos» (D8): los textos pasan al idioma de la interfaz sin moverla

/** Interfaz en inglés con los textos en castellano: lo que deja cambiar el ajuste de idioma sin traducir, o un «No». */
function semillaMixta(/** @type {Record<string, string>} */ celdas, permiso = 'granted') {
    return {
        'planner-lang': 'en',
        'planner-translation-consent': permiso,
        'planner-style': 'weekly',
        'planner-week-config': JSON.stringify({
            days: [0, 1, 2, 3, 4],
            hours: ['8:00', '9:30'],
            cellTexts: Object.fromEntries(Object.entries(celdas).map(([k, text]) => [k, { text }])),
        }),
        'planner-translation-cache': JSON.stringify({ langs: {}, textsLang: 'es' }),
    };
}

/** En escritorio es un botón de la barra; en móvil, la primera fila del sheet «Más». */
async function pulsarTraducirMios(/** @type {import('@playwright/test').Page} */ page, /** @type {boolean} */ movil) {
    if (!movil) {
        await page.locator('#translateMineBtn').click();
        return;
    }
    await page.locator('#btnMas').click();
    await page.locator('#masTraducirRow').click();
    await expect(page.locator('#masPanel')).toBeHidden();
}

/** Si la acción se ofrece. En móvil abre «Más» para mirarlo y lo cierra con Escape. */
async function verTraducirMios(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {boolean} */ movil,
    /** @type {boolean} */ visible
) {
    if (!movil) {
        await expect(page.locator('#translateMineBtn')).toBeVisible({ visible });
        return;
    }
    await page.locator('#btnMas').click();
    await expect(page.locator('#masPanel')).toBeVisible();
    await expect(page.locator('#masTraducirRow')).toBeVisible({ visible });
    await page.keyboard.press('Escape');
    await expect(page.locator('#masPanel')).toBeHidden();
}

test.describe('Planner — Traducir mis textos (D8)', () => {
    test('solo aparece si alguna celda está en otro idioma que la interfaz, también tras cambiar el ajuste de idioma', async ({
        page,
    }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        await gotoPlannerSeeded(page, PLANNER_URL, {
            ...semillaMixta({ '0-0': 'Reunión equipo' }),
            'planner-lang': 'es',
        });
        await expect(page.locator('#translateMineBtn')).toHaveCount(1);
        await verTraducirMios(page, movil, false);
        // El ajuste de idioma solo cambia la interfaz: los textos se quedan en castellano y la acción se ofrece en el acto.
        await cambiarAjusteIdioma(page, 'en');
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await verTraducirMios(page, movil, true);

        await gotoPlannerSeeded(page, PLANNER_URL, semillaMixta({ '0-0': 'Reunión equipo' }));
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await verTraducirMios(page, movil, true);

        // Sin textos no hay nada que traducir, aunque la interfaz sea otra.
        await gotoPlannerSeeded(page, PLANNER_URL, semillaMixta({}));
        await verTraducirMios(page, movil, false);
    });

    test('pasa los textos al idioma de la interfaz en UN paso de deshacer y sin pares falsos', async ({
        page,
    }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        const llamadas = await mockMyMemory(page);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaMixta({ '0-0': 'Reunión equipo', '0-1': 'Comprar pan' }));
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(page.locator('#btnUndo')).toBeDisabled();

        await pulsarTraducirMios(page, movil);
        await expect(textoCelda(page, '0-0')).toHaveText('Team meeting');
        await expect(textoCelda(page, '0-1')).toHaveText('Buy bread');
        // Solo los textos: la interfaz no se ha movido.
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        expect(llamadas.map((l) => l.langpair)).toEqual(['es|en', 'es|en']);
        expect(paresFalsos(llamadas)).toEqual([]);
        await verTraducirMios(page, movil, false);

        await page.locator('#btnUndo').click();
        await expect(textoCelda(page, '0-0')).toHaveText('Reunión equipo');
        await expect(page.locator('#btnUndo')).toBeDisabled();
        await verTraducirMios(page, movil, true);
        await page.locator('#btnRedo').click();
        await expect(textoCelda(page, '0-1')).toHaveText('Buy bread');
        expect(llamadas).toHaveLength(2);
    });

    test('con «No traducir nunca» en el engranaje lo dice antes de pulsar, no manda nada y avisa de dónde se cambia', async ({
        page,
    }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        const llamadas = await mockMyMemory(page);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaMixta({ '0-0': 'Reunión equipo' }));
        if (!movil) await expect(page.locator('#translateMineBtn')).toHaveAttribute('title', /^Translate my texts/);

        const ajustes = await abrirAjustesPlanner(page, movil);
        await ajustes.locator(`${PERMISO} input[value="denied"]`).check();
        await cerrarAjustes(page, ajustes, movil);

        if (movil) {
            await page.locator('#btnMas').click();
            await expect(page.locator('#masTraducirOff')).toHaveText('Off');
            await page.locator('#masTraducirRow').click();
        } else {
            // Sin recargar: el permiso llega por `ajustes:cambio`, no por el siguiente paso del historial.
            await expect(page.locator('#translateMineBtn')).toHaveAttribute('title', /turned off/);
            await page.locator('#translateMineBtn').click();
        }
        // El aviso `info` no lleva modificador de clase (toast.ts): se busca por su texto.
        await expect(page.locator('#planner-toast-container .edt-toast', { hasText: 'gear at the top' })).toBeVisible();
        await expect(page.locator('.edt-dlg-overlay')).toHaveCount(0);
        await expect(textoCelda(page, '0-0')).toHaveText('Reunión equipo');
        await expect(page.locator('#btnUndo')).toBeDisabled();
        expect(llamadas).toHaveLength(0);
    });

    test('con «Preguntar», el No del diálogo se guarda y avisa de dónde se cambia', async ({ page }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        const llamadas = await mockMyMemory(page);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaMixta({ '0-0': 'Reunión equipo' }, 'ask'));

        await pulsarTraducirMios(page, movil);
        const dlg = page.locator('.edt-dlg-overlay');
        await expect(dlg).toBeVisible();
        await dlg.locator('.edt-dlg__cancel').click();
        await expect(dlg).toHaveCount(0);
        await expect(page.locator('#planner-toast-container .edt-toast', { hasText: 'gear at the top' })).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('planner-translation-consent'))).toBe('denied');
        await expect(textoCelda(page, '0-0')).toHaveText('Reunión equipo');
        await expect(page.locator('#btnUndo')).toBeDisabled();
        expect(llamadas).toHaveLength(0);
    });

    test('tras un fallo sigue a mano: sin nada traducido no deja paso, y el reintento pide solo la rezagada', async ({
        page,
    }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        const caidos = new Set(['Reunión equipo', 'Comprar pan']);
        const llamadas = await mockMyMemory(page, caidos);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaMixta({ '0-0': 'Reunión equipo', '0-1': 'Comprar pan' }));
        const avisos = page.locator('#planner-toast-container .edt-toast--warning');

        await pulsarTraducirMios(page, movil);
        await expect(avisos.last()).toContainText('Texts not translated: 2');
        await expect(page.locator('#btnUndo')).toBeDisabled();
        await verTraducirMios(page, movil, true);

        caidos.delete('Reunión equipo');
        await pulsarTraducirMios(page, movil);
        await expect(textoCelda(page, '0-0')).toHaveText('Team meeting');
        await expect(avisos.last()).toContainText('Texts not translated: 1');
        await expect(textoCelda(page, '0-1')).toHaveText('Comprar pan');
        await expect(page.locator('#btnUndo')).toBeEnabled();
        await verTraducirMios(page, movil, true);

        caidos.clear();
        llamadas.length = 0;
        await pulsarTraducirMios(page, movil);
        await expect(textoCelda(page, '0-1')).toHaveText('Buy bread');
        expect(llamadas).toEqual([{ q: 'Comprar pan', langpair: 'es|en' }]);
        await verTraducirMios(page, movil, false);
    });

    test('con Config abierto espera a que se cierre y graba SU paso detrás del de Guardar', async ({
        page,
    }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaMixta({ '0-0': 'Reunión equipo' }));
        const celda = textoCelda(page, '0-0');
        const dias = page.locator('.pw-table__day-header');

        await pulsarTraducirMios(page, movil);
        await expect.poll(() => llamadas.length).toBe(1);
        await page.locator('#configBtn').click();
        await expect(page.locator('#configWeekly')).toBeVisible();
        puerta.abrir();
        // El badge deja de girar al llegar la respuesta; con Config abierto aún no se aplica.
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(celda).toHaveText('Reunión equipo');
        await page.locator('#daysPills .planner-config__pill').nth(4).click();
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(celda).toHaveText('Team meeting');
        await expect(dias).toHaveCount(4);

        // Dos acciones, dos pasos: la traducción del botón de idioma, en cambio, entra en el de Guardar.
        await page.locator('#btnUndo').click();
        await expect(celda).toHaveText('Reunión equipo');
        await expect(dias).toHaveCount(4);
        await page.locator('#btnUndo').click();
        await expect(dias).toHaveCount(5);
        await expect(page.locator('#btnUndo')).toBeDisabled();
    });

    test('con una descarga en curso la traducción espera a que termine', async ({ page }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        const puerta = crearPuerta();
        const llamadas = await mockMyMemory(page, new Set(), puerta.cerrada);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaMixta({ '0-0': 'Reunión equipo' }));

        await pulsarTraducirMios(page, movil);
        await expect.poll(() => llamadas.length).toBe(1);
        // La clase que pone createExportGuard: una captura real no se deja retener desde aquí.
        await page.evaluate(() => {
            document.body.classList.add('is-exporting');
            const w = /** @type {any} */ (window);
            w.__e2eMutaciones = 0;
            new MutationObserver((m) => (w.__e2eMutaciones += m.length)).observe(
                /** @type {Element} */ (document.querySelector('.planner-pages')),
                { childList: true, subtree: true, characterData: true }
            );
        });
        puerta.abrir();
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(textoCelda(page, '0-0')).toHaveText('Reunión equipo');
        // Ni un repintado a mitad de la captura: el del final de la acción iba aunque la aplicación esperase.
        expect(await page.evaluate(() => /** @type {any} */ (window).__e2eMutaciones)).toBe(0);
        await page.evaluate(() => document.body.classList.remove('is-exporting'));
        await expect(textoCelda(page, '0-0')).toHaveText('Team meeting');
        await expect(page.locator('#btnUndo')).toBeEnabled();
    });
});

// ─── Organizador: A5 y A4 guardan sus textos por separado y escribir en una no borra lo que la otra no pinta

const A4_SOLO = { 'todo-6': { text: 'A4-SIETE' }, 'todo-7': { text: 'A4-OCHO' } };
const A4_SOLO_PLANO = { 'todo-6': 'A4-SIETE', 'todo-7': 'A4-OCHO' };

/** Organizador en A5 con A4 sembrado aparte: con los valores por defecto, sus tareas 7 y 8 no existen en A5. */
function semillaA5(/** @type {object} */ textosA5, /** @type {object} */ textosA4, extraA5 = {}) {
    return {
        'planner-style': 'planner',
        'planner-orientation': 'vertical',
        'planner-a5-config': JSON.stringify({ ...extraA5, sectionTexts: textosA5 }),
        'planner-a4-config': JSON.stringify({ sectionTexts: textosA4 }),
    };
}

// El flush es obligatorio: sin él, «el texto sigue ahí» se leería antes de la escritura diferida.
async function leerGuardado(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ key) {
    return page.evaluate((k) => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        return JSON.parse(localStorage.getItem(k) || '{}');
    }, key);
}

/** Texto plano por sección: el mini-editor guarda HTML saneado. */
function textosDe(/** @type {{ sectionTexts?: Record<string, { text?: string }> }} */ cfg) {
    return Object.fromEntries(
        Object.entries(cfg.sectionTexts || {}).map(([k, c]) => [k, String(c.text || '').replace(/<[^>]*>/g, '')])
    );
}

async function textosA4(/** @type {import('@playwright/test').Page} */ page) {
    return textosDe(await leerGuardado(page, 'planner-a4-config'));
}

async function abrirTextos(/** @type {import('@playwright/test').Page} */ page) {
    await page.locator('#textToggle').click();
    await expect(page.locator('#textPanel')).toBeVisible();
}

/** Abre el mini-editor de A5. `first()`: el span del texto repite el data-section de su sección. */
async function editarSeccion(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ seccion) {
    const celda = page.locator(`#page1 [data-section="${seccion}"]`).first();
    await expect(celda).toHaveClass(/is-section-editable/);
    await celda.click();
    const input = page.locator('.planner-cell-editor__input');
    await expect(input).toBeFocused();
    return input;
}

test.describe('Planner — El organizador A5/A4 no pierde textos', () => {
    test('escribir en A5 llega a A4 sin borrar sus tareas 7 y 8, que A5 no pinta', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaA5({}, A4_SOLO));
        await abrirTextos(page);

        await (await editarSeccion(page, 'goals')).pressSequentially('NUEVO');
        await page.locator('.planner-cell-editor__fmt-btn--confirm').click();
        await expect(page.locator('.planner-cell-editor')).toHaveCount(0);
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        await expect.poll(() => textosA4(page)).toEqual({ goals: 'NUEVO', ...A4_SOLO_PLANO });

        await page.locator('#configBtn').click();
        await page.locator('#plannerToggles .planner-config__toggle-btn').first().click();
        await page.locator('#configSave').click();
        await expect(page.locator('#configPanel')).toBeHidden();
        await expect(page.locator('.planner-pages')).toHaveClass(claseExacta('planner-pages--planner-h'));
        for (const [clave, texto] of Object.entries({ goals: 'NUEVO', ...A4_SOLO_PLANO })) {
            await expect(page.locator(`#page1 .planner-section-text[data-section="${clave}"]`)).toHaveText(texto);
        }
    });

    test('el ✕ del mini-editor en A5 revierte también A4, sin tocar lo suyo', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaA5({}, A4_SOLO));
        await abrirTextos(page);

        await (await editarSeccion(page, 'goals')).pressSequentially('BORRADOR');
        // Cada tecla escribe ya en A4: el ✕ de abajo tiene que deshacer también esa copia.
        await expect.poll(() => textosA4(page)).toEqual({ goals: 'BORRADOR', ...A4_SOLO_PLANO });

        await page.locator('.planner-cell-editor__fmt-btn--cancel').click();
        await expect(page.locator('.planner-cell-editor')).toHaveCount(0);
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        expect(await textosA4(page)).toEqual(A4_SOLO_PLANO);
    });

    test('con 7 tareas en A5, escribir en la 7 y cancelar no borra la tarea 7 de A4', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaA5({}, A4_SOLO, { todoCount: 7 }));
        await abrirTextos(page);

        // A5 enseña la 7 vacía y A4 la tiene escrita: escribir no la pisa, y el ✕ no deja A4 peor de lo que estaba.
        await (await editarSeccion(page, 'todo-6')).pressSequentially('X');
        expect(await textosA4(page)).toEqual(A4_SOLO_PLANO);
        await page.locator('.planner-cell-editor__fmt-btn--cancel').click();
        await expect(page.locator('.planner-cell-editor')).toHaveCount(0);
        expect(await textosA4(page)).toEqual(A4_SOLO_PLANO);

        // Ni confirmar con ✓, ni el Cancelar del panel después.
        await (await editarSeccion(page, 'todo-6')).pressSequentially('Y');
        await page.locator('.planner-cell-editor__fmt-btn--confirm').click();
        await expect(page.locator('.planner-cell-editor')).toHaveCount(0);
        expect(await textosA4(page)).toEqual(A4_SOLO_PLANO);
        await page.locator('#textCancel').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        expect(await textosA4(page)).toEqual(A4_SOLO_PLANO);
        expect(textosDe(await leerGuardado(page, 'planner-a5-config'))).toEqual({});
    });

    test('Limpiar + Restaurar en A5 devuelve A4 entero', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        const comun = { goals: { text: 'COMUN' } };
        await gotoPlannerSeeded(page, PLANNER_URL, semillaA5(comun, { ...comun, ...A4_SOLO }));
        const texto = page.locator('#page1 .planner-section-text[data-section="goals"]');
        await expect(texto).toHaveText('COMUN');

        await abrirTextos(page);
        await page.locator('#contentClearBtn').click();
        await expect(texto).toHaveCount(0);
        await page.locator('#contentRestoreBtn').click();
        await expect(texto).toHaveText('COMUN');
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();

        expect(await textosA4(page)).toEqual({ goals: 'COMUN', ...A4_SOLO_PLANO });
    });

    test('una celda que la otra orientación tiene oculta sigue a la visible si eran iguales', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        const comun = { goals: { text: 'COMUN' } };
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'planner',
            'planner-orientation': 'horizontal',
            'planner-a5-config': JSON.stringify({ showGoals: false, sectionTexts: comun }),
            'planner-a4-config': JSON.stringify({ sectionTexts: comun }),
        });
        await abrirTextos(page);

        const input = await editarSeccion(page, 'goals');
        await input.press('ControlOrMeta+a');
        await input.pressSequentially('NUEVO');
        await page.locator('.planner-cell-editor__fmt-btn--confirm').click();
        await expect(page.locator('.planner-cell-editor')).toHaveCount(0);
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        // A5 no pinta los objetivos: con un filtro por secciones visibles su copia se quedaba en «COMUN» para siempre.
        expect(textosDe(await leerGuardado(page, 'planner-a5-config'))).toEqual({ goals: 'NUEVO' });
    });

    test('traducir en A5 traduce su copia en A4 y no borra lo que solo tiene A4', async ({ page }) => {
        const semilla = semillaA5(
            { goals: { text: 'Reunión equipo' } },
            { goals: { text: 'Reunión equipo' }, 'todo-6': { text: 'Comprar pan' }, 'todo-7': { text: 'Dentista' } }
        );
        await page.addInitScript((pares) => {
            localStorage.setItem('planner-translation-consent', 'granted');
            for (const [k, v] of Object.entries(pares)) localStorage.setItem(k, v);
        }, semilla);
        const llamadas = await mockMyMemory(page);
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const objetivos = page.locator('#page1 .planner-section-text[data-section="goals"]');
        await expect(objetivos).toHaveText('Reunión equipo');

        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        await expect(objetivos).toHaveText('Team meeting');
        await expect
            .poll(() => textosA4(page))
            .toEqual({ goals: 'Team meeting', 'todo-6': 'Buy bread', 'todo-7': 'Dentist' });
        expect(paresFalsos(llamadas)).toEqual([]);
    });

    test('el ✕ revierte exacto aunque se teclee justo el texto que tiene la otra orientación', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaA5({ goals: { text: 'A5-PROPIO' } }, {}));
        await escribirEnA4(page, 'A4-PROPIO');

        // Al acabar de teclear, A5 dice lo mismo que A4: comparando tecla a tecla quedaban enlazadas y el ✕ la pisaba.
        await abrirTextos(page);
        await reescribirSeccion(page, 'goals', 'A4-PROPIO', 'cancel');
        await guardarTextos(page);
        expect(await textosA4(page)).toEqual({ goals: 'A4-PROPIO' });
        expect(textosDe(await leerGuardado(page, 'planner-a5-config'))).toEqual({ goals: 'A5-PROPIO' });
    });

    test('el Cancelar de Textos también, tras confirmar con ✓ el texto que tiene la otra orientación', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaA5({ goals: { text: 'A5-PROPIO' } }, {}));
        await escribirEnA4(page, 'A4-PROPIO');

        await abrirTextos(page);
        await reescribirSeccion(page, 'goals', 'A4-PROPIO');
        await page.locator('#textCancel').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        expect(await textosA4(page)).toEqual({ goals: 'A4-PROPIO' });
        expect(textosDe(await leerGuardado(page, 'planner-a5-config'))).toEqual({ goals: 'A5-PROPIO' });
    });

    test('Limpiar + Restaurar en A5 no rellena la celda que A4 tenía vacía', async ({ page }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaA5({ goals: { text: 'SOLO-A5' } }, A4_SOLO));
        const texto = page.locator('#page1 .planner-section-text[data-section="goals"]');
        await expect(texto).toHaveText('SOLO-A5');

        await abrirTextos(page);
        await page.locator('#contentClearBtn').click();
        await expect(texto).toHaveCount(0);
        await page.locator('#contentRestoreBtn').click();
        await expect(texto).toHaveText('SOLO-A5');
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();

        // Vacías las dos tras Limpiar, Restaurar las tomaba por enlazadas y le escribía «SOLO-A5» también a A4.
        expect(await textosA4(page)).toEqual(A4_SOLO_PLANO);
    });

    test('una celda que ya divergía no se pisa aunque lo tecleado pase por su texto, y se enlaza cuando son iguales', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, SKIP_TEXTOS);
        await gotoPlannerSeeded(page, PLANNER_URL, semillaA5({ goals: { text: 'VIEJO' } }, {}));
        await escribirEnA4(page, 'HOLA');
        const escribir = async (/** @type {string} */ texto) => {
            await abrirTextos(page);
            await reescribirSeccion(page, 'goals', texto);
            await guardarTextos(page);
        };

        // Lo tecleado en A5 pasa por «HOLA», que es lo de A4: no por eso quedan enlazadas.
        await escribir('HOLAMUNDO');
        expect(await textosA4(page)).toEqual({ goals: 'HOLA' });
        // Iguales al abrir Textos, sí: la edición siguiente llega también a A4.
        await escribir('HOLA');
        await escribir('ADIOS');
        expect(await textosA4(page)).toEqual({ goals: 'ADIOS' });
    });
});

/** Reescribe entera una sección del folio con el mini-editor (Textos ya abierto) y lo cierra con ✓ o con ✕. */
async function reescribirSeccion(
    /** @type {import('@playwright/test').Page} */ page,
    /** @type {string} */ seccion,
    /** @type {string} */ texto,
    boton = 'confirm'
) {
    const input = await editarSeccion(page, seccion);
    await input.press('ControlOrMeta+a');
    await input.pressSequentially(texto);
    await page.locator(`.planner-cell-editor__fmt-btn--${boton}`).click();
    await expect(page.locator('.planner-cell-editor')).toHaveCount(0);
}

async function guardarTextos(/** @type {import('@playwright/test').Page} */ page) {
    await page.locator('#textSave').click();
    await expect(page.locator('#textPanel')).toBeHidden();
}

/** Cambia el organizador de orientación desde Config: el primer interruptor de la vista es A5/A4. */
async function cambiarOrientacion(/** @type {import('@playwright/test').Page} */ page) {
    await page.locator('#configBtn').click();
    await page.locator('#plannerToggles .planner-config__toggle-btn').first().click();
    await page.locator('#configSave').click();
    await expect(page.locator('#configPanel')).toBeHidden();
}

/**
 * Escribe los objetivos de A4 con el mismo mini-editor y vuelve a A5. Sembrados a mano no valdrían: el mini-editor
 * guarda también un color, y la comparación entre orientaciones es por texto y color.
 */
async function escribirEnA4(/** @type {import('@playwright/test').Page} */ page, /** @type {string} */ texto) {
    await cambiarOrientacion(page);
    await abrirTextos(page);
    await reescribirSeccion(page, 'goals', texto);
    await guardarTextos(page);
    await cambiarOrientacion(page);
    expect(await textosA4(page)).toEqual({ goals: texto });
}

test.describe('Planner — Fase 6', () => {
    test('la regla @page sigue a la vista activa: A5 solo para el organizador vertical', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        const pageRule = () => page.evaluate(() => document.getElementById('plannerPageStyle')?.textContent ?? '');
        // El planner vertical (A5) es el único pliego A5; el resto son apaisados.
        await page.evaluate(() => localStorage.setItem('planner-orientation', 'vertical'));
        await page.reload();
        await waitForPlannerReady(page);
        expect(await pageRule()).toContain('A5 portrait');

        await elegirVista(page, 'styleWeekly');
        expect(await pageRule()).toContain('A4 landscape');
        await elegirVista(page, 'styleQuarterly');
        expect(await pageRule()).toContain('A4 landscape');
        await elegirVista(page, 'styleMonthly');
        expect(await pageRule()).toContain('A4 landscape');
        await elegirVista(page, 'stylePlanner');
        expect(await pageRule()).toContain('A5 portrait');
    });

    test('la basura de runtime persistida en monthly-cal se purga y no vuelve', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem(
                'planner-monthly-cal-config',
                JSON.stringify({ showTitle: true, ccaa: 'AND', province: 'AND-MA', _vacationDays: ['x'] })
            );
        });
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        // Forzar un ciclo de guardado del dominio y esperar el debounce de escritura.
        await page.evaluate(() => localStorage.getItem('planner-monthly-cal-config'));

        await expect
            .poll(async () => {
                return page.evaluate(() => {
                    const raw = localStorage.getItem('planner-monthly-cal-config');
                    const cfg = raw ? JSON.parse(raw) : {};
                    return ['ccaa', 'province', '_vacationDays'].filter((k) => k in cfg);
                });
            })
            .toEqual([]);
    });

    test('la semanal persistida se valida al cargar: un valor manipulado no llega ni al estado ni al DOM', async ({
        page,
    }) => {
        // Cada uno se interpolaba en un atributo del HTML del horario: sus comillas abrían atributos nuevos.
        const INYECCION = 'x" data-e2e-inyectado="1';
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'weekly',
            'planner-week-config': JSON.stringify({
                days: [0, 1, 2, 3, 4, INYECCION],
                hours: ['8:00', '9:30', '11:30', '13:00'],
                hourAlign: INYECCION,
                cellTexts: {
                    '0-0': { text: 'Con texto', color: INYECCION, bgColor: INYECCION },
                    '1-0': { bgColor: INYECCION },
                    '2-0': { text: 'Válido', color: '#0D47A1', bgColor: '#1976D2' },
                },
            }),
        });
        await expect(textoCelda(page, '2-0')).toHaveText('Válido');
        await expect(page.locator('.pw-table__cell[data-cell="2-0"]')).toHaveAttribute('style', /#1976D2/);
        await expect(page.locator('[data-e2e-inyectado]')).toHaveCount(0);
        await expect(page.locator('.pw-table__day-header')).toHaveCount(5);

        const semana = await page.evaluate(async (expr) => {
            const state = await import(/* @vite-ignore */ eval(expr));
            const { days, hourAlign, cellTexts } = state.getWeekConfig();
            return { days, hourAlign, cellTexts };
        }, urlModulo('planner-state.ts'));
        expect(semana.days).toEqual([0, 1, 2, 3, 4]);
        expect(semana.hourAlign).toBe('middle');
        expect(semana.cellTexts).toEqual({
            '0-0': { text: 'Con texto' },
            '2-0': { text: 'Válido', color: '#0D47A1', bgColor: '#1976D2' },
        });
    });

    test('las demás vistas también validan lo que leen de localStorage: nada manipulado llega al DOM', async ({
        page,
    }) => {
        // Alineaciones y colores se interpolan en atributos del folio, como los de la semanal.
        const INYECCION = 'x" data-e2e-inyectado="1';
        const vistas = [
            [
                '.pq-header',
                { 'planner-style': 'quarterly', 'planner-quarter-config': JSON.stringify({ titleAlign: INYECCION }) },
            ],
            [
                '.pm-header',
                {
                    'planner-style': 'monthly',
                    'planner-monthly-cal-config': JSON.stringify({ monthYearAlign: INYECCION }),
                },
            ],
            [
                '.p1-header',
                {
                    'planner-style': 'planner',
                    'planner-orientation': 'vertical',
                    'planner-a5-config': JSON.stringify({
                        monthYearAlign: INYECCION,
                        todoCount: INYECCION,
                        sectionTexts: { goals: { text: 'Hola', color: INYECCION } },
                    }),
                },
            ],
        ];
        for (const [cabecera, semilla] of vistas) {
            await gotoPlannerSeeded(page, PLANNER_URL, /** @type {Record<string, string>} */ (semilla));
            await expect(page.locator(`#page1 ${cabecera}`)).toBeVisible();
            await expect(page.locator('[data-e2e-inyectado]')).toHaveCount(0);
        }
        await expect(page.locator('#page1 .planner-section-text[data-section="goals"]')).toHaveText('Hola');
    });

    test('diseño, textos y celdas del mensual también se validan: un tema manipulado ya no rompe el arranque', async ({
        page,
    }) => {
        /** @type {string[]} */
        const errores = [];
        page.on('pageerror', (e) => errores.push(e.message));
        // Sin reloj fijo, que vacía performance.getEntriesByType (urlModulo): el día 10 del mes que abre.
        const hoy = new Date();
        const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-10`;
        const INYECCION = 'x" data-e2e-inyectado="1';
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'monthly',
            // THEMES['constructor'] es el de Object.prototype: un tema sin fuente ni meses, y el arranque petaba.
            'planner-design-config': JSON.stringify({ theme: 'constructor', bgColor: INYECCION, titleSize: INYECCION }),
            'planner-text-config': JSON.stringify({ textStyle: '__proto__', textColor: INYECCION, overrideAccent: 1 }),
            'planner-cell-texts': JSON.stringify({
                [dia]: { text: 'Hola', color: INYECCION, bgColor: INYECCION },
                [INYECCION]: { text: 'Fuera' },
            }),
        });
        await expect(page.locator(`#page1 .pm-cell[data-date="${dia}"]`)).toContainText('Hola');
        await expect(page.locator('[data-e2e-inyectado]')).toHaveCount(0);
        expect(errores).toEqual([]);

        const estado = await page.evaluate(async (expr) => {
            const state = await import(/* @vite-ignore */ eval(expr));
            const d = state.getDesignConfig();
            const x = state.getTextConfig();
            return {
                diseno: [d.theme, d.bgColor, d.titleSize],
                textos: [x.textStyle, x.textColor, x.overrideAccent],
                celdas: state.getMonthlyTexts(),
            };
        }, urlModulo('planner-state.ts'));
        expect(estado).toEqual({
            diseno: ['classic', null, 10],
            textos: [null, null, false],
            celdas: { [dia]: { text: 'Hola' } },
        });
    });

    test('los festivos guardados también se sanean: «constructor» o «__proto__» ya no rompen el arranque', async ({
        page,
    }) => {
        /** @type {string[]} */
        const errores = [];
        page.on('pageerror', (e) => errores.push(e.message));
        const fabrica = { ccaa: 'AND', province: 'AND-MA' };
        const festivos = () =>
            page.evaluate(async (expr) => {
                const state = await import(/* @vite-ignore */ eval(expr));
                return state.getHolidaysConfig();
            }, urlModulo('planner-state.ts'));
        // table.ccaa['constructor'] es la función Object y table.capital['__proto__'], Object.prototype: no iterables.
        for (const semilla of [
            { 'planner-holidays-config': JSON.stringify({ ccaa: 'constructor' }) },
            { 'planner-holidays-config': JSON.stringify({ province: '__proto__' }) },
            { 'planner-quarter-config': JSON.stringify({ ccaa: 'constructor', province: '__proto__' }) },
        ]) {
            await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'monthly', ...semilla });
            await expect(page.locator('#page1 .pm-cell').first()).toBeVisible();
            expect(await festivos()).toEqual(fabrica);
        }
        expect(errores).toEqual([]);

        // Y getHolidays no se fía de quien lo llame: lo heredado no cuenta como comunidad ni como capital.
        const nacionales = await page.evaluate(async (expr) => {
            const mod = await import(/* @vite-ignore */ eval(expr));
            const solo = mod.getHolidays(2026, { national: true }).size;
            const hostil = mod.getHolidays(2026, { national: true, ccaa: 'constructor', province: '__proto__' }).size;
            return [solo, hostil];
        }, urlModulo('planner-holidays.ts'));
        expect(nacionales[1]).toBe(nacionales[0]);
    });

    test('«— Ninguna —» (solo nacionales) sobrevive a la recarga y viaja en el código PLN1', async ({ page }) => {
        const ninguna = { ccaa: null, province: null };
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'monthly',
            'planner-holidays-config': JSON.stringify(ninguna),
        });
        await expect(page.locator('#page1 .pm-cell').first()).toBeVisible();
        const res = await page.evaluate(
            async ({ stateUrl, codeUrl }) => {
                const state = await import(/* @vite-ignore */ eval(stateUrl));
                const share = await import(/* @vite-ignore */ eval(codeUrl));
                const dec = await share.PlannerShareCode.decodeAndSanitize(
                    await share.PlannerShareCode.encodeCurrent()
                );
                return { cargado: state.getHolidaysConfig(), compartido: dec.ok ? dec.payload.holidays : 'ko' };
            },
            { stateUrl: urlModulo('planner-state.ts'), codeUrl: urlModulo('planner-share-code.ts') }
        );
        expect(res.cargado).toEqual(ninguna);
        expect(res.compartido).toEqual(ninguna);
    });

    test('la migración del config viejo del organizador también pasa por el saneador', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'planner',
            'planner-orientation': 'vertical',
            'planner-monthly-config': JSON.stringify({ todoCount: 5, showGrateful: 0, showSelfCare: 'no' }),
        });
        const paginas = await page.evaluate(async (expr) => {
            const state = await import(/* @vite-ignore */ eval(expr));
            return [state.getPlannerA5Config(), state.getPlannerA4Config()].map((c) => [
                c.todoCount,
                c.showGrateful,
                c.showSelfCare,
            ]);
        }, urlModulo('planner-state.ts'));
        // Los dos flags se copiaban en crudo después de sanear: un 0 escondía la sección sin ser un booleano.
        expect(paginas).toEqual([
            [5, true, true],
            [5, true, true],
        ]);
    });
});

// ─── Diffing de celda: los toggles del mini-editor ya no re-renderizan el folio

test.describe('Planner — Diffing de celda', () => {
    test('el toggle de vacaciones repinta SOLO su celda y el editor sobrevive', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'entra por #textToggle, que en el editor público es de escritorio');
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'monthly' });

        await page.locator('#textToggle').click();
        const celda = page.locator('.pm-cell[data-date$="-15"]').first();
        await expect(celda).toHaveClass(/is-cell-editable/);

        // Centinela en OTRA celda: un render completo la reconstruiría y lo borraría.
        await page.evaluate(() => {
            const otra = document.querySelector('.pm-cell[data-date$="-10"]');
            if (otra) otra.setAttribute('data-e2e-centinela', 'vivo');
        });

        await celda.click();
        const editor = page.locator('.planner-cell-editor');
        await expect(editor).toBeVisible();
        // El ✦ marca día libre: su tooltip es el suyo, no el del swatch de acento («Color Acento»).
        await expect(editor.locator('.planner-cell-editor__fmt-btn--vacation')).toHaveAttribute(
            'title',
            'Marcar como día libre (vacaciones)'
        );

        await editor.locator('.planner-cell-editor__fmt-btn--vacation').click();
        await expect(celda).toHaveClass(/pm-cell--vacation/);
        await expect(celda.locator('.pm-cell__vacation')).toContainText('✦');
        // El editor sigue abierto y la celda vecina conserva el centinela: NO hubo render completo.
        await expect(editor).toBeVisible();
        await expect(page.locator('[data-e2e-centinela="vivo"]')).toHaveCount(1);

        // Vuelta atrás: el mismo camino de diffing quita la marca.
        await editor.locator('.planner-cell-editor__fmt-btn--vacation').click();
        await expect(celda).not.toHaveClass(/pm-cell--vacation/);
        await expect(celda.locator('.pm-cell__vacation')).toHaveCount(0);
        await expect(page.locator('[data-e2e-centinela="vivo"]')).toHaveCount(1);
    });
});

test.describe('Planner — Interruptores del panel Textos', () => {
    test('«Festivos» oculta el NOMBRE de los festivos, no los muestra', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'el panel Textos del editor público es de escritorio');
        // La tabla de festivos es por año EXPLÍCITO: sin fijar el reloj, este test caducaría con 2026.
        await page.clock.setFixedTime(new Date('2026-10-05T10:00:00'));
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'monthly' });

        const fiesta = page.locator('.pm-cell[data-date="2026-10-12"]');
        await expect(fiesta).toHaveClass(/pm-cell--holiday/);
        await expect(fiesta.locator('.pm-cell__info')).toContainText('Fiesta Nacional');

        await page.locator('#textToggle').click();
        const festivos = page.locator('#toggleFestivosBtn');
        await expect(festivos).toHaveAttribute('title', /Ocultar el nombre de todos los festivos/);
        await festivos.click();
        await expect(festivos).toHaveClass(/is-active/);
        await expect(fiesta.locator('.pm-cell__info')).toHaveCount(0);
        // Se oculta el nombre, no el festivo: el día sigue pintado como tal.
        await expect(fiesta).toHaveClass(/pm-cell--holiday/);

        await festivos.click();
        await expect(fiesta.locator('.pm-cell__info')).toContainText('Fiesta Nacional');
    });
});

// ─── Deshacer/Rehacer, share-code y Mis planners

function urlModulo(/** @type {string} */ frag) {
    return `performance.getEntriesByType('resource').map((r) => r.name).find((u) => u.includes('${frag}')) || '/js/${frag}'`;
}

async function estiloGuardado(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate(() => localStorage.getItem('planner-style'));
}

test.describe('Planner — Deshacer/Rehacer', () => {
    test('Ctrl+Z revierte el cambio de vista y Ctrl+Y lo rehace', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'Sin teclado físico en mobile');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await expect(page.locator('#btnUndo')).toBeDisabled();

        await elegirVista(page, 'styleWeekly');
        expect(await estiloGuardado(page)).toBe('weekly');
        await expect(page.locator('#btnUndo')).toBeEnabled();

        await page.keyboard.press('Control+z');
        await expect.poll(() => estiloGuardado(page)).toBe('planner');
        await expect(page.locator('#btnRedo')).toBeEnabled();

        await page.keyboard.press('Control+y');
        await expect.poll(() => estiloGuardado(page)).toBe('weekly');
    });

    test('N acciones = N deshacer (test obligatorio)', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'Sin teclado físico en mobile');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        await elegirVista(page, 'styleWeekly');
        await elegirVista(page, 'styleMonthly');
        await elegirVista(page, 'styleQuarterly');

        await page.keyboard.press('Control+z');
        await expect.poll(() => estiloGuardado(page)).toBe('monthly');
        await page.keyboard.press('Control+z');
        await expect.poll(() => estiloGuardado(page)).toBe('weekly');
        await page.keyboard.press('Control+z');
        await expect.poll(() => estiloGuardado(page)).toBe('planner');
        await expect(page.locator('#btnUndo')).toBeDisabled();
    });

    test('los botones de la toolbar deshacen y rehacen, y se agotan', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'en móvil los botones viven en el sheet «Más» (test aparte)');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        await elegirVista(page, 'styleMonthly');
        await expect(page.locator('#btnUndo')).toBeEnabled();
        await page.locator('#btnUndo').click();
        await expect.poll(() => estiloGuardado(page)).toBe('planner');
        await expect(page.locator('#btnUndo')).toBeDisabled();

        await expect(page.locator('#btnRedo')).toBeEnabled();
        await page.locator('#btnRedo').click();
        await expect.poll(() => estiloGuardado(page)).toBe('monthly');
        await expect(page.locator('#btnRedo')).toBeDisabled();
    });

    test('Deshacer y Rehacer están EN LA BARRA en móvil, no en el sheet «Más»', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'contrato de la bottom bar');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        await elegirVista(page, 'styleMonthly');
        await expect(page.locator('#btnUndo')).toBeVisible();
        await expect(page.locator('#btnRedo')).toBeVisible();
        await expect(page.locator('#btnUndo')).toBeEnabled();

        await page.locator('#btnUndo').click();
        await expect.poll(() => estiloGuardado(page)).toBe('planner');

        await expect(page.locator('#btnUndo')).toBeDisabled();
        await expect(page.locator('#btnRedo')).toBeEnabled();
        await page.locator('#btnRedo').click();
        await expect.poll(() => estiloGuardado(page)).toBe('monthly');

        // El sheet «Más» lleva Textos (solo escritorio), Diseño, Guardados y Descargar; Traducir solo si hace falta.
        await page.locator('#btnMas').click();
        await expect(page.locator('#masPanel')).toBeVisible();
        await expect(page.locator('#masPanel .planner-mas__row:visible')).toHaveCount(4);
        await expect(page.locator('#masUndoRow')).toHaveCount(0);
        await expect(page.locator('#masLangRow')).toHaveCount(0);
    });
});

// ─── Bottom bar y sheet «Más» en móvil: cuántos botones hay y dónde vive cada uno

test.describe('Planner — Bottom bar y sheet «Más» (móvil)', () => {
    test('la barra tiene 6 botones y Diseño ya no está entre ellos', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'contrato de la bottom bar');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        await expect(page.locator('#plannerToolbar .edt-toolbar__btn:visible')).toHaveCount(6);
        await expect(page.locator('#designBtn')).toBeHidden();
        await expect(page.locator('#btnMas')).toBeVisible();
    });

    // La animación de entrada del sheet lo desplaza 18px (@starting-style). Sin neutralizarla, la
    // medida sale corrida y el test da falsos rojos según cuándo se tome.
    test('la última fila del sheet no toca el borde inferior de la pantalla', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);

        await page.locator('#btnMas').click();
        await expect(page.locator('#masPanel')).toBeVisible();
        await page.locator('#masPanel').evaluate((el) => {
            el.style.transition = 'none';
            el.style.transform = 'none';
            el.style.opacity = '1';
        });

        const hueco = await page
            .locator('#masDescargarRow')
            .evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom);
        expect(hueco).toBeGreaterThanOrEqual(14);
    });

    for (const [shell, url] of [['editor', PLANNER_URL]]) {
        test(`«Diseño» abre su panel desde el sheet, y eso NO cambia entre shells (${shell})`, async ({
            page,
        }, testInfo) => {
            test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
            await page.goto(url);
            await waitForPlannerReady(page);

            await page.locator('#btnMas').click();
            await page.locator('#masDisenoRow').click();
            await expect(page.locator('#designPanel')).toBeVisible();
            await expect(page.locator('#masPanel')).toBeHidden();
        });
    }

    test('Textos desde «Más» bloquea la barra solo mientras está abierto', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const barra = page.locator('#plannerToolbar');

        await page.locator('#btnMas').click();
        await page.locator('#masTextosRow').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        // El sheet ya esconde la barra (panel-sheet.css): el bloqueo no le quita al móvil nada que se viera.
        await expect(barra).toHaveClass(/is-blocked/);
        await expect(barra).toBeHidden();

        await page.locator('#textCancel').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        await expect(barra).not.toHaveClass(/is-blocked/);
        await page.locator('#btnMas').click();
        await page.locator('#masDescargarRow').click();
        await expect(page.locator('#exportModal')).toHaveClass(/is-open/);
    });

    // La regla base del disco fija un alto de 20 px; en la hoja, sin «height: auto», mandaba sobre el aspect-ratio y
    // cada color salía como una raya (42 × 20)
    test('los colores del editor de una casilla salen redondos, no achatados', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
        const guards = setupGuards(page);
        await gotoPlannerSeeded(page, PLANNER_URL);

        await page.locator('#btnMas').click();
        await page.locator('#masTextosRow').click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await page.locator('[data-section="todo-0"]').first().click();
        const colores = page.locator('.planner-cell-editor--sheet .planner-cell-editor__swatch');
        await expect(colores.first()).toBeVisible();

        const medidas = await colores.evaluateAll((els) =>
            els.map((el) => {
                const r = el.getBoundingClientRect();
                return { ancho: r.width, alto: r.height };
            })
        );
        expect(medidas.length).toBeGreaterThan(8);
        for (const { ancho, alto } of medidas) expect(Math.abs(ancho - alto)).toBeLessThanOrEqual(1);

        expect(guards.consoleErrors).toEqual([]);
        expect(fallosPropios(guards.failedRequests)).toEqual([]);
    });
});

// Forja de códigos hostiles DESDE Node (mismo formato PREFIJO.b64url.checksum del codec).
function djb2base36(/** @type {string} */ str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
}
function b64url(/** @type {string} */ str) {
    return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function craftCode(/** @type {string} */ json) {
    const b = b64url(json);
    return `PLNU1.${b}.${djb2base36(b)}`;
}

test.describe('Planner — Share-code', () => {
    test('roundtrip: encodeCurrent → decodeAndSanitize devuelve el estado saneado', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const res = await page.evaluate(async (expr) => {
            const mod = await import(/* @vite-ignore */ eval(expr));
            const code = await mod.PlannerShareCode.encodeCurrent();
            const dec = await mod.PlannerShareCode.decodeAndSanitize(code);
            return {
                code,
                ok: dec.ok,
                v: dec.ok ? dec.payload.v : null,
                style: dec.ok ? dec.payload.style : null,
            };
        }, urlModulo('planner-share-code.ts'));
        expect(res.code).toMatch(/^PLNU?1\.[A-Za-z0-9_-]*\.[a-z0-9]+$/);
        expect(res.ok).toBe(true);
        expect(res.v).toBe(1);
        expect(['planner', 'weekly', 'monthly', 'quarterly']).toContain(res.style);
    });

    test('códigos manipulados o basura se rechazan sin romper', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const res = await page.evaluate(async (expr) => {
            const mod = await import(/* @vite-ignore */ eval(expr));
            const code = await mod.PlannerShareCode.encodeCurrent();
            const roto = code.slice(0, -1) + (code.endsWith('z') ? 'x' : 'z');
            const outs = [];
            for (const c of [roto, 'XXXX.????.zzz', ''])
                outs.push((await mod.PlannerShareCode.decodeAndSanitize(c)).ok);
            return outs;
        }, urlModulo('planner-share-code.ts'));
        expect(res).toEqual([false, false, false]);
    });

    test('un código forjado con XSS en una celda queda saneado al decodificar', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const evil = craftCode(
            JSON.stringify({ ce: { '2026-01-15': { t: '<b onmouseover=alert(1)>hola</b><script>alert(2)</script>' } } })
        );
        const res = await page.evaluate(
            async ({ expr, code }) => {
                const mod = await import(/* @vite-ignore */ eval(expr));
                const dec = await mod.PlannerShareCode.decodeAndSanitize(code);
                return { ok: dec.ok, text: dec.ok ? dec.payload.cells['2026-01-15']?.text || '' : null };
            },
            { expr: urlModulo('planner-share-code.ts'), code: evil }
        );
        expect(res.ok).toBe(true);
        expect(res.text).toContain('hola');
        expect(res.text).not.toContain('onmouseover');
        expect(res.text).not.toContain('<script');
    });

    test('un código con __proto__ no contamina Object.prototype ni cuela claves raras', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        const evil = craftCode('{"__proto__":{"polluted":true},"st":"weekly"}');
        const res = await page.evaluate(
            async ({ expr, code }) => {
                const mod = await import(/* @vite-ignore */ eval(expr));
                const dec = await mod.PlannerShareCode.decodeAndSanitize(code);
                const probe = /** @type {Record<string, unknown>} */ ({});
                return {
                    ok: dec.ok,
                    style: dec.ok ? dec.payload.style : null,
                    polluted: probe.polluted !== undefined,
                    leaked: dec.ok && 'polluted' in dec.payload,
                };
            },
            { expr: urlModulo('planner-share-code.ts'), code: evil }
        );
        expect(res.ok).toBe(true);
        expect(res.style).toBe('weekly');
        expect(res.polluted).toBe(false);
        expect(res.leaked).toBe(false);
    });

    test('cellLangs se sanea contra lista blanca y un código sin él sigue valiendo', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        // JSON a mano: en un literal JS, `__proto__: 'es'` no crea la clave, cambia el prototipo.
        const hostil = craftCode(
            '{"tl":"en","wk":{"ct":{"0-0":{"t":"Reunión equipo"},"0-1":{"t":"Buy bread"}}},' +
                '"ce":{"2026-01-15":{"t":"Dentista"}},' +
                '"cl":{"weekly":{"0-0":"es","0-1":"en","9-9":"es","__proto__":"es"},' +
                '"monthly":{"2026-01-15":"xx","2026-01-16":"de"},"p4":{"goals":"de"},"raro":{"a":"es"}}}'
        );
        const sinIdioma = craftCode(
            JSON.stringify({ wk: { ct: { '0-0': { t: 'Hola' } } }, cl: { weekly: { '0-0': 'es' } } })
        );
        const viejo = craftCode(JSON.stringify({ tl: 'en', wk: { ct: { '0-0': { t: 'Hola' } } } }));
        const res = await page.evaluate(
            async ({ expr, codigos }) => {
                const mod = await import(/* @vite-ignore */ eval(expr));
                const out = [];
                for (const c of codigos) {
                    const dec = await mod.PlannerShareCode.decodeAndSanitize(c);
                    out.push(dec.ok ? { tl: dec.payload.textsLang, cl: dec.payload.cellLangs ?? null } : null);
                }
                return out;
            },
            { expr: urlModulo('planner-share-code.ts'), codigos: [hostil, sinIdioma, viejo] }
        );
        expect(res).toEqual([
            { tl: 'en', cl: { weekly: { '0-0': 'es' } } },
            { tl: null, cl: null },
            { tl: 'en', cl: null },
        ]);
    });

    test('una franja de texto libre viaja en el código sin descolocar los textos de debajo', async ({ page }) => {
        // La franja admite texto libre en Config; su POSICIÓN es la clave de los textos de su fila.
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'weekly',
            'planner-week-config': JSON.stringify({
                days: [0, 1, 2, 3, 4],
                hours: ['8:00', 'Recre', '11:30', '13:00'],
                cellTexts: { '0-2': { text: 'Mates' } },
            }),
        });
        await expect(page.locator('.pw-table__hour').nth(1)).toHaveText('Recre');
        await expect(textoCelda(page, '0-2')).toHaveText('Mates');
        const res = await page.evaluate(async (expr) => {
            const mod = await import(/* @vite-ignore */ eval(expr));
            const dec = await mod.PlannerShareCode.decodeAndSanitize(await mod.PlannerShareCode.encodeCurrent());
            return dec.ok ? { hours: dec.payload.week.hours, claves: Object.keys(dec.payload.week.cellTexts) } : null;
        }, urlModulo('planner-share-code.ts'));
        // El códec tiraba lo que no fuera H:MM: sin «Recre», «Mates» (fila 2) pasaba a ser la clase de las 13:00.
        expect(res).toEqual({ hours: ['8:00', 'Recre', '11:30', '13:00'], claves: ['0-2'] });
    });
});

async function abrirGuardados(/** @type {import('@playwright/test').Page} */ page) {
    if (await page.locator('#btnGuardados').isVisible()) {
        await page.locator('#btnGuardados').click();
    } else {
        await page.locator('#btnMas').click();
        await page.locator('#masGuardadosRow').click();
    }
    await expect(page.locator('#savedPanel')).toBeVisible();
}

test.describe('Planner — Mis planners', () => {
    test('la tarjeta «+» guarda al store y Compartir muestra un código válido', async ({ page }) => {
        test.slow(); // la miniatura la captura html-to-image
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));

        await abrirGuardados(page);
        await expect(page.locator('#savedShareBtn')).toBeVisible();
        await expect(page.locator('#savedImportBtn')).toBeVisible();
        const cards = page.locator('#savedList .edt-saved-card');
        await expect(cards.first()).toHaveClass(/edt-saved-card--add/);

        await page.locator('[data-action="saved-save-current"]').click();
        await expect
            .poll(
                () =>
                    page.evaluate(async (expr) => {
                        const mod = await import(/* @vite-ignore */ eval(expr));
                        return mod.PlannerSaved.list().length;
                    }, urlModulo('planner-saved.ts')),
                { timeout: 45000 }
            )
            .toBe(1);
        await expect(cards).toHaveCount(2);
        await expect(cards.first()).toHaveClass(/edt-saved-card--add/);

        await page.locator('#savedShareBtn').click();
        const dlg = page.locator('.edt-dlg-overlay');
        await expect(dlg).toBeVisible();
        await expect.poll(() => dlg.locator('textarea').inputValue()).toMatch(/^PLNU?1\.[A-Za-z0-9_-]+\.[a-z0-9]+$/);
        await dlg.locator('.edt-dlg__cancel').click();
        await expect(dlg).toBeHidden();

        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('un planner guardado sobrevive a un reset del estado y a recargar', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await page.evaluate(async (expr) => {
            localStorage.removeItem('planner-saved-v1');
            const mod = await import(/* @vite-ignore */ eval(expr));
            mod.PlannerSaved.add({ name: 'E2E-guardado', code: 'PLNU1.e2e.zz' });
        }, urlModulo('planner-saved.ts'));

        // «Reset»: fuera las claves de config del planner; el store vive en clave propia.
        await page.evaluate(() => {
            localStorage.removeItem('planner-style');
            localStorage.removeItem('planner-design-config');
        });
        await page.reload();
        await waitForPlannerReady(page);

        await abrirGuardados(page);
        await expect(page.locator('#savedList .edt-saved-card[title="E2E-guardado"]')).toBeVisible();
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('aplicar un guardado cambia el estado y Deshacer lo revierte', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'el atajo Ctrl+Z es de escritorio');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        // Entrada con el código del estado ACTUAL (vista planner), sin miniatura: rápido.
        await page.evaluate(
            async ({ shareExpr, savedExpr }) => {
                localStorage.removeItem('planner-saved-v1');
                const share = await import(/* @vite-ignore */ eval(shareExpr));
                const saved = await import(/* @vite-ignore */ eval(savedExpr));
                const code = await share.PlannerShareCode.encodeCurrent();
                saved.PlannerSaved.add({ name: 'E2E-apply', code, key: 'kE2E' });
            },
            { shareExpr: urlModulo('planner-share-code.ts'), savedExpr: urlModulo('planner-saved.ts') }
        );

        await elegirVista(page, 'styleWeekly');
        expect(await estiloGuardado(page)).toBe('weekly');

        await abrirGuardados(page);
        await page.locator('#savedList .edt-saved-card[data-id] .edt-saved-card__apply').first().click();
        await expect.poll(() => estiloGuardado(page)).toBe('planner');

        // Guardar confirma lo aplicado (Cancelar lo devolvería) y el atajo ignora paneles abiertos.
        await page.locator('#savedSave').click();
        await page.keyboard.press('Control+z');
        await expect.poll(() => estiloGuardado(page)).toBe('weekly');
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('el sello del idioma de los textos no duplica en Mis planners un folio igual a una tarjeta de antes', async ({
        page,
    }) => {
        test.slow(); // cada «+» captura su miniatura con html-to-image
        await gotoPlannerSeeded(page, PLANNER_URL, {
            'planner-style': 'weekly',
            'planner-week-config': JSON.stringify({
                days: [0, 1, 2, 3, 4],
                hours: ['8:00', '9:30'],
                cellTexts: { '0-0': { text: 'Reunión equipo' } },
            }),
        });
        // Primer arranque tras el sello: el folio vivo pasa a llevar textsLang, y con él su clave cambiaba.
        await expect.poll(() => idiomaTextos(page)).toBe('es');
        const tarjetas = page.locator('#savedList .edt-saved-card[data-id]');
        // refreshDup sube la tarjeta y renueva su createdAt; un alta nueva iría delante con otro id.
        const guardadas = () =>
            page.evaluate(() =>
                JSON.parse(localStorage.getItem('planner-saved-v1') || '[]').map(
                    (/** @type {{ id: string, createdAt: number }} */ x) => [x.id, x.createdAt > 1]
                )
            );

        // La clave de antes era el checksum del estado tal cual: tl null si nunca se tradujo, o su idioma si sí.
        for (const tl of [null, 'es']) {
            await page.evaluate(
                async ({ persistExpr, codecExpr, tl }) => {
                    const persist = await import(/* @vite-ignore */ eval(persistExpr));
                    const codec = await import(/* @vite-ignore */ eval(codecExpr));
                    const { cellLangs: _cellLangs, ...estado } = persist.getPersistablePlannerState();
                    const key = 'k' + codec.checksum(JSON.stringify({ ...estado, textsLang: tl }));
                    const tarjeta = { id: 'plDeAntes', name: 'De antes', createdAt: 1, code: 'PLNU1.e30.3774ul', key };
                    localStorage.setItem('planner-saved-v1', JSON.stringify([tarjeta]));
                },
                { persistExpr: urlModulo('planner-persist.ts'), codecExpr: urlModulo('share-codec.ts'), tl }
            );
            if (await page.locator('#savedPanel').isHidden()) await abrirGuardados(page);
            await page.locator('[data-action="saved-save-current"]').click();
            await expect.poll(guardadas, { timeout: 45000 }).toEqual([['plDeAntes', true]]);
            await expect(tarjetas).toHaveCount(1);
        }
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('tras el Cancelar de Mis planners, el folio que se aplique después no repite el número del descartado', async ({
        page,
    }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        // Hoy no se alcanza desde la UI (la barra no traduce con el panel abierto): se prueba la secuencia a mano.
        const gens = await page.evaluate(
            async ({ persistExpr, applyExpr }) => {
                const persist = await import(/* @vite-ignore */ eval(persistExpr));
                const apply = await import(/* @vite-ignore */ eval(applyExpr));
                const estado = persist.getPersistablePlannerState();
                const apertura = persist.getApplyGen();
                apply.applyFullPlannerState(estado);
                const descartado = persist.getApplyGen();
                persist.restoreApplyGen(apertura);
                apply.applyFullPlannerState(estado);
                return { apertura, descartado, siguiente: persist.getApplyGen() };
            },
            { persistExpr: urlModulo('planner-persist.ts'), applyExpr: urlModulo('planner-apply.ts') }
        );
        // Una traducción lanzada con el descartado aplicado tomaría el siguiente por su folio.
        expect(gens.siguiente).not.toBe(gens.descartado);
        expect(gens.siguiente).not.toBe(gens.apertura);
    });

    test('un código roto avisa con una frase clara, sin el identificador interno del error', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await abrirGuardados(page);

        const toasts = page.locator('#planner-toast-container .edt-toast--error');
        for (const [codigo, frase] of [
            // Checksum que no casa con el cuerpo `e30` (= «{}»): el djb2 real es `3774ul`.
            ['PLNU1.e30.zzzz', 'El código está incompleto o dañado.'],
            ['XXXX.e30.3774ul', 'Código no reconocido (¿de otra versión o app?).'],
            ['PLNU1.e30', 'El código no tiene el formato correcto.'],
        ]) {
            await page.locator('#savedImportBtn').click();
            const dlg = page.locator('.edt-dlg-overlay');
            await expect(dlg).toBeVisible();
            await dlg.locator('textarea').fill(codigo);
            await dlg.locator('.edt-dlg__ok').click();
            await expect(dlg).toBeHidden();
            // Texto EXACTO: antes se le concatenaba el código interno, «Código inválido (checksum)».
            await expect(toasts.last()).toHaveText(frase);
        }
    });

    // Aplicarlo dejaba el mes de hoy: con lo escrito en otro trimestre, parecía que el planner no se había cargado
    test('un planner guardado vuelve al trimestre en que se guardó, también desde su código', async ({ page }) => {
        test.slow(); // la miniatura la captura html-to-image
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'quarterly' });
        const mes = async () =>
            ((await page.locator('.pq-day[data-date]').first().getAttribute('data-date')) || '').slice(0, 7);
        const pasarTrimestre = async (/** @type {string} */ boton) => {
            await page.locator('#configBtn').click();
            await expect(page.locator('#configPanel')).toBeVisible();
            await page.locator(boton).click();
            await page.locator('#configSave').click();
            await expect(page.locator('#configPanel')).toBeHidden();
        };
        const hoy = await mes();
        await pasarTrimestre('#nextQuarter');
        await expect.poll(mes).not.toBe(hoy);
        const guardado = await mes();

        await abrirGuardados(page);
        await page.locator('[data-action="saved-save-current"]').click();
        await expect(page.locator('#savedList .edt-saved-card')).toHaveCount(2, { timeout: 45000 });
        await page.locator('#savedSave').click();
        await expect(page.locator('#savedPanel')).toBeHidden();

        await pasarTrimestre('#prevQuarter');
        await expect.poll(mes).toBe(hoy);
        await abrirGuardados(page);
        await page.locator('[data-action="saved-apply"]').click();
        await expect.poll(mes).toBe(guardado);
        const dlg = page.locator('.edt-dlg-overlay');
        await page.locator('#savedShareBtn').click();
        await expect.poll(() => dlg.locator('textarea').inputValue()).toMatch(/^PLNU?1\./);
        const codigo = await dlg.locator('textarea').inputValue();
        await dlg.locator('.edt-dlg__cancel').click();
        await expect(dlg).toBeHidden();

        // Cancelar devuelve también el trimestre de la apertura
        await page.locator('#savedCancel').click();
        await expect(page.locator('#savedPanel')).toBeHidden();
        await expect.poll(mes).toBe(hoy);

        // Y el código lo lleva: importarlo es ir a ese trimestre
        await abrirGuardados(page);
        await page.locator('#savedImportBtn').click();
        await expect(dlg).toBeVisible();
        await dlg.locator('textarea').fill(codigo);
        await dlg.locator('.edt-dlg__ok').click();
        await expect(dlg).toBeHidden();
        await expect.poll(mes).toBe(guardado);
        await page.locator('#savedCancel').click();
        await expect(page.locator('#savedPanel')).toBeHidden();
    });
});

test.describe('Planner — Escape en Temas y Mis planners', () => {
    test('Temas: Escape tira el borrador como Cancelar y no deja entrada de historial', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'Sin teclado físico en mobile');
        const guards = setupGuards(page);
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_H);
        const papel = () =>
            page.evaluate(() => document.documentElement.style.getPropertyValue('--planner-color-paper').trim());
        const inicial = await papel();
        await expect(page.locator('#btnUndo')).toBeDisabled();

        await page.locator('#btnTemas').click();
        await expect(page.locator('#temasPanel')).toBeVisible();
        // DISPLAY_ORDER abre con «mono» (#ffffff); el tema por defecto es classic, así que el papel cambia.
        const mono = page.locator('#designThemes .planner-design__theme-card').first();
        await mono.click();
        await expect.poll(papel).toBe('#ffffff');

        await page.keyboard.press('Escape');
        await expect(page.locator('#temasPanel')).toBeHidden();
        await expect(page.locator('#btnTemas')).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('.planner-config-backdrop')).toHaveCount(0);
        expect(await papel()).toBe(inicial);
        await expect(page.locator('#btnUndo')).toBeDisabled();
        await expect
            .poll(() =>
                page.evaluate(
                    () => JSON.parse(localStorage.getItem('planner-design-config') || '{}').theme ?? 'classic'
                )
            )
            .toBe('classic');

        await page.locator('#btnTemas').click();
        await expect(mono).not.toHaveClass(/is-active/);
        await page.locator('#temasCancel').click();
        expect(guards.consoleErrors).toEqual([]);
    });

    test('Mis planners: Escape deshace lo aplicado como Cancelar y la lista se queda', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'Sin teclado físico en mobile');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await page.evaluate(
            async ({ shareExpr, savedExpr }) => {
                localStorage.removeItem('planner-saved-v1');
                const share = await import(/* @vite-ignore */ eval(shareExpr));
                const saved = await import(/* @vite-ignore */ eval(savedExpr));
                const code = await share.PlannerShareCode.encodeCurrent();
                saved.PlannerSaved.add({ name: 'E2E-escape', code, key: 'kE2E-escape' });
            },
            { shareExpr: urlModulo('planner-share-code.ts'), savedExpr: urlModulo('planner-saved.ts') }
        );

        await elegirVista(page, 'styleWeekly');
        await abrirGuardados(page);
        await page.locator('#savedList .edt-saved-card[data-id] .edt-saved-card__apply').first().click();
        await expect.poll(() => estiloGuardado(page)).toBe('planner');

        await page.keyboard.press('Escape');
        await expect(page.locator('#savedPanel')).toBeHidden();
        await expect(page.locator('#btnGuardados')).toHaveAttribute('aria-expanded', 'false');
        await expect.poll(() => estiloGuardado(page)).toBe('weekly');
        // La lista no viaja en el borrador: la tarjeta sigue guardada.
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('planner-saved-v1') || '[]').length)).toBe(1);
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('Escape dentro del diálogo «Añadir código» cierra SOLO el diálogo', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'Sin teclado físico en mobile');
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await abrirGuardados(page);

        await page.locator('#savedImportBtn').click();
        const dlg = page.locator('.edt-dlg-overlay');
        await expect(dlg).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dlg).toHaveCount(0);
        await expect(page.locator('#savedPanel')).toBeVisible();

        // Control positivo: ya sin diálogo, el mismo Escape sí cierra el panel.
        await page.keyboard.press('Escape');
        await expect(page.locator('#savedPanel')).toBeHidden();
    });
});

test.describe('Planner — aria-pressed de los interruptores', () => {
    test('los cuatro de Textos lo siguen por clic, Restablecer, Restaurar, Deshacer y al cargar un guardado', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'el panel Textos del editor público es de escritorio');
        await gotoPlannerSeeded(page, PLANNER_URL, SEED_CON_TEXTO);
        const panel = page.locator('#textPanel');
        const formatos = page.locator('#toggleFormatsBtn');
        const acento = page.locator('#toggleAccentBtn');
        const abrirTextos = async () => {
            await page.locator('#textToggle').click();
            await expect(panel).toBeVisible();
        };

        await abrirTextos();
        for (const id of ['toggleFormatsBtn', 'toggleAccentBtn', 'toggleLibresBtn', 'toggleFestivosBtn']) {
            await expect(page.locator(`#${id}`)).toHaveAttribute('aria-pressed', 'false');
        }
        await formatos.click();
        await expect(formatos).toHaveAttribute('aria-pressed', 'true');
        await page.locator('#textOverridesReset').click();
        await expect(formatos).toHaveAttribute('aria-pressed', 'false');

        // Restaurar devuelve los interruptores que había al pulsar Limpiar.
        await page.locator('#contentClearBtn').click();
        await formatos.click();
        await expect(formatos).toHaveAttribute('aria-pressed', 'true');
        await page.locator('#contentRestoreBtn').click();
        await expect(formatos).toHaveAttribute('aria-pressed', 'false');

        // Se guarda con Acento encendido y se deja un guardado con ese estado para el final.
        await acento.click();
        await expect(acento).toHaveAttribute('aria-pressed', 'true');
        await page.locator('#textSave').click();
        await expect(panel).toBeHidden();
        await page.evaluate(
            async ({ shareExpr, savedExpr }) => {
                localStorage.removeItem('planner-saved-v1');
                const share = await import(/* @vite-ignore */ eval(shareExpr));
                const saved = await import(/* @vite-ignore */ eval(savedExpr));
                const code = await share.PlannerShareCode.encodeCurrent();
                saved.PlannerSaved.add({ name: 'E2E-aria', code, key: 'kE2E-aria' });
            },
            { shareExpr: urlModulo('planner-share-code.ts'), savedExpr: urlModulo('planner-saved.ts') }
        );

        // Deshacer y cargar un guardado cambian el estado con el panel CERRADO: se ve al reabrirlo.
        await page.locator('#btnUndo').click();
        await abrirTextos();
        await expect(acento).toHaveAttribute('aria-pressed', 'false');
        await page.locator('#textCancel').click();
        await expect(panel).toBeHidden();

        await abrirGuardados(page);
        await page.locator('#savedList .edt-saved-card[data-id] .edt-saved-card__apply').first().click();
        await expect(page.locator('#savedList .edt-saved-card.is-applied')).toHaveCount(1);
        await page.locator('#savedSave').click();
        await expect(page.locator('#savedPanel')).toBeHidden();
        await abrirTextos();
        await expect(acento).toHaveAttribute('aria-pressed', 'true');
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('el ✦ y la F del mini-editor lo llevan, y lo releen de la celda al reabrir', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'entra por #textToggle, que en el editor público es de escritorio');
        // Navidad de 2026 cae en viernes, lejos del panel que tapa la izquierda; y la tabla de festivos va por año.
        await page.clock.setFixedTime(new Date('2026-12-10T10:00:00'));
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'monthly' });
        await page.locator('#textToggle').click();

        const fiesta = page.locator('.pm-cell[data-date="2026-12-25"]');
        await expect(fiesta).toHaveClass(/is-cell-editable/);
        const editor = page.locator('.planner-cell-editor');
        const libre = editor.locator('.planner-cell-editor__fmt-btn--vacation');
        const festivo = editor.locator('.planner-cell-editor__fmt-btn--holiday-hide');

        await fiesta.click();
        await expect(libre).toHaveAttribute('aria-pressed', 'false');
        // La F encendida es «el nombre del festivo se ve»; su texto es solo «F», de ahí el aria-label.
        await expect(festivo).toHaveAttribute('aria-pressed', 'true');
        await expect(festivo).toHaveAttribute('aria-label', 'Festivo visible');

        await libre.click();
        await festivo.click();
        await expect(libre).toHaveAttribute('aria-pressed', 'true');
        await expect(festivo).toHaveAttribute('aria-pressed', 'false');

        // Un editor nuevo parte del estado de la celda: es el camino de Deshacer y de un guardado.
        await editor.locator('.planner-cell-editor__fmt-btn--confirm').click();
        await expect(editor).toHaveCount(0);
        await fiesta.click();
        await expect(libre).toHaveAttribute('aria-pressed', 'true');
        // Habilitada: el «false» de la rama deshabilitada no probaría que se releyó la celda.
        await expect(festivo).toBeEnabled();
        await expect(festivo).toHaveAttribute('aria-pressed', 'false');
    });

    test('el ✦ y la F responden a Enter y Espacio, y la F se anuncia en el idioma de la página', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en mobile');
        await page.clock.setFixedTime(new Date('2026-12-10T10:00:00'));
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'monthly', 'planner-lang': 'de' });
        await page.locator('#textToggle').click();

        const fiesta = page.locator('.pm-cell[data-date="2026-12-25"]');
        await expect(fiesta).toHaveClass(/is-cell-editable/);
        const editor = page.locator('.planner-cell-editor');
        const libre = editor.locator('.planner-cell-editor__fmt-btn--vacation');
        const festivo = editor.locator('.planner-cell-editor__fmt-btn--holiday-hide');

        await fiesta.click();
        await expect(festivo).toHaveAttribute('aria-label', 'Feiertag sichtbar');
        // Enter y Espacio llegan como un click con detail 0, sin mousedown: solo con él no hacían nada.
        await libre.focus();
        await page.keyboard.press('Enter');
        await expect(libre).toHaveAttribute('aria-pressed', 'true');
        await festivo.focus();
        await page.keyboard.press('Space');
        await expect(festivo).toHaveAttribute('aria-pressed', 'false');

        await editor.locator('.planner-cell-editor__fmt-btn--confirm').focus();
        await page.keyboard.press('Enter');
        await expect(editor).toHaveCount(0);
        await fiesta.click();
        await expect(libre).toHaveAttribute('aria-pressed', 'true');
        await expect(festivo).toBeEnabled();
        await expect(festivo).toHaveAttribute('aria-pressed', 'false');
    });

    test('pulsados por un lector de pantalla, el ✦ y la B cambian UNA vez', async ({ page }, testInfo) => {
        const movil = testInfo.project.name === 'Mobile Safari';
        await page.clock.setFixedTime(new Date('2026-12-10T10:00:00'));
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'monthly' });
        if (movil) {
            await page.locator('#btnMas').click();
            await page.locator('#masTextosRow').click();
        } else {
            await page.locator('#textToggle').click();
        }
        await expect(page.locator('#textPanel')).toBeVisible();

        const fiesta = page.locator('.pm-cell[data-date="2026-12-25"]');
        await expect(fiesta).toHaveClass(/is-cell-editable/);
        await fiesta.click();
        const editor = page.locator('.planner-cell-editor');
        const libre = editor.locator('.planner-cell-editor__fmt-btn--vacation');
        const negrita = editor.locator('.planner-cell-editor__fmt-btn--bold');
        const input = editor.locator('.planner-cell-editor__input');
        // Lo que manda la activación de un lector (NVDA, VoiceOver): mousedown, mouseup y un click con detail 0.
        const comoLector = (/** @type {import('@playwright/test').Locator} */ boton) =>
            boton.evaluate((b) => {
                for (const tipo of ['mousedown', 'mouseup', 'click'])
                    b.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, detail: 0 }));
            });

        await expect(libre).toHaveAttribute('aria-pressed', 'false');
        await comoLector(libre);
        await expect(libre).toHaveAttribute('aria-pressed', 'true');

        await input.pressSequentially('Repaso');
        await page.keyboard.press('Shift+Home');
        await comoLector(negrita);
        await expect(input.locator('b')).toHaveCount(1);
        await expect(negrita).toHaveClass(/is-active/);
    });
});

test.describe('Planner — Nombres accesibles de los controles', () => {
    test('los − + de las cantidades del organizador se anuncian con su fila, en el idioma de la interfaz', async ({
        page,
    }) => {
        const nombres = async (/** @type {string[]} */ esperados) => {
            await page.locator('#configBtn').click();
            await expect(page.locator('#configPanel')).toBeVisible();
            const filas = page.locator('#plannerInputs');
            for (const nombre of esperados) {
                await expect(filas.getByRole('button', { name: nombre, exact: true }), nombre).toHaveCount(1);
            }
        };
        await gotoPlannerSeeded(page, PLANNER_URL, { ...SEED_H, 'planner-lang': 'es' });
        await nombres(['Disminuir Tareas', 'Aumentar Tareas', 'Disminuir Hábitos', 'Aumentar Hábitos']);
        await gotoPlannerSeeded(page, PLANNER_URL, { ...SEED_H, 'planner-lang': 'de' });
        await nombres(['Verringern Aufgaben', 'Erhöhen Aufgaben', 'Verringern Gewohnheiten', 'Erhöhen Gewohnheiten']);
    });

    test('B, I, U, • y 1. del mini-editor se anuncian por lo que hacen, también en inglés', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'entra por #textToggle, que en el editor público es de escritorio');
        // Navidad de 2026 cae en viernes, lejos del panel que tapa la izquierda
        await page.clock.setFixedTime(new Date('2026-12-10T10:00:00'));
        const nombres = async (/** @type {string} */ lang, /** @type {string[]} */ esperados) => {
            await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-style': 'monthly', 'planner-lang': lang });
            await page.locator('#textToggle').click();
            const fiesta = page.locator('.pm-cell[data-date="2026-12-25"]');
            await expect(fiesta).toHaveClass(/is-cell-editable/);
            await fiesta.click();
            const editor = page.locator('.planner-cell-editor');
            await expect(editor).toBeVisible();
            // Su texto es «B», «I», «U», «•» y «1.»: sin aria-label el lector leía eso y el title solo lo describía
            for (const nombre of esperados) {
                await expect(editor.getByRole('button', { name: nombre, exact: true }), nombre).toHaveCount(1);
            }
        };
        await nombres('es', [
            'Negrita (Ctrl+B)',
            'Cursiva (Ctrl+I)',
            'Subrayado (Ctrl+U)',
            'Lista de puntos',
            'Lista numerada',
        ]);
        await nombres('en', ['Bold (Ctrl+B)', 'Italic (Ctrl+I)', 'Underline (Ctrl+U)', 'Bullet list', 'Numbered list']);
    });
});

// 25 = `max` de planner-saved.ts. Sin miniatura: la tarjeta cae al swatch y no hace falta html-to-image.
async function sembrarGuardados(/** @type {import('@playwright/test').Page} */ page, total = 25) {
    await page.evaluate((n) => {
        const lista = Array.from({ length: n }, (_, i) => ({
            id: 'plE2E' + i,
            name: 'E2E-' + i,
            createdAt: 1,
            bgSwatch: '#ffffff',
            thumb: null,
            code: 'PLNU1.e2e' + i + '.zz',
            key: 'kE2E' + i,
        }));
        localStorage.setItem('planner-saved-v1', JSON.stringify(lista));
    }, total);
}

async function idsGuardados(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate(() =>
        JSON.parse(localStorage.getItem('planner-saved-v1') || '[]').map((/** @type {{ id: string }} */ x) => x.id)
    );
}

test.describe('Planner — Mis planners lleno', () => {
    test('con 25 guardados, «+» no quita ninguna tarjeta y avisa de borrar una', async ({ page }) => {
        await page.goto(PLANNER_URL);
        await waitForPlannerReady(page);
        await sembrarGuardados(page);
        await abrirGuardados(page);
        const tarjetas = page.locator('#savedList .edt-saved-card[data-id]');
        await expect(tarjetas).toHaveCount(25);

        await page.locator('[data-action="saved-save-current"]').click();
        await expect(page.locator('#planner-toast-container .edt-toast--warning')).toContainText('25');
        await expect(tarjetas).toHaveCount(25);
        expect(await idsGuardados(page)).toEqual(Array.from({ length: 25 }, (_, i) => 'plE2E' + i));

        // Llena, un DUPLICADO sí cabe: refresca su tarjeta en vez de añadir otra.
        const cabe = await page.evaluate(async (expr) => {
            const mod = await import(/* @vite-ignore */ eval(expr));
            return { nueva: mod.PlannerSaved.canAdd({ key: 'kOtra' }), dup: mod.PlannerSaved.canAdd({ key: 'kE2E7' }) };
        }, urlModulo('planner-saved.ts'));
        expect(cabe).toEqual({ nueva: false, dup: true });
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });
});

// ─── Con el planner en inglés o alemán no queda nada en castellano (D9)

test.describe('Planner — En inglés o alemán no sale nada en castellano', () => {
    test('en inglés, los tres diálogos de Mis planners y la tipografía de Textos no hablan castellano', async ({
        page,
    }, testInfo) => {
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-lang': 'en' });
        await expect(page.locator('#textFontSelect')).toHaveAttribute('aria-label', 'Font');
        await sembrarGuardados(page, 1);
        await abrirGuardados(page);
        const dlg = page.locator('.edt-dlg-overlay');
        const cancelar = dlg.locator('.edt-dlg__cancel');

        await page.locator('#savedShareBtn').click();
        await expect(cancelar.locator('span')).toHaveText('Cancel');
        await cancelar.click();
        await expect(dlg).toHaveCount(0);

        await page.locator('#savedImportBtn').click();
        await expect(cancelar.locator('span')).toHaveText('Cancel');
        await cancelar.click();
        await expect(dlg).toHaveCount(0);

        const tarjeta = page.locator('#savedList .edt-saved-card[data-id]').first();
        // En táctil las acciones ya se ven sin hover.
        if (testInfo.project.name !== 'Mobile Safari') await tarjeta.hover();
        await tarjeta.locator('[data-action="saved-delete"]').click();
        await expect(dlg.locator('.edt-dlg__ok span')).toHaveText('Accept');
        await expect(cancelar.locator('span')).toHaveText('Cancel');
        await cancelar.click();
        await expect(dlg).toHaveCount(0);
        expect(await idsGuardados(page)).toEqual(['plE2E0']);
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('en alemán, la fila del tramo de la semanal lleva un icono con nombre, no un «Set» fijo', async ({ page }) => {
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-lang': 'de', 'planner-style': 'weekly' });
        await page.locator('#configBtn').click();
        await expect(page.locator('#configPanel')).toBeVisible();

        const tramo = page.locator('#hoursInputs .planner-config__hour-top-row .planner-config__hour-label').first();
        await expect(tramo).toHaveText(/^$/);
        await expect(tramo.locator('i.fa-stopwatch')).toHaveCount(1);
        await expect(tramo).toHaveAttribute('role', 'img');
        await expect(tramo).toHaveAttribute('aria-label', 'Schritt');
        await expect(tramo).toHaveAttribute('title', 'Schritt');
        // El icono de «Aplicar» es adorno: el botón de al lado ya lleva su texto
        await expect(page.locator('#hoursInputs i.fa-sync-alt')).toHaveAttribute('aria-hidden', 'true');
    });

    test('los archivos se nombran en el idioma del planner; en castellano, como siempre', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'share-sheet nativo / descarga de Blob URL no determinista en WebKit');
        test.slow(); // cuatro capturas con html-to-image
        // En marzo: el alemán lo escribe «März», y el nombre del archivo va sin diacríticos.
        await page.clock.setFixedTime(new Date('2026-03-10T10:00:00'));
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-lang': 'es', 'planner-style': 'quarterly' });
        const descargar = async () => {
            await openExportModal(page);
            const descarga = page.waitForEvent('download', { timeout: 45000 });
            await page.locator('#exportPages > button').click();
            const nombre = (await descarga).suggestedFilename();
            await expect(page.locator('body')).not.toHaveClass(/is-exporting/, { timeout: 15000 });
            return nombre;
        };

        expect(await descargar()).toBe('planner-T1-2026.jpg');

        // Sin textos el botón cambia la interfaz sin traducir nada.
        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');
        expect(await descargar()).toBe('planner-Q1-2026.jpg');

        await elegirVista(page, 'styleWeekly');
        expect(await descargar()).toMatch(nombreExport('week\\d\\.jpg', MESES_EN));

        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('DEU');
        expect(await descargar()).toMatch(/^planner-marz-2026-woche\d\.jpg$/);
    });

    test('en alemán, la confirmación de borrar un guardado dice «OK»', async ({ page }, testInfo) => {
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-lang': 'de' });
        await sembrarGuardados(page, 1);
        await abrirGuardados(page);
        const tarjeta = page.locator('#savedList .edt-saved-card[data-id]').first();
        if (testInfo.project.name !== 'Mobile Safari') await tarjeta.hover();
        await tarjeta.locator('[data-action="saved-delete"]').click();
        const dlg = page.locator('.edt-dlg-overlay');
        await expect(dlg.locator('.edt-dlg__ok span')).toHaveText('OK');
        await dlg.locator('.edt-dlg__cancel').click();
        await expect(dlg).toHaveCount(0);
        await page.evaluate(() => localStorage.removeItem('planner-saved-v1'));
    });

    test('el asa del sheet se anuncia en el idioma de la interfaz, también tras cambiarlo', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
        await gotoPlannerSeeded(page, PLANNER_URL, { 'planner-lang': 'es' });
        await pulsarIdioma(page);
        await expect(page.locator('#langLabel')).toHaveText('ENG');

        await page.locator('#btnMas').click();
        await expect(page.locator('#masPanel')).toBeVisible();
        await expect(page.locator('#masPanel > .edt-sheet__handle')).toHaveAttribute(
            'aria-label',
            'Drag to lower or raise the panel'
        );
    });
});
