import { detectAppMode } from '@core/app-mode/app-mode.ts';

export const IS_FULL = detectAppMode('planner') === 'full';
