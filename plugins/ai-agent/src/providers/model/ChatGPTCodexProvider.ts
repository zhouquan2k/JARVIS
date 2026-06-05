import { APP_CONFIG, type ModelConfig, type ProviderModelCatalog } from '@packages/core/config';
import type {
    AgentCapabilities,
    AgentRunRequest,
    AgentToolCall,
    IAgentCapableProvider
} from '../../interfaces/IAgentCapableProvider';
import type {
    ProviderDocumentCapability,
    ProviderSendResult,
    ProviderStreamUpdate,
    SendMessageOptions
} from '../../interfaces/IModelProvider';
import { HttpApiClient } from '@plugins/ai-agent/src/internal';
import type { ChatGPTCodexProviderOptions, ProviderRequestClient } from './providerHostTypes';

type CodexAuthStatusResponse = {
    authenticated?: boolean;
};

type CodexLoginResponse = {
    verificationUri?: string;
    userCode?: string;
    message?: string;
};

type CodexStreamEvent =
    | {
        type: 'message.delta';
        delta: string;
    }
    | {
        type: 'message.completed';
        text: string;
        conversationId?: string;
        messageId?: string;
        toolCalls?: AgentToolCall[];
        modelTurn?: {
            role: 'model';
            parts: Array<{ text?: string; functionCall?: { id?: string; name: string; args: Record<string, unknown> | string } }>;
        };
        functionalParts?: ProviderSendResult['functionalParts'];
    }
    | {
        type: 'error';
        error: string;
    };

function createDefaultRequestClient(): ProviderRequestClient {
    return {
        fetch(input: string, init?: RequestInit) {
            return fetch(input, init);
        }
    };
}

function cloneModelConfig(model: ModelConfig): ModelConfig {
    return {
        ...model,
        options: model.options?.map((option) => ({
            ...option,
            conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
        }))
    };
}

function getStaticCodexCatalog(): ProviderModelCatalog {
    const provider = APP_CONFIG.providers.find((item) => item.id === 'chatgpt-codex');
    if (!provider) {
        throw new Error("Static config for 'chatgpt-codex' is missing");
    }

    return {
        models: provider.models.map(cloneModelConfig),
        defaultModel: provider.defaultModel
    };
}

function normalizeConversationTitle(raw: string, maxLength = 30): string {
    const normalized = raw
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
        .replace(/[。．.!?！？]+$/u, '');

    if (!normalized) {
        return 'New Chat';
    }

    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}

function buildConversationTitlePrompt(prompt: string, maxLength = 10): string {
    return [
        `请根据用户提出的第一个问题，生成一个尽可能短的中文会话标题，不超过${maxLength}个汉字。`,
        '仅返回标题文本。',
        '不要加引号。',
        '不要附加解释。',
        '不要输出完整句子。',
        '',
        `User question: ${prompt.trim()}`
    ].join('\n');
}

async function readSseEvents(
    response: Response,
    onEvent: (event: CodexStreamEvent) => void
): Promise<void> {
    if (!response.body) {
        throw new Error('Codex stream response body is unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');

            const dataLines = block
                .split('\n')
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trim())
                .filter(Boolean);
            if (dataLines.length === 0) {
                continue;
            }

            const data = dataLines.join('\n');
            if (data === '[DONE]') {
                continue;
            }

            onEvent(JSON.parse(data) as CodexStreamEvent);
        }
    }
}

export class ChatGPTCodexProvider implements IAgentCapableProvider {
    public readonly id = 'chatgpt-codex';

    private readonly baseUrl: string;
    private readonly requestClient: ProviderRequestClient;
    private readonly client: HttpApiClient;
    private readonly lightweightModel: {
        modelId: string;
        reasoningEffort: 'low' | 'medium' | 'high';
        modelOptions: Record<string, boolean>;
    } = {
        modelId: '',
        reasoningEffort: 'low',
        modelOptions: {}
    };
    private abortController: AbortController | null = null;

    constructor(options: ChatGPTCodexProviderOptions = {}) {
        this.baseUrl = (options.baseUrl?.trim() || '').replace(/\/+$/, '');
        this.requestClient = options.requestClient ?? createDefaultRequestClient();
        this.client = new HttpApiClient({
            baseUrl: this.baseUrl,
            fetchImpl: (input, init) => {
                if (typeof input === 'string') {
                    return this.requestClient.fetch(input, init);
                }

                if (input instanceof URL) {
                    return this.requestClient.fetch(input.toString(), init);
                }

                return this.requestClient.fetch(input.url, init);
            },
            source: 'unknown'
        });
        if (options.lightweightModel?.providerId === 'chatgpt-codex') {
            this.lightweightModel.modelId = options.lightweightModel.modelId;
            this.lightweightModel.reasoningEffort = options.lightweightModel.reasoningEffort ?? 'low';
            this.lightweightModel.modelOptions = { ...(options.lightweightModel.modelOptions ?? {}) };
        }
    }

    async checkAuth(): Promise<boolean> {
        const result = await this.client.getJson<CodexAuthStatusResponse>('/auth/status');
        return result.authenticated === true;
    }

    async getAvailableModels(): Promise<ProviderModelCatalog> {
        try {
            return await this.client.getJson<ProviderModelCatalog>('/models');
        } catch {
            return getStaticCodexCatalog();
        }
    }

    async getDocumentCapability(): Promise<ProviderDocumentCapability> {
        return {
            acceptedMimeTypes: ['text/plain', 'text/markdown', 'application/pdf']
        };
    }

    async generateConversationTitle(
        prompt: string,
        maxLength = 10
    ): Promise<string> {
        const result = await this.executeStream(
            `${this.baseUrl}/chat`,
            {
                prompt: buildConversationTitlePrompt(prompt, maxLength),
                options: {
                    modelId: this.lightweightModel.modelId || undefined,
                    reasoningEffort: this.lightweightModel.reasoningEffort,
                    modelOptions: this.lightweightModel.modelOptions
                }
            },
            () => undefined
        );

        return normalizeConversationTitle(result.text, maxLength);
    }

    private async executeStream(
        path: string,
        body: unknown,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        this.abortController = new AbortController();

        const response = await this.requestClient.fetch(path, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'text/event-stream'
            },
            body: JSON.stringify(body),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const message = await response.text();
            this.abortController = null;
            throw new Error(message || `Codex request failed with status ${response.status}`);
        }

        let streamedText = '';
        let finalResult: ProviderSendResult | null = null;
        await readSseEvents(response, (event) => {
            if (event.type === 'message.delta') {
                streamedText += event.delta;
                onUpdate({ text: streamedText });
                return;
            }

            if (event.type === 'message.completed') {
                finalResult = {
                    text: event.text ?? streamedText,
                    conversationId: event.conversationId || crypto.randomUUID(),
                    messageId: event.messageId || crypto.randomUUID(),
                    toolCalls: event.toolCalls,
                    modelTurn: event.modelTurn,
                    functionalParts: event.functionalParts
                };
                return;
            }

            if (event.type === 'error') {
                throw new Error(event.error);
            }
        });

        if (!finalResult) {
            finalResult = {
                text: streamedText,
                conversationId: crypto.randomUUID(),
                messageId: crypto.randomUUID()
            };
        }

        this.abortController = null;
        return finalResult;
    }

    async sendMessage(
        prompt: string,
        options: SendMessageOptions = {},
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        return this.executeStream(
            `${this.baseUrl}/chat`,
            { prompt, options },
            onUpdate
        );
    }

    getAgentCapabilities(): AgentCapabilities {
        return {
            nativeAgent: true,
            toolLoop: 'application-managed'
        };
    }

    async runAgent(
        request: AgentRunRequest,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        return this.executeStream(
            `${this.baseUrl}/agent`,
            request,
            onUpdate
        );
    }

    async startLogin(): Promise<CodexLoginResponse> {
        return this.client.postJson<CodexLoginResponse>('/auth/login', {});
    }

    abort(): void {
        if (!this.abortController) {
            return;
        }

        this.abortController.abort();
        this.abortController = null;
    }
}
