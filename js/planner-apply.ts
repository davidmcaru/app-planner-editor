import { applyPlannerState } from './planner-persist.ts';
import { applyDesignConfig } from './planner-design-panel.ts';
import { applyTextConfig } from './planner-text-panel.ts';
import { getDesignConfig, getTextConfig } from './planner-state.ts';
import { render } from './planner-render.ts';
import type { PlannerPersistState } from './planner-types.ts';

// Re-materialización completa (undo, guardados, import): estado → CSS de diseño/texto → render.
// NO commitea: quien aplica decide — el apply del propio undo corre con `applying` y no debe grabar.
export function applyFullPlannerState(s: PlannerPersistState) {
    applyPlannerState(s);
    applyDesignConfig(getDesignConfig());
    applyTextConfig(getTextConfig(), getDesignConfig());
    render();
}
