export function isFlipActive(btn: HTMLElement): boolean {
    return btn.classList.contains('is-active');
}

export function setFlipToggle(btn: HTMLElement, active: boolean): void {
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    const off = btn.dataset.flipOff;
    const on = btn.dataset.flipOn;
    if (off != null && on != null) {
        const label = btn.querySelector<HTMLElement>('.edt-flip__label') ?? btn;
        label.textContent = active ? on : off;
    }
}
