export const FONT_BASE = `${import.meta.env.BASE_URL}fonts/`;

export type FontFace = { weight: number; style?: string; file: string };

// Familia CSS → caras que EXISTEN en `public/fonts/`.
// ⚠️ Declarar una cara cuyo archivo no está ROMPE la negrita: el navegador se queda con la cara rota en
// vez de sintetizarla. Las mismas caras tienen que estar en `css/planner-fonts.css`: si una está en
// pantalla y no aquí, lo exportado sale con otra letra.
export const FONT_FACES: Record<string, FontFace[]> = {
    'Noto Serif': [
        { weight: 400, file: 'NotoSerif-Regular.woff2' },
        { weight: 700, file: 'NotoSerif-Bold.woff2' },
    ],
    Merriweather: [
        { weight: 400, file: 'Merriweather-Regular.woff2' },
        { weight: 700, file: 'Merriweather-Bold.woff2' },
    ],
    // Fuente variable: el mismo archivo sirve las dos caras.
    'Playfair Display': [
        { weight: 400, file: 'PlayfairDisplay-Variable.woff2' },
        { weight: 700, file: 'PlayfairDisplay-Variable.woff2' },
    ],
    Roboto: [
        { weight: 400, file: 'Roboto-Regular.woff2' },
        { weight: 700, file: 'Roboto-Bold.woff2' },
    ],
    Lato: [
        { weight: 400, file: 'Lato-Regular.woff2' },
        { weight: 700, file: 'Lato-Bold.woff2' },
    ],
    'Open Sans': [
        { weight: 400, file: 'OpenSans-Regular.woff2' },
        { weight: 700, file: 'OpenSans-Bold.woff2' },
    ],
    // Fuente variable: el mismo archivo sirve las dos caras.
    'Dancing Script': [
        { weight: 400, file: 'DancingScript-Variable.woff2' },
        { weight: 700, file: 'DancingScript-Variable.woff2' },
    ],
    Caveat: [
        { weight: 400, file: 'Caveat-Regular.woff2' },
        { weight: 700, file: 'Caveat-Bold.woff2' },
    ],
    // Sin cara 700: su negrita la sintetiza el navegador.
    'Indie Flower': [{ weight: 400, file: 'IndieFlower-Regular.woff2' }],
    Pacifico: [{ weight: 400, file: 'Pacifico-Regular.woff2' }],
    'Courier Prime': [
        { weight: 400, file: 'CourierPrime-Regular.woff2' },
        { weight: 700, file: 'CourierPrime-Bold.woff2' },
    ],
};

export function facesFor(family: string): FontFace[] {
    return FONT_FACES[family] || [];
}

export function fontUrl(file: string): string {
    return FONT_BASE + file;
}

// Primer family-name de una declaración CSS ("'Caveat', cursive" → "Caveat"), o null si esa
// familia no está en el registro (una genérica como serif no tiene archivo que embeber).
export function familyFromCss(value: string | null | undefined): string | null {
    if (!value) return null;
    const m = String(value).match(/^\s*['"]?([^'",]+)['"]?/);
    if (!m) return null;
    const name = (m[1] || '').trim();
    return name in FONT_FACES ? name : null;
}
