// Lo que es «tuyo»: al hacer tu propia copia, cambia este archivo y nada más.
export const APP_CONFIG = {
    /**
     * Dónde está el código de ESTA versión. La licencia (AGPL-3.0) pide que quien use la app pueda
     * llegar a él: si publicas una copia con cambios, pon aquí la dirección de tu repositorio.
     */
    repoUrl: 'https://github.com/davidmcaru/app-planner-editor',

    /** A dónde lleva «Más sobre tus datos» cuando se pide permiso para traducir. */
    privacyUrl: 'https://github.com/davidmcaru/app-planner-editor#privacy',

    /**
     * Marca de agua en lo que se exporta (PDF y JPG). Apagada de serie. Para estampar tu propio QR,
     * deja la imagen en `public/` y pon `enabled: true`.
     */
    watermark: {
        enabled: false,
        file: 'watermark-qr.webp',
    },
} as const;
