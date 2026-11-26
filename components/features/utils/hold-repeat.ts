export interface HoldRepeatOptions {
    /** Pausa inicial (ms) tras el primer paso, antes de empezar a repetir. */
    delay?: number;
    start?: number;
    min?: number;
    step?: number;
}

export function attachHoldRepeat(btn: HTMLElement, stepFn: () => void, options: HoldRepeatOptions = {}): void {
    const { delay = 350, start = 90, min = 30, step = 8 } = options;
    if (!btn || typeof stepFn !== 'function' || btn.dataset.holdInit === '1') return;
    btn.dataset.holdInit = '1';

    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let repeatTimer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
        if (holdTimer) clearTimeout(holdTimer);
        if (repeatTimer) clearTimeout(repeatTimer);
        holdTimer = repeatTimer = null;
    };

    const startRepeat = () => {
        // Pausa inicial antes de empezar a repetir; luego acelera.
        holdTimer = setTimeout(() => {
            let d = start;
            const tick = () => {
                stepFn();
                d = Math.max(min, d - step);
                repeatTimer = setTimeout(tick, d);
            };
            tick();
        }, delay);
    };

    btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // solo botón principal / toque
        e.preventDefault();
        stop();
        stepFn(); // primer paso inmediato
        startRepeat();
        if (btn.setPointerCapture && e.pointerId !== undefined) {
            try {
                btn.setPointerCapture(e.pointerId);
            } catch (_err) {}
        }
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, stop));

    btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            stepFn();
        }
    });

    // Suprimir el click (sintético del puntero o del teclado): el paso ya se
    // cuenta arriba, y evitamos que corra otro listener o el dispatcher delegado.
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
    });
}
