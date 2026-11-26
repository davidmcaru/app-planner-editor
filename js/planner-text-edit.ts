import { createSharedState, type TextEditDeps } from './planner-text-edit-shared.ts';
import { createWeeklyMode } from './planner-text-edit-weekly.ts';
import { createPlannerMode } from './planner-text-edit-planner.ts';
import { createMonthlyMode } from './planner-text-edit-monthly.ts';
import { createQuarterlyMode } from './planner-text-edit-quarterly.ts';

export function initTextEdit(deps: TextEditDeps) {
    const shared = createSharedState(deps);

    const weekly = createWeeklyMode(shared);
    const planner = createPlannerMode(shared);
    const monthly = createMonthlyMode(shared);
    const quarterly = createQuarterlyMode(shared);

    const modes: Record<string, { exit: (action: string) => void } | undefined> = {
        weekly,
        planner,
        monthly,
        quarterly,
    };

    function exitCurrentMode(action = 'dismiss') {
        const mode = modes[shared.getActiveEditStyle() ?? ''];
        if (!mode) return false;
        mode.exit(action);
        return true;
    }

    return {
        enterWeeklyCellEditMode: weekly.enter,
        enterPlannerTextEditMode: planner.enter,
        enterMonthlyCellEditMode: monthly.enter,
        enterQuarterlyCellEditMode: quarterly.enter,
        exitCurrentMode,
    };
}
