export interface AnalysisResult {
    agreements: string;
    conflictsA: string;
    conflictsB: string;
    uniqueA: string;
    uniqueB: string;
}

export const ANALYSIS_RESULT_FIELDS: Array<keyof AnalysisResult> = [
    'agreements',
    'conflictsA',
    'conflictsB',
    'uniqueA',
    'uniqueB'
];
