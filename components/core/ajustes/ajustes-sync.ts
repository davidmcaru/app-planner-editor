import { cancelPendingWrite, flushPendingWrites, hasPendingWrite } from '../storage/debounced-storage.ts';
import { readPreference, setPreference } from '../theme/theme-core.ts';
import type { CampoAjuste } from './ajustes-contrato.ts';
import { AJUSTE_TEMA } from './ajustes-general.ts';
import { normalizar } from './ajustes-registro.ts';

type CambioAjuste = WindowEventMap['ajustes:cambio']['detail'];

// Lo elegido que el navegador no dejó guardar: sin esto, el panel volvería al de fábrica mientras la app aplica el nuevo
const enMemoria = new Map<string, string>();

export function leerAjuste<T extends string>(campo: CampoAjuste<T>): T {
    if (campo.clave === AJUSTE_TEMA.clave) return normalizar(campo, readPreference());
    const fijado = enMemoria.get(campo.clave);
    if (fijado !== undefined) return normalizar(campo, fijado);
    if (hasPendingWrite(campo.clave)) flushPendingWrites();
    try {
        return normalizar(campo, leerMudando(campo));
    } catch {
        return campo.defecto;
    }
}

// Copiada, la vieja se borra (sin la nueva volvería un valor de hace meses); si no cabe, se sigue leyendo ella
function leerMudando<T extends string>(campo: CampoAjuste<T>): string | null {
    const actual = localStorage.getItem(campo.clave);
    if (!campo.claveVieja) return actual;
    const vieja = localStorage.getItem(campo.claveVieja);
    if (vieja === null) return actual;
    try {
        if (actual === null) localStorage.setItem(campo.clave, vieja);
        localStorage.removeItem(campo.claveVieja);
    } catch {
        return vieja;
    }
    return actual ?? vieja;
}

export function escribirAjuste<T extends string>(campo: CampoAjuste<T>, crudo: string): void {
    const valor = normalizar(campo, crudo);
    if (campo.clave === AJUSTE_TEMA.clave) setPreference(normalizar(AJUSTE_TEMA, valor));
    else {
        // La escritura que la app tuviera pendiente, al vencer, pisaría esta
        cancelPendingWrite(campo.clave);
        try {
            localStorage.setItem(campo.clave, valor);
            enMemoria.delete(campo.clave);
        } catch {
            enMemoria.set(campo.clave, valor);
        }
    }
    window.dispatchEvent(new CustomEvent<CambioAjuste>('ajustes:cambio', { detail: { clave: campo.clave, valor } }));
}

// Tres vías: esta página, otra pestaña (clave null = vació el almacenamiento) y la vuelta con Atrás desde la bfcache
export function observarAjuste<T extends string>(campo: CampoAjuste<T>, fn: (valor: T) => void): () => void {
    const aqui = (ev: CustomEvent<CambioAjuste>): void => {
        if (ev.detail.clave === campo.clave) fn(normalizar(campo, ev.detail.valor));
    };
    const fuera = (ev: StorageEvent): void => {
        if (ev.key !== campo.clave && ev.key !== null) return;
        // El eco que esta página tenga pendiente es más viejo que lo que acaba de escribir la otra pestaña
        cancelPendingWrite(campo.clave);
        fn(leerAjuste(campo));
    };
    const vuelta = (ev: PageTransitionEvent): void => {
        if (ev.persisted) fn(leerAjuste(campo));
    };
    window.addEventListener('ajustes:cambio', aqui);
    window.addEventListener('storage', fuera);
    window.addEventListener('pageshow', vuelta);
    return () => {
        window.removeEventListener('ajustes:cambio', aqui);
        window.removeEventListener('storage', fuera);
        window.removeEventListener('pageshow', vuelta);
    };
}
