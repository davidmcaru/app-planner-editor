import { facesFor, familyFromCss, fontUrl } from '@features/fonts/font-registry.ts';
import { TEXT_STYLES } from './planner-themes.ts';

const _preloaded = new Set<string>();

// Las @font-face del CSS ya cargan lazy: esto solo ADELANTA la fuente activa con un <link rel="preload">.
export function preloadFont(fontKey: string) {
    const style = TEXT_STYLES[fontKey];
    const family = familyFromCss(style?.heading);
    if (!family) return;
    for (const face of facesFor(family)) {
        if (_preloaded.has(face.file)) continue;
        _preloaded.add(face.file);
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'font';
        link.type = 'font/woff2';
        link.crossOrigin = 'anonymous';
        link.href = fontUrl(face.file);
        document.head.appendChild(link);
    }
}
