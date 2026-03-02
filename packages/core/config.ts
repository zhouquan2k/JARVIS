export const APP_CONFIG = {
    providers: [
        {
            id: 'chatgpt-web',
            name: 'ChatGPT (Web)',
            models: [
                { id: 'auto', name: 'Auto (默认)' },
                { id: 'gpt-4o', name: 'GPT-4o' }
            ],
            defaultModel: 'auto'
        },
        {
            id: 'gemini-api',
            name: 'Gemini (API)',
            models: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
            ],
            defaultModel: 'gemini-2.5-flash'
        }
    ]
};
