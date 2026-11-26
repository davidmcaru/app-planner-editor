import { createToaster, type ToastType } from '@widgets/toast/toast.ts';

const _toaster = createToaster({ containerId: 'planner-toast-container' });

export function showToast(message: string, type: ToastType = 'info', duration?: number): void {
    if (!message) return;
    _toaster.show(message, type, duration);
}
