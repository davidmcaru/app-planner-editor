// @ts-check
import { test, expect } from '@playwright/test';

// Lo que rodea al planner en este repositorio: la cabecera con el enlace al código, el permiso de traducción
// y el tema, y la promesa de que la app no llama a nadie más que a su propio origen.

const PERMISO = 'planner-translation-consent';

async function abrir(/** @type {import('@playwright/test').Page} */ page) {
    await page.goto('/');
    await expect(page.locator('#page1')).toBeVisible();
    await expect(page.locator('#plannerToolbar')).toBeVisible();
}

test.describe('App — cabecera y pie', () => {
    test('la cabecera y el pie enlazan al código, en una pestaña nueva', async ({ page }) => {
        await abrir(page);
        const enlaces = page.locator('[data-repo-link]');
        await expect(enlaces).toHaveCount(2);
        for (const enlace of await enlaces.all()) {
            await expect(enlace).toHaveAttribute('href', /^https:\/\/github\.com\/[^/]+\/[^/]+$/);
            await expect(enlace).toHaveAttribute('target', '_blank');
            await expect(enlace).toHaveAttribute('rel', /noopener/);
        }
    });

    test('no lleva marca de agua', async ({ page }) => {
        await abrir(page);
        await expect(page.locator('.planner-qr-watermark')).toHaveCount(0);
    });

    test('el botón del tema cambia entre claro y oscuro y lo recuerda al recargar', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await abrir(page);
        const html = page.locator('html');
        await expect(html).not.toHaveClass(/dark-mode/);
        await page.locator('#theme-toggle').click();
        await expect(html).toHaveClass(/dark-mode/);
        await page.reload();
        await expect(page.locator('#page1')).toBeVisible();
        await expect(html).toHaveClass(/dark-mode/);
    });
});

test.describe('App — el permiso de traducción en el engranaje', () => {
    test('el menú abre con «Preguntar antes» y se cierra con Escape y al pulsar fuera', async ({ page }) => {
        await abrir(page);
        const boton = page.locator('#settingsToggle');
        const menu = page.locator('#settingsMenu');
        await expect(menu).toBeHidden();
        await expect(boton).toHaveAttribute('aria-expanded', 'false');

        await boton.click();
        await expect(menu).toBeVisible();
        await expect(boton).toHaveAttribute('aria-expanded', 'true');
        await expect(menu.locator('input[value="ask"]')).toBeChecked();

        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(boton).toBeFocused();

        await boton.click();
        await expect(menu).toBeVisible();
        await page.locator('#page1').click({ position: { x: 5, y: 5 }, force: true });
        await expect(menu).toBeHidden();
    });

    test('con el teclado, el foco entra en la opción marcada y al salir con Tab el menú se cierra', async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name === 'Mobile Safari', 'teclado físico: solo escritorio');
        await abrir(page);
        const boton = page.locator('#settingsToggle');
        const menu = page.locator('#settingsMenu');
        await boton.focus();
        await page.keyboard.press('Enter');
        await expect(menu).toBeVisible();
        await expect(menu.locator('input[value="ask"]')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(menu).toBeHidden();
        await expect(boton).toHaveAttribute('aria-expanded', 'false');
    });

    test('lo elegido se guarda, sobrevive a la recarga y avisa a la app', async ({ page }) => {
        await abrir(page);
        await page.evaluate(() => {
            /** @type {any} */ (window).__cambios = [];
            window.addEventListener('ajustes:cambio', (ev) =>
                /** @type {any} */ (window).__cambios.push(/** @type {CustomEvent} */ (ev).detail)
            );
        });
        await page.locator('#settingsToggle').click();
        await page.locator('#settingsMenu input[value="denied"]').check();
        await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), PERMISO)).toBe('denied');
        expect(await page.evaluate(() => /** @type {any} */ (window).__cambios)).toEqual([
            { clave: PERMISO, valor: 'denied' },
        ]);

        await page.reload();
        await expect(page.locator('#page1')).toBeVisible();
        await page.locator('#settingsToggle').click();
        await expect(page.locator('#settingsMenu input[value="denied"]')).toBeChecked();
    });

    test('el menú sale en el idioma de la interfaz', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('planner-lang', 'en');
            localStorage.setItem('planner-lang-site', 'es');
        });
        await abrir(page);
        await page.locator('#settingsToggle').click();
        const menu = page.locator('#settingsMenu');
        await expect(menu.locator('#settingsMenuTitle')).toHaveText('Automatic translation');
        await expect(menu).toContainText('Ask first');
        await expect(page.locator('.app-footer')).toContainText('AGPL-3.0');
    });
});

test.describe('App — no llama a nadie más', () => {
    test('al abrir solo pide a su propio origen', async ({ page, baseURL }) => {
        /** @type {string[]} */
        const fuera = [];
        const propio = new URL(baseURL || 'http://localhost:5173').origin;
        page.on('request', (request) => {
            const url = request.url();
            if (url.startsWith('data:') || url.startsWith('blob:')) return;
            const origen = new URL(url).origin;
            if (origen !== propio) fuera.push(url);
        });
        await abrir(page);
        await page.evaluate(() => document.fonts.ready);
        expect(fuera).toEqual([]);
    });
});
