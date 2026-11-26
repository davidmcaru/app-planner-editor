// Algunas piezas preguntan por el modo de la app; este editor tiene uno solo.
export type AppMode = 'full';

export function detectAppMode(_appName: string): AppMode {
    return 'full';
}
