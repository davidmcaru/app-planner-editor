import { createHistory } from '@core/history/history.ts';
import { getPersistablePlannerState, registerHistoryHooks } from './planner-persist.ts';
import { applyFullPlannerState } from './planner-apply.ts';
import type { PlannerPersistState } from './planner-types.ts';

function _updateButtons() {
    const canUndo = PlannerHistory.canUndo();
    const canRedo = PlannerHistory.canRedo();
    for (const [id, enabled] of [
        ['btnUndo', canUndo],
        ['btnRedo', canRedo],
    ] as const) {
        const btn = document.getElementById(id) as HTMLButtonElement | null;
        if (btn) btn.disabled = !enabled;
    }
}

const _listeners: Array<() => void> = [];

export function onHistoryChange(cb: () => void): void {
    _listeners.push(cb);
}

function _changed() {
    _updateButtons();
    for (const cb of _listeners) cb();
}

export const PlannerHistory = createHistory<PlannerPersistState>({
    snapshot: () => JSON.stringify(getPersistablePlannerState()),
    apply: applyFullPlannerState,
    onChange: _changed,
    cap: 30,
});

registerHistoryHooks(PlannerHistory);
