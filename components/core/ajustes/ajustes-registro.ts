import type { CampoAjuste, SeccionAjustes } from './ajustes-contrato.ts';
import { AJUSTES_GENERAL } from './ajustes-general.ts';
import { AJUSTES_PLANNER } from './ajustes-planner.ts';

export const SECCIONES: readonly SeccionAjustes[] = [AJUSTES_GENERAL, AJUSTES_PLANNER];

// localStorage es texto arbitrario: lo que no sea una opción del campo vuelve a su valor de fábrica
export const normalizar = <T extends string>(campo: CampoAjuste<T>, crudo: string | null): T =>
    campo.opciones.find((o) => o.valor === crudo)?.valor ?? campo.defecto;
