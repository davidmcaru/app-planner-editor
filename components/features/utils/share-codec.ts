// Datos decodificados sin forma fija: any acotado a este códec
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

export function bytesToB64url(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

export async function deflate(str: string): Promise<Uint8Array> {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(str));
    writer.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
export async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}

// ⚠️ djb2 en base36: integridad, NO criptografía. Y no es hex, así que no lo parsees como tal
export function checksum(str: string): string {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

export const isObj = (x: unknown): x is Loose => !!x && typeof x === 'object' && !Array.isArray(x);
export const jsonEq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export const oneOf = <T>(v: unknown, arr: readonly T[], def: T): T => (arr.includes(v as T) ? (v as T) : def);

/** Centinela de poda: prune() lo devuelve cuando un subárbol es idéntico al default. */
export const DROP: Loose = { __drop: true };

// `special` deja a cada app interceptar claves concretas; si devuelve undefined, no aplica
export function prune(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cur: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    def: any,
    key: string | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    special?: (cur: any, def: any, key: string | null) => any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    if (special) {
        const s = special(cur, def, key);
        if (s !== undefined) return s;
    }
    if (Array.isArray(cur)) return Array.isArray(def) && jsonEq(cur, def) ? DROP : cur;
    if (isObj(cur)) {
        if (!isObj(def)) return cur;
        const out: Loose = {};
        Object.keys(cur).forEach((k) => {
            const p = prune(cur[k], def[k], k, special);
            if (p !== DROP) out[k] = p;
        });
        return Object.keys(out).length ? out : DROP;
    }
    return cur === def ? DROP : cur;
}

export function invertKeyMap(kmap: Record<string, string>): Record<string, string> {
    const imap: Record<string, string> = {};
    Object.keys(kmap).forEach((k) => {
        imap[kmap[k]!] = k;
    });
    return imap;
}

/** Renombrador recursivo de claves: con KMAP produce `shorten`, con su inverso `expand`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeKeyMapper(map: Record<string, string>): (x: any) => any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (x: any): any =>
        Array.isArray(x)
            ? x.map(fn)
            : isObj(x)
              ? Object.keys(x).reduce((o: Loose, k) => ((o[map[k] || k] = fn(x[k])), o), {} as Loose)
              : x;
    return fn;
}

/** Merge del delta sobre los defaults (arrays wholesale) → objeto completo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeDefaults(base: any, over: any): any {
    if (Array.isArray(over)) return over;
    if (isObj(over) && isObj(base)) {
        const o: Loose = {};
        Object.keys(base).forEach((k) => (o[k] = base[k]));
        Object.keys(over).forEach((k) => (o[k] = mergeDefaults(base[k], over[k])));
        return o;
    }
    return over === undefined ? base : over;
}

// Espera el delta YA abreviado. Cae a utf8 plano donde no haya deflate-raw
export async function buildShareCode(shortDelta: unknown, prefixDeflate: string, prefixPlain: string): Promise<string> {
    const json = JSON.stringify(shortDelta);
    let prefix: string, b64: string;
    if (typeof CompressionStream !== 'undefined') {
        b64 = bytesToB64url(await deflate(json));
        prefix = prefixDeflate;
    } else {
        b64 = bytesToB64url(new TextEncoder().encode(json));
        prefix = prefixPlain;
    }
    return prefix + '.' + b64 + '.' + checksum(b64);
}

export type ShareParseResult =
    | { ok: true; raw: unknown; prefix: string }
    | { ok: false; error: string; detail?: string };

// ⚠️ Devuelve el JSON CRUDO sin sanear: el consumidor DEBE pasarlo por su whitelist antes de usarlo
export async function parseShareCode(
    code: unknown,
    prefixes: readonly string[],
    compressedPrefixes: readonly string[]
): Promise<ShareParseResult> {
    try {
        if (typeof code !== 'string') return { ok: false, error: 'sin-codigo' };
        const parts = code.trim().split('.');
        if (parts.length !== 3) return { ok: false, error: 'formato' };
        const prefix = parts[0] || '';
        const b64 = parts[1] || '';
        const chk = parts[2] || '';
        if (prefixes.indexOf(prefix) === -1) return { ok: false, error: 'version' };
        if (checksum(b64) !== chk) return { ok: false, error: 'checksum' };
        const bytes = b64urlToBytes(b64);
        const json = compressedPrefixes.indexOf(prefix) !== -1 ? await inflate(bytes) : new TextDecoder().decode(bytes);
        return { ok: true, raw: JSON.parse(json), prefix };
    } catch (e) {
        const err = e as { message?: string } | null;
        return { ok: false, error: 'excepcion', detail: String((err && err.message) || e) };
    }
}

export function sanitizeCodeInput(raw: unknown): string {
    return String(raw || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[^A-Za-z0-9._-]/g, '')
        .slice(0, 20000);
}
