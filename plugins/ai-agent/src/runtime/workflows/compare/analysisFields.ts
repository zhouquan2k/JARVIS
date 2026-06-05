import type { AnalysisResult } from '../../interfaces/AnalysisResult';

export const ANALYSIS_RESULT_FIELDS: Array<keyof AnalysisResult> = [
    'agreements',
    'conflictsA',
    'conflictsB',
    'uniqueA',
    'uniqueB'
];
