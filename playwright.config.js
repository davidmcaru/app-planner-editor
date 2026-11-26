// @ts-check
import { defineConfig, devices } from '@playwright/test';

// El proyecto de móvil es un iPhone 13 sobre WebKit. Sin WebKit instalado, PW_MOBILE_CHROMIUM=1 lo
// pasa con el mismo tamaño de pantalla sobre Chromium: vale para trabajar, no para dar por bueno Safari.
const movil = process.env.PW_MOBILE_CHROMIUM
    ? { ...devices['iPhone 13'], browserName: /** @type {const} */ ('chromium'), defaultBrowserType: undefined }
    : { ...devices['iPhone 13'] };

// Otro puerto si el 5173 está ocupado: PW_PORT=5180 npm test
const PUERTO = process.env.PW_PORT || '5173';
const ORIGEN = `http://localhost:${PUERTO}`;

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,

    // Un reintento en local: un fallo por contención sale como «flaky», no como «failed»
    retries: process.env.CI ? 2 : 1,
    workers: process.env.CI ? 1 : 4,

    reporter: process.env.CI ? 'line' : 'html',

    use: {
        baseURL: ORIGEN,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'Desktop Chrome',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1440, height: 900 },
            },
        },
        {
            // ⚠️ El nombre no se cambia: los tests lo miran para saber si corren en móvil
            name: 'Mobile Safari',
            use: movil,
        },
    ],

    // Arranca Vite antes de los tests. Con PW_PREVIEW=1 sirve la build (`npm run build` antes): contra ella solo
    // vale tests/app-shell.spec.js, porque los del planner importan módulos del código desde la página
    webServer: {
        command: `npm run ${process.env.PW_PREVIEW ? 'preview' : 'dev'} -- --port ${PUERTO} --strictPort`,
        url: ORIGEN,
        reuseExistingServer: !process.env.CI && !process.env.PW_PREVIEW,
        timeout: 30000,
    },
});
