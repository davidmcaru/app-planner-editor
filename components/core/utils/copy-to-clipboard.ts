// El fallback de <textarea> + execCommand no sobra: la Clipboard API falla sin gesto de usuario
// o fuera de contexto seguro. Devuelve si copió — los toasts los pone cada app.
export async function copyTextToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (_e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok: boolean;
        try {
            ok = document.execCommand('copy');
        } catch (_e2) {
            ok = false;
        }
        ta.remove();
        return ok;
    }
}
