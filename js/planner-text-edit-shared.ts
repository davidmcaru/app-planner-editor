export const SECTION_SELECTOR = '[data-section]';

export function createSharedState<D>(deps: D) {
    let _activeEditStyle: string | null = null;

    return {
        deps,
        getActiveEditStyle: () => _activeEditStyle,
        setActiveEditStyle: (v: string | null) => {
            _activeEditStyle = v;
        },
    };
}

import type { PlannerContext } from './planner-context.ts';
export type TextEditDeps = PlannerContext & { saveConfig: () => void };
export type SharedState = ReturnType<typeof createSharedState<TextEditDeps>>;
