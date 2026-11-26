import { APP_CONFIG } from '@core/app-config/app.config.ts';

// La marca de agua de lo exportado. Se enciende y se elige en `app.config.ts`.
export const SHOW_QR_WATERMARK: boolean = APP_CONFIG.watermark.enabled;
export const QR_SRC = `${import.meta.env.BASE_URL}${APP_CONFIG.watermark.file}`;
