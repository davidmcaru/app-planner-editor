import { translateViaMyMemory, type TranslateOptions } from './mymemory.ts';

export type TraducirOptions = TranslateOptions;

// Un solo traductor: MyMemory, que tiene una API pública y documentada. Para usar otro, cámbialo aquí:
// el resto de la app solo llama a `translateText`. Devuelve `null` si no tradujo, nunca el original.
export async function translateText(
    text: string,
    fromLang: string,
    toLang: string,
    opts: TraducirOptions = {}
): Promise<string | null> {
    return translateViaMyMemory(text, fromLang, toLang, { timeoutMs: opts.timeoutMs });
}
