import { IModelProvider } from '../interfaces/IModelProvider';

export class GeminiApiProvider implements IModelProvider {
    public id = 'gemini-api';
    private abortController: AbortController | null = null;
    private apiKey?: string;

    constructor(options?: { apiKey?: string }) {
        this.apiKey = options?.apiKey;
    }

    private resolveApiKey(): string | undefined {
        if (this.apiKey) {
            return this.apiKey;
        }
        // @ts-ignore
        return import.meta.env?.WXT_GEMINI_API_KEY || import.meta.env?.VITE_GEMINI_API_KEY;
    }

    async checkAuth(): Promise<boolean> {
        return !!this.resolveApiKey();
    }

    async sendMessage(
        prompt: string,
        options: {
            context?: { parentMessageId?: string, conversationId?: string },
            modelId?: string
        } = {},
        onUpdate: (chunk: string) => void
    ): Promise<{ text: string, conversationId: string, messageId: string }> {
        const apiKey = this.resolveApiKey();
        if (!apiKey) {
            throw new Error('No Gemini API Key found in environment variables');
        }

        const modelId = options.modelId || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;

        this.abortController = new AbortController();

        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API request failed: ${response.status} ${response.statusText} - ${err}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body stream available');

        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Note: Google's SSE format for Gemini separated chunks.
            const parts = buffer.split(/\r?\n\r?\n/);
            buffer = parts.pop() || '';

            for (const part of parts) {
                if (part.trim() === '') continue;
                if (!part.startsWith('data: ')) continue;

                const dataStr = part.substring(6).trim();

                try {
                    const data = JSON.parse(dataStr);
                    const contents = data?.candidates?.[0]?.content?.parts;
                    if (contents && contents.length > 0) {
                        const chunkText = contents[0].text;
                        if (chunkText) {
                            fullText += chunkText;
                            onUpdate(fullText);
                        }
                    }
                } catch (e) {
                    // Ignore parse errors on incomplete chunks or specific markers
                    console.warn('Error parsing SSE data line', dataStr, e);
                }
            }
        }

        this.abortController = null;

        // Use provided ids or generate simple ones since Gemini API doesn't return them by default 
        const conversationId = options.context?.conversationId || crypto.randomUUID();
        const messageId = crypto.randomUUID();

        return {
            text: fullText,
            conversationId,
            messageId
        };
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
