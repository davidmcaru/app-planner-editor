// @ts-check
import { test, expect } from '@playwright/test';

const PLANNER_URL = '/';
const LS_WEEK = 'planner-week-config';

// Viernes (dayIdx 4) × franja 1. Columna derecha a propósito: el panel de Textos (left:40px, w:260px —
// planner-base.css:191-198) y el toolbar (left:50px) tapan la izquierda de la página A4 escalada a 0.88…
const CELL = '4-1';
const CELL_SEL = `.pw-table__cell[data-cell="${CELL}"]`;
const TEXT = 'Repaso';

// La fila de swatches de FONDO comparte clase con la de texto (planner-mini-editor.ts:715) y repite los mismos
// data-color-value → hay que distinguirlas o salta strict mode. La de fondo es la única con el swatch 'NONE'…
const TEXT_PALETTE = '.planner-cell-editor__color-row:not(:has(.planner-cell-editor__swatch--no-color))';
const BG_PALETTE = '.planner-cell-editor__color-row:has(.planner-cell-editor__swatch--no-color)';

const EDITOR = '.planner-cell-editor';
const INPUT = '.planner-cell-editor__input';
const BTN_BOLD = '.planner-cell-editor__fmt-btn--bold';
const BTN_CONFIRM = '.planner-cell-editor__fmt-btn--confirm';
const BTN_CANCEL = '.planner-cell-editor__fmt-btn--cancel';

// ─── Helpers

/** Captura errores de consola y requests fallidas (misma forma que planner.spec.js:30-46). */
function setupGuards(/** @type {import('@playwright/test').Page} */ page) {
    /** @type {string[]} */
    const consoleErrors = [];
    /** @type {string[]} */
    const failedRequests = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', (request) => {
        if (request.failure()?.errorText?.includes('aborted')) return;
        failedRequests.push(request.url());
    });
    return { consoleErrors, failedRequests };
}

function skipMobile(/** @type {import('@playwright/test').TestInfo} */ testInfo, reason) {
    test.skip(testInfo.project.name === 'Mobile Safari', reason);
}

/** Siembra el estado y arranca el planner en vista semanal (por defecto, el editor público). */
async function bootWeekly(/** @type {import('@playwright/test').Page} */ page, url = PLANNER_URL) {
    await page.addInitScript(() => {
        // ⚠️ El centinela NO es adorno: addInitScript corre en CADA navegación, también en
        // reload(), y sin él la recarga borraría el cellTexts que estos tests usan de oráculo.
        if (localStorage.getItem('e2e-weekly-seeded')) return;
        localStorage.setItem('e2e-weekly-seeded', '1');
        localStorage.setItem('planner-style', 'weekly');
        localStorage.setItem('planner-lang', 'es');
        localStorage.setItem(
            'planner-week-config',
            JSON.stringify({
                days: [0, 1, 2, 3, 4],
                hours: ['8:00', '9:30', '11:30', '13:00', '15:00', '16:30'],
                cellTexts: {},
            })
        );
    });
    await page.goto(url);
    // body.page-ready lo pone el controller al final del init (planner-controller.ts:911-914)
    await expect(page.locator('body')).toHaveClass(/page-ready/);
    await expect(page.locator('#page1')).toBeVisible();
    await expect(page.locator(CELL_SEL)).toBeVisible();
}

async function openTextMode(/** @type {import('@playwright/test').Page} */ page) {
    if (await page.locator('#textToggle').isVisible()) {
        await page.locator('#textToggle').click();
    } else {
        await page.locator('#btnMas').click();
        await page.locator('#masTextosRow').click();
    }
    await expect(page.locator('#textPanel')).toBeVisible();
    // aria-expanded lo sincroniza panelStore.onChange (planner-controller.ts:198-205)
    await expect(page.locator('#textToggle')).toHaveAttribute('aria-expanded', 'true');
    // is-cell-editable = _bindCellEditClicks ya corrió (planner-text-edit-weekly.ts:160)
    await expect(page.locator(CELL_SEL)).toHaveClass(/is-cell-editable/);
}

/** Abre el mini-editor sobre la celda de prueba y devuelve su locator. */
async function openCellEditor(/** @type {import('@playwright/test').Page} */ page) {
    await page.locator(CELL_SEL).click();
    const editor = page.locator(EDITOR);
    await expect(editor).toHaveCount(1);
    await expect(editor).toBeVisible();
    // createMiniEditor termina con textInput.focus() (planner-mini-editor.ts:935)
    await expect(page.locator(INPUT)).toBeFocused();
    return editor;
}

// Fuerza el flush SÍNCRONO de las escrituras debounced (250ms — core/storage/debounced-storage.ts). Sin esto,
// cualquier aserción NEGATIVA sobre localStorage pasa por llegar antes que la escritura, no por ser cierta.…
async function flushStorage(/** @type {import('@playwright/test').Page} */ page) {
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
}

/** Lee cellTexts de planner-week-config (null si la clave no existe o no parsea). */
async function storedCellTexts(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw).cellTexts ?? null;
        } catch {
            return null;
        }
    }, LS_WEEK);
}

/** ¿El foco sigue dentro del mini-editor? */
async function focusInsideEditor(/** @type {import('@playwright/test').Page} */ page) {
    return page.evaluate((sel) => !!document.querySelector(sel)?.contains(document.activeElement), EDITOR);
}

test.describe('Planner Mini-editor — escritura y persistencia', () => {
    test('T1 · escribir + negrita + confirmar persiste el texto tras recargar', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'el flujo de escritorio; el móvil lo cubren los M*');
        const guards = setupGuards(page);

        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);

        // ── Escribir: cada keystroke dispara input → triggerAutoApply (planner-mini-editor.ts:583-592)
        const input = page.locator(INPUT);
        await input.pressSequentially(TEXT);
        await expect(input).toHaveText(TEXT);

        // ── Seleccionar lo escrito (Shift+Home: local a la línea, sin tocar el resto del documento)
        await page.keyboard.press('Shift+Home');
        const selectedLength = await page.evaluate(() => (window.getSelection()?.toString() || '').length);
        expect(selectedLength).toBe(TEXT.length); // si la selección quedó vacía, el test DEBE caer aquí

        // ── Negrita: mousedown con preventDefault (planner-mini-editor.ts:322-330) → execCommand('bold')
        const boldBtn = page.locator(BTN_BOLD);
        await expect(boldBtn).toBeEnabled(); // formatsDisabled=false por defecto (planner-state-text.ts:19)
        await boldBtn.click();

        // updateFmtState() marca is-active leyendo queryCommandState (planner-mini-editor.ts:350-355)
        await expect(boldBtn).toHaveClass(/is-active/);
        // Chromium con styleWithCSS=false emite <b>, que sanitizeCellHTML preserva
        // (components/features/utils/sanitize-html.js:42-43)
        await expect(page.locator(`${INPUT} b`)).toHaveCount(1);

        // ── Confirmar ✓ → _confirmEditor() cierra y re-renderiza (planner-mini-editor.ts:500-512)
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);

        // La celda re-renderizada lleva el span de texto (planner-ui-weekly.ts:82)
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveText(TEXT);
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text b`)).toHaveCount(1);

        // ── Guardar el panel (el toolbar está is-blocked: NO se puede re-clicar #textToggle)
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();

        // ── Persistencia: flush determinista + recarga
        await flushStorage(page);
        const stored = await storedCellTexts(page);
        expect(stored).not.toBeNull();
        expect(stored?.[CELL]?.text ?? '').toContain(TEXT);
        expect(stored?.[CELL]?.text ?? '').toMatch(/<b>/i);

        await page.reload();
        await expect(page.locator('body')).toHaveClass(/page-ready/);
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveText(TEXT);
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text b`)).toHaveCount(1);

        expect(guards.consoleErrors).toEqual([]);
        expect(guards.failedRequests).toEqual([]);
    });
});

test.describe('Planner Mini-editor — cancelar', () => {
    test('T2 · el ✕ del mini-editor revierte la celda y NO deja rastro en localStorage', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'el flujo de escritorio; el móvil lo cubren los M*');
        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);

        const input = page.locator(INPUT);
        await input.pressSequentially(TEXT);
        await expect(input).toHaveText(TEXT);
        // El auto-apply YA pintó el preview en la celda (planner-text-edit-weekly.ts:237-249)
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveText(TEXT);

        // ✕ → _cancelEditor(): onRestore repinta la celda y onCancel borra la clave
        // (planner-mini-editor.ts:526-539 + planner-text-edit-weekly.ts:275-284)
        await page.locator(BTN_CANCEL).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveCount(0);
        // El panel de Textos sigue abierto: cancelar la celda no cancela el modo
        await expect(page.locator('#textPanel')).toBeVisible();

        // El flush es OBLIGATORIO: sin él esta aserción negativa pasaría por llegar antes
        // de la escritura debounced, no por ser cierta.
        await flushStorage(page);
        const stored = await storedCellTexts(page);
        expect(stored).not.toBeNull();
        expect(Object.keys(stored ?? {})).not.toContain(CELL);
    });

    test('T3 · "Cancelar" del panel Textos revierte una celda ya CONFIRMADA', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'el flujo de escritorio; el móvil lo cubren los M*');
        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);

        await page.locator(INPUT).pressSequentially(TEXT);
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveText(TEXT);

        // Confirmar la celda SÍ escribió en storage (el auto-apply escribe al teclear)
        await flushStorage(page);
        expect(Object.keys((await storedCellTexts(page)) ?? {})).toContain(CELL);

        // #textCancel → closeText() → exit('cancel') restaura el snapshot de enter()
        // (planner-text-edit-weekly.ts:97-101) y _restoreContentFromSnapshot el de openText()…
        await page.locator('#textCancel').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveCount(0);

        await flushStorage(page);
        expect(Object.keys((await storedCellTexts(page)) ?? {})).not.toContain(CELL);

        // Y tras recargar sigue vacía: la reversión también se persistió
        await page.reload();
        await expect(page.locator('body')).toHaveClass(/page-ready/);
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveCount(0);
    });
});

test.describe('Planner Mini-editor — teclado', () => {
    test('T4 · Escape cierra el mini-editor pero NO el panel de Textos', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en Mobile Safari');

        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);
        await page.locator(INPUT).pressSequentially(TEXT);

        // El keydown del contenteditable hace stopPropagation (planner-mini-editor.ts:601-609), así que el
        // handler de documento que cierra el panel (planner-controller.ts:762-763) NO llega a dispararse. Si…
        await page.keyboard.press('Escape');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(page.locator('#textPanel')).toBeVisible();
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveCount(0);

        // Un segundo Escape, ya fuera del editor, sí cierra el panel
        await page.keyboard.press('Escape');
        await expect(page.locator('#textPanel')).toBeHidden();
    });

    test('T9 · B, I, ↺, ✓, ✕ y 🗑 responden a Enter y Espacio, no solo al ratón', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'sin teclado físico en Mobile Safari');
        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);
        const input = page.locator(INPUT);
        const textoCelda = page.locator(`${CELL_SEL} .pw-table__cell-text`);
        await input.pressSequentially(TEXT);
        await page.keyboard.press('Shift+Home');

        // Enter y Espacio llegan como un click con detail 0 y sin mousedown: con solo el mousedown, nada.
        await page.locator(BTN_BOLD).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(`${INPUT} b`)).toHaveCount(1);
        await expect(page.locator(BTN_BOLD)).toHaveClass(/is-active/);
        await expect(page.locator(BTN_BOLD), 'el foco se queda en el botón para encadenar formatos').toBeFocused();
        await page.locator('.planner-cell-editor__fmt-btn--italic').focus();
        await page.keyboard.press('Space');
        await expect(page.locator(`${INPUT} i`)).toHaveCount(1);

        await page.locator('.planner-cell-editor__fmt-btn--reset').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(`${INPUT} b, ${INPUT} i`)).toHaveCount(0);
        await expect(input).toHaveText(TEXT);

        await page.locator(BTN_CONFIRM).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(textoCelda).toHaveText(TEXT);

        await openCellEditor(page);
        await input.pressSequentially('X');
        await page.locator(BTN_CANCEL).focus();
        await page.keyboard.press('Space');
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect(textoCelda).toHaveText(TEXT);

        await openCellEditor(page);
        await page.locator('.planner-cell-editor__fmt-btn--delete').focus();
        await page.keyboard.press('Enter');
        await expect(textoCelda).toHaveCount(0);
    });
});

test.describe('Planner Mini-editor — focus trap (planner-mini-editor.ts:622-638)', () => {
    test('T5 · el foco entra en el contenteditable y Shift+Tab no lo saca del editor', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'Recorrido por teclado: desktop only');

        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page); // ya asserta toBeFocused() sobre el contenteditable

        // 12 Shift+Tab: hay 8 focusables visibles por delante del input (✓ ↺ 🗑 ✕ 🪣 B I U),
        // así que a partir del 9º se ejercita la rama `active === first` del trap.
        for (let i = 0; i < 12; i++) {
            await page.keyboard.press('Shift+Tab');
            expect(await focusInsideEditor(page), `el foco salió del editor en el Shift+Tab nº ${i + 1}`).toBe(true);
        }
    });

    // `test.fail()`: el trap propio metía en el ciclo los 16 swatches de la fila de
    // FONDO (display:none). El compartido filtra por visibilidad y captura en `document`.
    test('T6 · Tab hacia adelante cicla dentro del editor', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'Recorrido por teclado: desktop only');

        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);

        // 25 focusables visibles (4 de la fila 1 + 4 de formato + input + 16 swatches).
        // Desde el input hacen falta 16 Tab para llegar al último swatch; el 17º escapa.
        for (let i = 0; i < 20; i++) {
            await page.keyboard.press('Tab');
            expect(await focusInsideEditor(page), `el foco salió del editor en el Tab nº ${i + 1}`).toBe(true);
        }
    });
});

test.describe('Planner Mini-editor — gate de plataforma', () => {
    test('T7b · la fila Textos ABRE el panel y las celdas quedan editables', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el gate solo existe en móvil');
        await bootWeekly(page, PLANNER_URL);

        await page.locator('#btnMas').click();
        const fila = page.locator('#masTextosRow');
        await expect(fila).not.toHaveClass(/planner-mas__row--desktop-only/);

        await fila.click();
        await expect(page.locator('#textPanel')).toBeVisible();
        await expect(page.locator('#textToggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator(CELL_SEL)).toHaveClass(/is-cell-editable/);
        // Y sin toast de «solo escritorio».
        await expect(page.locator('#planner-toast-container .edt-toast')).toHaveCount(0);
    });

    test('M1 · el editor es un bottom-sheet a sangre, no un flotante', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
        await bootWeekly(page, PLANNER_URL);
        await openTextMode(page);
        await openCellEditor(page);

        const editor = page.locator(EDITOR);
        await expect(editor).toHaveClass(/planner-cell-editor--sheet/);
        await expect(page.locator('body')).toHaveClass(/planner-cell-editing/);
        // Con el sheet abierto la bottom bar estorba y se esconde.
        await expect(page.locator('#plannerToolbar')).toBeHidden();

        const caja = await editor.boundingBox();
        const vp = page.viewportSize();
        expect(caja.x).toBe(0);
        expect(Math.round(caja.width)).toBe(vp.width);
        expect(caja.y + caja.height).toBeLessThanOrEqual(vp.height + 1);
    });

    test('M6 · el input no dispara el zoom de iOS al enfocarlo', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el zoom automático es de iOS Safari');
        await bootWeekly(page, PLANNER_URL);
        await openTextMode(page);
        await openCellEditor(page);
        // Por debajo de 16px, iOS Safari re-escala la página al enfocar el campo.
        expect(await page.locator(INPUT).evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    });

    test('M7 · ✓ y ✕ quedan al pie del sheet y con área táctil suficiente', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
        await bootWeekly(page, PLANNER_URL);
        await openTextMode(page);
        await openCellEditor(page);

        const input = await page.locator(INPUT).boundingBox();
        for (const sel of [BTN_CONFIRM, BTN_CANCEL]) {
            const b = await page.locator(sel).boundingBox();
            // El `order` del CSS los baja al pie, debajo del texto.
            expect(b.y).toBeGreaterThan(input.y);
            expect(b.height).toBeGreaterThanOrEqual(44);
            expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
        }
    });

    test('M8 · un toque en B aplica la negrita UNA vez: el click del toque no repite el mousedown', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el toque solo existe en móvil');
        await bootWeekly(page, PLANNER_URL);
        await openTextMode(page);
        await openCellEditor(page);
        await page.locator(INPUT).pressSequentially(TEXT);
        await page.keyboard.press('Shift+Home');

        // Si el click del toque llegase con detail 0, la negrita se pondría y se quitaría en el mismo toque.
        await page.locator(BTN_BOLD).tap();
        await expect(page.locator(`${INPUT} b`)).toHaveCount(1);
        await expect(page.locator(BTN_BOLD)).toHaveClass(/is-active/);
    });

    test('M3 · con el sheet abierto el fondo no hace scroll, y al cerrar se restaura', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'Mobile Safari', 'el sheet solo existe en móvil');
        await bootWeekly(page, PLANNER_URL);
        await openTextMode(page);
        await openCellEditor(page);

        expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe('hidden');
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);
        // Se devuelve el valor que hubiera, no un '' asumido.
        expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe('hidden');
        // La clase del sheet se va; el toolbar sigue bloqueado porque el panel de Textos continúa
        // abierto, que es otra cosa (.is-blocked) y no la toca este cierre.
        await expect(page.locator('body')).not.toHaveClass(/planner-cell-editing/);
    });
});

test.describe('Planner Mini-editor — paleta de color', () => {
    test('T8 · un swatch colorea el texto de la celda y sobrevive al render', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'el flujo de escritorio; el móvil lo cubren los M*');
        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);

        await page.locator(INPUT).pressSequentially(TEXT);
        await page.keyboard.press('Shift+Home');

        // Acotar SIEMPRE a la fila de texto: la de fondo comparte clase y data-color-value
        // (planner-mini-editor.ts:715 y :735) → sin el :not(:has(...)) salta strict mode.
        const palette = page.locator(TEXT_PALETTE);
        await expect(palette.locator('.planner-cell-editor__swatch')).toHaveCount(16); // CELL_EDIT_COLORS, :10-27
        await palette.locator('.planner-cell-editor__swatch[data-color-value="#1976D2"]').click();

        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);

        // Comprobado con sonda: seleccionando TODO el texto, el color acaba en el wrapper de la celda
        // (`.pw-table__cell-text[style*=color]`), no en un <span> interno — pese a que el código distingue…
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveCSS('color', 'rgb(25, 118, 210)');
    });

    test('T10 · lo tecleado con el acento de fábrica sigue al acento: se guarda sin color y cambia con él', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'el flujo de escritorio; el móvil lo cubren los M*');
        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);
        await page.locator(INPUT).pressSequentially(TEXT);
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();

        // El acento de fábrica (#1976D2) también está en la paleta: el color del cursor llega en minúsculas y
        // comparado con él en mayúsculas se guardaba como color fijo, que ya no seguía a un cambio de acento
        const texto = page.locator(`${CELL_SEL} .pw-table__cell-text`);
        await expect(texto).toHaveCSS('color', 'rgb(25, 118, 210)');
        await page.locator('#designBtn').click();
        await expect(page.locator('#designPanel')).toBeVisible();
        await page.locator('#designAccentSwatches').getByRole('button', { name: 'Rojo', exact: true }).click();
        await page.locator('#designSave').click();
        await expect(page.locator('#designPanel')).toBeHidden();
        await expect(texto).toHaveCSS('color', 'rgb(154, 0, 7)');

        await flushStorage(page);
        const celda = (await storedCellTexts(page))?.[CELL];
        expect(celda?.text ?? '').toContain(TEXT);
        expect(celda?.color || null).toBeNull();
    });

    test('T11 · el color elegido pasa a la siguiente celda en blanco hasta Guardar', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'el flujo de escritorio; el móvil lo cubren los M*');
        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);
        const palette = page.locator(TEXT_PALETTE);
        const morado = palette.locator('.planner-cell-editor__swatch[data-color-value="#6A1B9A"]');
        await morado.click();
        await page.locator(INPUT).pressSequentially('Uno');
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);

        // Antes había que volver a elegirlo en cada celda
        const otra = page.locator('.pw-table__cell[data-cell="4-2"]');
        await otra.click();
        await expect(page.locator(INPUT)).toBeFocused();
        await expect(morado).toHaveClass(/is-active/);
        await page.locator(INPUT).pressSequentially('Dos');
        await page.locator(BTN_CONFIRM).click();
        await expect(otra.locator('.pw-table__cell-text')).toHaveCSS('color', 'rgb(106, 27, 154)');

        // Guardar suelta la pluma: la sesión siguiente empieza con el acento
        await page.locator('#textSave').click();
        await expect(page.locator('#textPanel')).toBeHidden();
        await openTextMode(page);
        await page.locator('.pw-table__cell[data-cell="4-3"]').click();
        await expect(page.locator(INPUT)).toBeFocused();
        await expect(palette.locator('.planner-cell-editor__swatch--accent')).toHaveClass(/is-active/);
    });

    test('T12 · el fondo elegido también pasa a las celdas en blanco de la sesión', async ({ page }, testInfo) => {
        skipMobile(testInfo, 'el flujo de escritorio; el móvil lo cubren los M*');
        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);
        await page.locator('.planner-cell-editor__fmt-btn--bg-color').click();
        await page.locator(`${BG_PALETTE} .planner-cell-editor__swatch[data-color-value="#D4A843"]`).click();
        // En el modo fondo, ✓ confirma el fondo y deja el editor abierto
        await page.locator(BTN_CONFIRM).click();
        await page.locator(INPUT).pressSequentially('Uno');
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);

        await page.locator('.pw-table__cell[data-cell="4-2"]').click();
        await expect(page.locator(INPUT)).toBeFocused();
        await expect(page.locator('.planner-cell-editor__fmt-btn--bg-color')).toHaveClass(/is-active/);
        await page.locator(INPUT).pressSequentially('Dos');
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);

        await flushStorage(page);
        expect((await storedCellTexts(page))?.['4-2']?.bgColor).toBe('#D4A843');
    });

    test('T13 · el último hueco de cada paleta es un color libre, para el texto y para el fondo', async ({
        page,
    }, testInfo) => {
        skipMobile(testInfo, 'el flujo de escritorio; el móvil lo cubren los M*');
        await bootWeekly(page);
        await openTextMode(page);
        await openCellEditor(page);
        const libre = page.locator(`${TEXT_PALETTE} .planner-cell-editor__swatch--custom`);
        await expect(libre).toHaveAttribute('type', 'color');
        await libre.fill('#123456');
        await expect(libre).toHaveClass(/is-active/);
        await page.locator(INPUT).pressSequentially('Uno');
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(`${CELL_SEL} .pw-table__cell-text`)).toHaveCSS('color', 'rgb(18, 52, 86)');

        await page.locator('.pw-table__cell[data-cell="4-2"]').click();
        await page.locator('.planner-cell-editor__fmt-btn--bg-color').click();
        await page.locator(`${BG_PALETTE} .planner-cell-editor__swatch--custom`).fill('#654321');
        await page.locator(BTN_CONFIRM).click();
        await page.locator(INPUT).pressSequentially('Dos');
        await page.locator(BTN_CONFIRM).click();
        await expect(page.locator(EDITOR)).toHaveCount(0);

        await flushStorage(page);
        const celdas = await storedCellTexts(page);
        expect(celdas?.[CELL]?.color).toBe('#123456');
        expect(celdas?.['4-2']?.bgColor).toBe('#654321');
    });
});
