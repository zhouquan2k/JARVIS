import { APP_CONFIG, type ModelConfig, type ProviderModelCatalog } from '../../../config';
import type { AgentToolDeclaration } from '../../agents/tools/types';
import type {
    AgentCapabilities,
    AgentModelTurn,
    AgentRunRequest,
    AgentResponsePart,
    AgentToolCall,
    IAgentCapableProvider
} from '../../interfaces/IAgentCapableProvider';
import type { MessageAttachment, MessageFunctionalPart } from '../../interfaces/Conversation';
import {
    IModelProvider,
    type GenerateConversationTitleOptions,
    type ProviderContextMessage,
    type ReasoningEffort,
    type ProviderSendResult,
    type ProviderStreamUpdate,
    type SendMessageOptions
} from '../../interfaces/IModelProvider';

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

type GeminiRequestPart = {
    text?: string;
    thoughtSignature?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
    functionCall?: {
        id?: string;
        name: string;
        args: Record<string, unknown> | string;
    };
    functionResponse?: {
        id?: string;
        name: string;
        response: Record<string, unknown>;
    };
};

type GeminiRequestContent = {
    role: 'user' | 'model';
    parts: GeminiRequestPart[];
};

type GeminiResponsePart = {
    text?: string;
    thoughtSignature?: string;
    functionCall?: {
        name?: string;
        args?: Record<string, unknown> | string;
        id?: string;
    };
};

const GEMINI_TITLE_MAX_LENGTH = 30;

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

function cloneModelConfig(model: ModelConfig): ModelConfig {
    return {
        ...model,
        options: model.options?.map((option) => ({
            ...option,
            conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
        }))
    };
}

function getGeminiModelOptions() {
    const provider = APP_CONFIG.providers.find((item) => item.id === 'gemini-api');
    return provider?.models[0]?.options?.map((option) => ({
        ...option,
        conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
    }));
}

function attachGeminiModelOptions(model: ModelConfig): ModelConfig {
    return {
        ...cloneModelConfig(model),
        options: getGeminiModelOptions()
    };
}

function normalizeGeminiFallbackDefault(models: ProviderModelCatalog['models'], fallbackDefaultModel: string): string {
    if (models.some((model) => model.id === fallbackDefaultModel)) {
        return fallbackDefaultModel;
    }

    const preferredModel = findGeminiModelMatch(
        models,
        APP_CONFIG.providers.find((provider) => provider.id === 'gemini-api')?.preferredDefaultModel || 'Gemini Pro Latest'
    ) || models.find((model) => model.id === 'gemini-2.5-pro');
    return preferredModel?.id || models[0]?.id || fallbackDefaultModel;
}

function findGeminiModelMatch(
    models: ProviderModelCatalog['models'],
    requestedModel: string
): ProviderModelCatalog['models'][number] | undefined {
    const normalizedRequested = requestedModel.trim();
    if (!normalizedRequested) {
        return undefined;
    }

    const normalizedRequestedToken = normalizedModelToken(normalizedRequested);
    return models.find((model) => {
        return model.id === normalizedRequested
            || model.name === normalizedRequested
            || normalizedModelToken(model.id) === normalizedRequestedToken
            || normalizedModelToken(model.name) === normalizedRequestedToken;
    });
}

function normalizedModelToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildGeminiConversationTitlePrompt(prompt: string, maxLength = GEMINI_TITLE_MAX_LENGTH): string {
    return [
        `Generate a concise conversation title in at most ${maxLength} characters.`,
        'Return title text only.',
        'Do not use quotes.',
        'Do not add explanation.',
        '',
        `User question: ${prompt.trim()}`
    ].join('\n');
}

function normalizeGeneratedTitle(raw: string, maxLength = GEMINI_TITLE_MAX_LENGTH): string {
    const normalized = raw
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, '')
        .replace(/[。．.!?！？]+$/u, '');

    if (!normalized) {
        return 'New Chat';
    }

    return normalized.length <= maxLength
        ? normalized
        : `${normalized.slice(0, maxLength)}...`;
}

function isGeminiProLatestAlias(value: string | undefined): boolean {
    if (!value?.trim()) {
        return false;
    }

    const normalizedValue = normalizedModelToken(value);
    const normalizedPreferred = normalizedModelToken(
        APP_CONFIG.providers.find((provider) => provider.id === 'gemini-api')?.preferredDefaultModel || 'Gemini Pro Latest'
    );
    return normalizedValue === normalizedModelToken('gemini-pro-latest') || normalizedValue === normalizedPreferred;
}

function buildGeminiThinkingConfig(modelId: string, reasoningEffort: ReasoningEffort | undefined): Record<string, unknown> | undefined {
    const effort = reasoningEffort || 'high';
    const normalizedModelId = normalizedModelToken(modelId);

    if (normalizedModelId.includes('geminiprolatest') || normalizedModelId.startsWith('gemini3')) {
        return {
            thinkingLevel: effort === 'low' ? 'low' : 'high'
        };
    }

    if (normalizedModelId.startsWith('gemini25')) {
        return {
            thinkingBudget: effort === 'low'
                ? 1024
                : effort === 'medium'
                    ? 8192
                    : 24576
        };
    }

    return undefined;
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

function getAttachmentExtension(name: string): string {
    if (!name.includes('.')) {
        return '';
    }

    return name.split('.').pop()?.toLowerCase() || '';
}

function isGeminiTextAttachment(attachment: MessageAttachment): boolean {
    const mimeType = attachment.mimeType.toLowerCase();
    if (mimeType.startsWith('text/')) {
        return true;
    }

    if ([
        'application/json',
        'application/xml',
        'application/yaml'
    ].includes(mimeType)) {
        return true;
    }

    if (mimeType !== 'application/octet-stream') {
        return false;
    }

    return [
        'txt',
        'md',
        'markdown',
        'csv',
        'json',
        'xml',
        'html',
        'htm',
        'yml',
        'yaml'
    ].includes(getAttachmentExtension(attachment.name));
}

function resolveGeminiInlineMimeType(attachment: MessageAttachment): string {
    const mimeType = attachment.mimeType.toLowerCase();
    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
        return attachment.mimeType;
    }

    if (isGeminiTextAttachment(attachment)) {
        return 'text/plain';
    }

    return attachment.mimeType;
}

function buildGeminiPartFromAttachment(attachment: MessageAttachment) {
    return {
        inlineData: {
            mimeType: resolveGeminiInlineMimeType(attachment),
            data: stripDataUriPrefix(attachment.base64Data) || ''
        }
    } satisfies GeminiRequestPart;
}

function buildGeminiParts(prompt: string, attachments: MessageAttachment[]) {
    const parts: GeminiRequestPart[] = [];
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

function mapConversationRoleToGeminiRole(role: ProviderContextMessage['role']): 'user' | 'model' {
    return role === 'assistant' ? 'model' : 'user';
}

function buildGeminiContents(prompt: string, options: SendMessageOptions) {
    const history: GeminiRequestContent[] = (options.history || []).map((message) => ({
        role: mapConversationRoleToGeminiRole(message.role),
        parts: buildGeminiParts(message.content, message.attachments || [])
    }));

    return [
        ...history,
        {
            role: 'user' as const,
            parts: buildGeminiParts(prompt, options.attachments || [])
        }
    ];
}

function buildGeminiFunctionDeclarations(tools?: AgentToolDeclaration[]) {
    if (!tools?.length) {
        return [];
    }

    return tools.map((tool) => ({
        name: tool.id,
        description: tool.description || `${tool.id} tool`,
        parameters: tool.inputSchema
    }));
}

function buildGeminiAgentContents(request: AgentRunRequest) {
    const contents = buildGeminiContents(request.prompt, {
        history: request.history,
        attachments: request.attachments
    });

    request.toolExchanges?.forEach((exchange) => {
        contents.push({
            role: 'model' as const,
            parts: exchange.modelTurn.parts.map((part) => ({
                text: part.text,
                thoughtSignature: part.thoughtSignature,
                functionCall: part.functionCall
                    ? {
                        id: part.functionCall.id,
                        name: part.functionCall.name,
                        args: part.functionCall.args
                    }
                    : undefined
            }))
        });
        contents.push({
            role: 'user' as const,
            parts: [
                {
                    functionResponse: {
                        id: exchange.call.id,
                        name: exchange.result.name,
                        response: {
                            result: exchange.result.result,
                            isError: exchange.result.isError === true
                        }
                    }
                }
            ]
        });
    });

    return contents;
}

function buildGeminiSystemInstruction(request: AgentRunRequest): string {
    return request.agent.effectiveInstructions;
}

function buildGeminiRequestTools(input: { modelOptions?: Record<string, boolean>, tools?: AgentToolDeclaration[] }) {
    const declaredTools: Array<Record<string, unknown>> = [];

    if (input.modelOptions?.deep_research === true) {
        declaredTools.push({ googleSearch: {} });
    }

    const functionDeclarations = buildGeminiFunctionDeclarations(input.tools);
    if (functionDeclarations.length > 0) {
        declaredTools.push({ functionDeclarations });
    }

    return declaredTools;
}

function formatGeminiFunctionalPartContent(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

async function parseGeminiSse(
    response: Response,
    onUpdate: (update: ProviderStreamUpdate) => void
): Promise<Pick<ProviderSendResult, 'text' | 'toolCalls' | 'functionalParts'> & { modelTurn?: AgentModelTurn }> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body stream available');
    }

    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';
    const aggregatedToolCalls: AgentToolCall[] = [];
    const aggregatedModelParts: AgentResponsePart[] = [];
    const aggregatedFunctionalParts: MessageFunctionalPart[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || '';

        for (const part of parts) {
            if (part.trim() === '' || !part.startsWith('data: ')) {
                continue;
            }

            const dataStr = part.substring(6).trim();

            try {
                const data = JSON.parse(dataStr);
                const contentParts = data?.candidates?.[0]?.content?.parts as GeminiResponsePart[] | undefined;
                if (!contentParts?.length) {
                    continue;
                }

                const toolCalls: AgentToolCall[] = [];
                let hasTextDelta = false;

                contentParts.forEach((contentPart, index) => {
                    const functionCall = contentPart.functionCall?.name
                        ? {
                            id: contentPart.functionCall.id,
                            name: contentPart.functionCall.name,
                            args: contentPart.functionCall.args || {}
                        }
                        : undefined;
                    aggregatedModelParts.push({
                        text: contentPart.text,
                        thoughtSignature: contentPart.thoughtSignature,
                        functionCall
                    } satisfies AgentResponsePart);

                    if (contentPart.text) {
                        fullText += contentPart.text;
                        hasTextDelta = true;
                    }

                    if (functionCall?.name) {
                        const toolCall = {
                            id: functionCall.id || `${functionCall.name}-${index}-${toolCalls.length}`,
                            name: functionCall.name,
                            arguments: functionCall.args || {}
                        };
                        toolCalls.push(toolCall);
                        if (!aggregatedToolCalls.some((existing) => existing.id === toolCall.id)) {
                            aggregatedToolCalls.push(toolCall);
                            aggregatedFunctionalParts.push({
                                id: `function-call-${toolCall.id}`,
                                kind: 'function_call',
                                title: toolCall.name,
                                content: formatGeminiFunctionalPartContent({
                                    id: toolCall.id,
                                    name: toolCall.name,
                                    arguments: toolCall.arguments || {}
                                })
                            });
                        }
                    }
                });

                if (hasTextDelta || toolCalls.length > 0) {
                    onUpdate({
                        text: fullText,
                        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                        functionalParts: aggregatedFunctionalParts.length > 0
                            ? [...aggregatedFunctionalParts]
                            : undefined
                    });
                }
            } catch (error) {
                console.warn('Error parsing SSE data line', dataStr, error);
            }
        }
    }

    return {
        text: fullText,
        toolCalls: aggregatedToolCalls.length > 0 ? aggregatedToolCalls : undefined,
        functionalParts: aggregatedFunctionalParts.length > 0 ? aggregatedFunctionalParts : undefined,
        modelTurn: aggregatedModelParts.length > 0
            ? {
                role: 'model',
                parts: aggregatedModelParts
            }
            : undefined
    };
}

export class GeminiApiProvider implements IAgentCapableProvider {
    public id = 'gemini-api';
    private abortController: AbortController | null = null;
    private apiKey?: string;

    constructor(options?: { apiKey?: string }) {
        this.apiKey = options?.apiKey;
    }

    private readProcessEnvApiKey(): string | undefined {
        const processEnv = typeof process !== 'undefined' && process?.env ? process.env : undefined;
        return processEnv?.CHATPRISM_LLM_API_KEY || processEnv?.VITE_LLM_API_KEY;
    }

    private readGlobalEnvApiKey(): string | undefined {
        const globalEnv = (globalThis as typeof globalThis & {
            CHATPRISM_ENV?: Record<string, string | undefined>;
        }).CHATPRISM_ENV;
        return globalEnv?.WXT_GEMINI_API_KEY || globalEnv?.VITE_GEMINI_API_KEY || globalEnv?.CHATPRISM_LLM_API_KEY;
    }

    private resolveApiKey(): string | undefined {
        if (this.apiKey) {
            return this.apiKey;
        }

        return this.readProcessEnvApiKey() || this.readGlobalEnvApiKey();
    }

    private resolveStaticGeminiModelId(requestedModel?: string): string {
        const fallbackCatalog = getGeminiModelCatalog();
        const normalizedRequested = requestedModel?.trim();
        if (!normalizedRequested) {
            return fallbackCatalog.defaultModel;
        }

        const matchedStaticModel = findGeminiModelMatch(fallbackCatalog.models, normalizedRequested);
        if (matchedStaticModel) {
            return matchedStaticModel.id;
        }

        return normalizedRequested;
    }

    private async resolveRequestedModelId(requestedModel?: string): Promise<string> {
        const normalizedRequested = requestedModel?.trim();

        try {
            const catalog = await this.getAvailableModels();
            if (!normalizedRequested) {
                return catalog.defaultModel;
            }

            const matchedModel = findGeminiModelMatch(catalog.models, normalizedRequested);
            if (matchedModel) {
                return matchedModel.id;
            }

            const staticModelId = this.resolveStaticGeminiModelId(normalizedRequested);
            if (isGeminiProLatestAlias(normalizedRequested) || staticModelId === 'gemini-pro-latest') {
                return normalizeGeminiFallbackDefault(catalog.models, 'gemini-pro-latest');
            }
        } catch {
            return this.resolveStaticGeminiModelId(normalizedRequested);
        }

        return this.resolveStaticGeminiModelId(normalizedRequested);
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
                models: resolvedModels.map(attachGeminiModelOptions),
                defaultModel: normalizeGeminiFallbackDefault(resolvedModels, fallbackCatalog.defaultModel)
            };
        } catch {
            return fallbackCatalog;
        }
    }

    async checkAuth(): Promise<boolean> {
        return !!this.resolveApiKey();
    }

    async getDocumentCapability() {
        return {
            acceptedMimeTypes: ['text/plain', 'text/markdown', 'application/pdf']
        };
    }

    private async resolveConversationTitleModelId(requestedModel?: string): Promise<string> {
        const normalizedRequested = requestedModel?.trim();
        if (normalizedRequested) {
            return this.resolveStaticGeminiModelId(normalizedRequested);
        }

        return 'gemini-2.0-flash';
    }

    async generateConversationTitle(
        prompt: string,
        options: GenerateConversationTitleOptions = {}
    ): Promise<string> {
        const apiKey = this.resolveApiKey();
        if (!apiKey) {
            throw new Error('No Gemini API Key found in environment variables');
        }

        const modelId = await this.resolveConversationTitleModelId(options.modelId);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const payload: Record<string, unknown> = {
            contents: buildGeminiContents(
                buildGeminiConversationTitlePrompt(prompt, options.maxLength ?? GEMINI_TITLE_MAX_LENGTH),
                {}
            )
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini title request failed: ${response.status} ${response.statusText} - ${err}`);
        }

        const streamResult = await parseGeminiSse(response, () => undefined);
        return normalizeGeneratedTitle(streamResult.text, options.maxLength ?? GEMINI_TITLE_MAX_LENGTH);
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

        const modelId = await this.resolveRequestedModelId(options.modelId);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;

        this.abortController = new AbortController();

        const payload: Record<string, unknown> = {
            contents: buildGeminiContents(prompt, options)
        };
        const thinkingConfig = buildGeminiThinkingConfig(modelId, options.reasoningEffort);
        if (thinkingConfig) {
            payload.generationConfig = {
                thinkingConfig
            };
        }

        const requestTools = buildGeminiRequestTools({
            modelOptions: options.modelOptions
        });
        if (requestTools.length > 0) {
            payload.tools = requestTools;
        }

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

        const streamResult = await parseGeminiSse(response, onUpdate);

        this.abortController = null;

        const conversationId = options.context?.conversationId || crypto.randomUUID();
        const messageId = crypto.randomUUID();

        return {
            text: streamResult.text,
            conversationId,
            messageId,
            toolCalls: streamResult.toolCalls,
            functionalParts: streamResult.functionalParts
        };
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
        const apiKey = this.resolveApiKey();
        if (!apiKey) {
            throw new Error('No Gemini API Key found in environment variables');
        }

        const modelId = await this.resolveRequestedModelId(request.modelId || request.agent.modelName?.trim());
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;

        this.abortController = new AbortController();

        const payload: Record<string, unknown> = {
            systemInstruction: {
                parts: [{ text: buildGeminiSystemInstruction(request) }]
            },
            contents: buildGeminiAgentContents(request)
        };
        const thinkingConfig = buildGeminiThinkingConfig(modelId, request.reasoningEffort);
        if (thinkingConfig) {
            payload.generationConfig = {
                thinkingConfig
            };
        }

        const requestTools = buildGeminiRequestTools({
            modelOptions: request.modelOptions,
            tools: request.tools
        });
        if (requestTools.length > 0) {
            payload.tools = requestTools;
        }

        const functionDeclarations = buildGeminiFunctionDeclarations(request.tools);
        if (functionDeclarations.length > 0) {
            payload.toolConfig = {
                functionCallingConfig: {
                    mode: 'AUTO'
                }
            };
        }

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

        const streamResult = await parseGeminiSse(response, onUpdate);

        this.abortController = null;

        return {
            text: streamResult.text,
            conversationId: request.context?.conversationId || crypto.randomUUID(),
            messageId: crypto.randomUUID(),
            toolCalls: streamResult.toolCalls,
            modelTurn: streamResult.modelTurn,
            functionalParts: streamResult.functionalParts
        };
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
