import { APP_CONFIG, type ProviderModelCatalog } from '../../config';
import type { MessageAttachment } from '../interfaces/IStorageProvider';
import { IModelProvider, type ProviderSendResult, type ProviderStreamUpdate, type SendMessageOptions } from '../interfaces/IModelProvider';

type GeminiModelListItem = {
    name?: string;
    baseModelId?: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
};

type GeminiModelListResponse = {
    models?: GeminiModelListItem[];
    nextPageToken?: string;
};

function getGeminiModelCatalog(): ProviderModelCatalog {
    const provider = APP_CONFIG.providers.find((item) => item.id === 'gemini-api');
    if (!provider) {
        throw new Error("Static config for 'gemini-api' is missing");
    }

    return {
        models: provider.models.map((model) => ({ ...model })),
        defaultModel: provider.defaultModel
    };
}

function normalizeGeminiFallbackDefault(models: ProviderModelCatalog['models'], fallbackDefaultModel: string): string {
    if (models.some((model) => model.id === fallbackDefaultModel)) {
        return fallbackDefaultModel;
    }

    const preferredModel = models.find((model) => model.id === 'gemini-2.5-flash');
    return preferredModel?.id || models[0]?.id || fallbackDefaultModel;
}

function isGeminiChatModel(model: GeminiModelListItem): boolean {
    const baseModelId = model.baseModelId || model.name?.replace(/^models\//, '');
    if (!baseModelId?.startsWith('gemini-')) {
        return false;
    }

    const supportedMethods = model.supportedGenerationMethods || [];
    const supportsGenerateContent =
        supportedMethods.includes('generateContent') ||
        supportedMethods.includes('streamGenerateContent');

    if (!supportsGenerateContent) {
        return false;
    }

    const excludedTokens = ['embedding', 'aqa', 'image', 'tts', 'live', 'veo'];
    return !excludedTokens.some((token) => baseModelId.includes(token));
}

function stripDataUriPrefix(data: string | undefined): string | undefined {
    if (!data) {
        return undefined;
    }

    return data.replace(/^data:[^;]+;base64,/, '');
}

function buildGeminiPartFromAttachment(attachment: MessageAttachment) {
    return {
        inlineData: {
            mimeType: attachment.mimeType,
            data: stripDataUriPrefix(attachment.base64Data) || ''
        }
    };
}

function buildGeminiParts(prompt: string, attachments: MessageAttachment[]) {
    const parts: Array<{ text: string } | ReturnType<typeof buildGeminiPartFromAttachment>> = [];
    if (prompt) {
        parts.push({ text: prompt });
    }

    attachments
        .filter((attachment) => !!stripDataUriPrefix(attachment.base64Data))
        .forEach((attachment) => {
            parts.push(buildGeminiPartFromAttachment(attachment));
        });

    return parts.length > 0 ? parts : [{ text: '' }];
}

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

    async getAvailableModels(): Promise<ProviderModelCatalog> {
        const fallbackCatalog = getGeminiModelCatalog();
        const apiKey = this.resolveApiKey();

        if (!apiKey) {
            return fallbackCatalog;
        }

        try {
            const models = new Map<string, ProviderModelCatalog['models'][number]>();
            let pageToken: string | undefined;

            do {
                const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
                url.searchParams.set('key', apiKey);
                url.searchParams.set('pageSize', '1000');
                if (pageToken) {
                    url.searchParams.set('pageToken', pageToken);
                }

                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Gemini models.list failed: ${response.status} ${response.statusText}`);
                }

                const payload = await response.json() as GeminiModelListResponse;
                for (const model of payload.models || []) {
                    if (!isGeminiChatModel(model)) {
                        continue;
                    }

                    const id = model.baseModelId || model.name?.replace(/^models\//, '');
                    if (!id || models.has(id)) {
                        continue;
                    }

                    models.set(id, {
                        id,
                        name: model.displayName || id
                    });
                }

                pageToken = payload.nextPageToken || undefined;
            } while (pageToken);

            const resolvedModels = Array.from(models.values());
            if (resolvedModels.length === 0) {
                return fallbackCatalog;
            }

            return {
                models: resolvedModels,
                defaultModel: normalizeGeminiFallbackDefault(resolvedModels, fallbackCatalog.defaultModel)
            };
        } catch {
            return fallbackCatalog;
        }
    }

    async checkAuth(): Promise<boolean> {
        return !!this.resolveApiKey();
    }

    async sendMessage(
        prompt: string,
        options: SendMessageOptions = {},
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        const apiKey = this.resolveApiKey();
        if (!apiKey) {
            throw new Error('No Gemini API Key found in environment variables');
        }

        const modelId = options.modelId || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;

        this.abortController = new AbortController();

        const payload = {
            contents: [{ parts: buildGeminiParts(prompt, options.attachments || []) }]
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
                            onUpdate({ text: fullText });
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
