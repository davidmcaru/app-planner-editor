import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    // Para publicar en una subcarpeta (GitHub Pages sirve en /nombre-del-repo/):
    // VITE_BASE=/nombre-del-repo/ npm run build
    base: process.env.VITE_BASE || '/',

    // Espejo de "paths" en tsconfig.json: mantener los dos a la par.
    resolve: {
        alias: {
            '@core': resolve(__dirname, 'components/core'),
            '@features': resolve(__dirname, 'components/features'),
            '@layout': resolve(__dirname, 'components/layout'),
            '@widgets': resolve(__dirname, 'components/widgets'),
        },
    },

    build: {
        // Las licencias de lo de terceros que va dentro (html-to-image, jsPDF, Font Awesome), en un archivo junto al
        // build: las piden en cada copia que se publica, y al minificar se pierden los avisos que traen en su código
        license: { fileName: 'THIRD-PARTY-LICENSES.md' },
        // jsPDF, en su propio archivo: pesa tanto como el resto de la app junta, y así ninguno pasa de 500 kB
        rollupOptions: { output: { manualChunks: { jspdf: ['jspdf'] } } },
    },

    server: {
        port: 5173,
    },
});
