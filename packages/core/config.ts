export type RuntimeMode = 'extension' | 'web';

export interface ModelConfig {
    id: string;
    name: string;
}

export interface ProviderConfig {
    id: string;
    name: string;
    models: ModelConfig[];
    defaultModel: string;
    supportedRuntimeModes: RuntimeMode[];
    enabled?: boolean;
}

export interface AnalyzerConfig {
    defaultProvider: string;
    defaultModel: string;
    systemPrompt: string;
}

const DEFAULT_ANALYZER_PROMPT = [
    'You are a strict evidence extractor for side-by-side model outputs.',
    'The goal is to show source content from the two answers, not quality evaluation or commentary.',
    'Return ONLY a valid JSON object with these fields: agreements, conflictsA, conflictsB, uniqueA, uniqueB.',
    'Preferred output type for each field is a string. If needed, you may use an array of strings of verbatim snippets.',
    'agreements: summarize overlapping content OR select one better-written original snippet that represents the overlap.',
    'conflictsA/conflictsB: show the conflicting original snippets from A and B separately.',
    'uniqueA/uniqueB: show snippets that exist only in A or only in B.',
    'Preserve original wording as much as possible. Avoid judgments such as "better", "worse", "more accurate".',
    'Do not include markdown fences or extra commentary outside JSON.',
    'User prompt: {prompt}',
    'Model A output: {outputA}',
    'Model B output: {outputB}'
].join('\n\n');

export const APP_CONFIG: { providers: ProviderConfig[]; analyzer: AnalyzerConfig } = {
    providers: [
        {
            id: 'chatgpt-web',
            name: 'ChatGPT (Web)',
            models: [
                { id: 'auto', name: 'Auto (默认)' },
                { id: 'gpt-4o', name: 'GPT-4o' }
            ],
            defaultModel: 'auto',
            supportedRuntimeModes: ['extension']
        },
        {
            id: 'gemini-api',
            name: 'Gemini (API)',
            models: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
            ],
            defaultModel: 'gemini-2.5-flash',
            supportedRuntimeModes: ['extension', 'web']
        }
    ],
    analyzer: {
        defaultProvider: 'gemini-api',
        defaultModel: 'gemini-2.5-flash',
        systemPrompt: DEFAULT_ANALYZER_PROMPT
    }
};
