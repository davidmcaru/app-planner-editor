let installed = false;

export function enhanceCollapsibleSections(): void {
    if (installed) return;
    installed = true;
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        // El reinicio (u otros controles de la cabecera) no debe plegar.
        if (target.closest('.edt-section__reset')) return;
        const header = target.closest('[data-acc-toggle]');
        if (!header) return;
        header.closest('.edt-section')?.classList.toggle('is-collapsed');
    });
}
