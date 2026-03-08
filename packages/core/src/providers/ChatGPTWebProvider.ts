/// <reference types="chrome"/>
import { APP_CONFIG, type ModelConfig, type ProviderModelCatalog } from '../../config';
import type { ConversationHistorySummary, ConversationSourceType, IHistoryProvider } from '../interfaces/IHistoryProvider';
import type { Conversation } from '../interfaces/IStorageProvider';
import { IModelProvider } from '../interfaces/IModelProvider';
import { sha3_512 } from 'js-sha3';

// UUID v4 generator helper
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const randomIntInclusive = (min: number, max: number): number => {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return Math.floor(Math.random() * (upper - lower + 1) + lower);
};

function generateProofToken(seed: string, diff: string, userAgent: string): string {
    const cores = [1, 2, 4];
    const screens = [3008, 4010, 6000];
    const reacts = [
        '_reactListeningcfilawjnerp',
        '_reactListening9ne2dfo1i47',
        '_reactListening410nzwhan2a',
    ];
    const acts = ['alert', 'ontransitionend', 'onprogress'];

    const core = cores[randomIntInclusive(0, cores.length - 1)];
    const screen = screens[randomIntInclusive(0, screens.length - 1)] + core;
    const react = reacts[randomIntInclusive(0, reacts.length - 1)];
    const act = acts[randomIntInclusive(0, acts.length - 1)];

    const parseTime = new Date().toString();

    const config: any[] = [
        screen,
        parseTime,
        4294705152,
        0,
        userAgent,
        'https://tcr9i.chat.openai.com/v2/35536E1E-65B4-4D96-9D97-6ADB7EFF8147/api.js',
        'dpl=1440a687921de39ff5ee56b92807faaadce73f13',
        'en',
        'en-US',
        4294705152,
        'plugins−[object PluginArray]',
        react,
        act,
    ];

    const diffLen = diff.length;

    for (let i = 0; i < 500000; i++) {
        config[3] = i;
        const jsonData = JSON.stringify(config);
        const base = btoa(unescape(encodeURIComponent(jsonData)));
        const hashValue = sha3_512.create().update(seed + base);

        if (hashValue.hex().substring(0, diffLen) <= diff) {
            return 'gAAAAAB' + base;
        }
    }

    const fallbackBase = btoa(unescape(encodeURIComponent(`"${seed}"`)));
    return 'gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D' + fallbackBase;
}

type ChatGPTListItem = {
    id: string;
    title?: string | null;
    update_time?: number | string | null;
};

type ChatGPTMessageContent = {
    content_type?: string;
    parts?: unknown[];
    text?: string;
};

type ChatGPTMappingNode = {
    id?: string;
    parent?: string | null;
    children?: string[];
    message?: {
        id?: string;
        author?: { role?: string | null };
        content?: ChatGPTMessageContent | null;
    } | null;
};

type ChatGPTConversationDetail = {
    title?: string | null;
    conversation_id?: string;
    id?: string;
    current_node?: string | null;
    mapping?: Record<string, ChatGPTMappingNode>;
    update_time?: number | string | null;
    create_time?: number | string | null;
};

const CHATGPT_HISTORY_SOURCE: ConversationSourceType = 'chatgpt_web';

function getStaticChatGPTModelCatalog(): ProviderModelCatalog {
    const provider = APP_CONFIG.providers.find((item) => item.id === 'chatgpt-web');
    if (!provider) {
        throw new Error("Static config for 'chatgpt-web' is missing");
    }

    return {
        models: provider.models.map((model) => ({ ...model })),
        defaultModel: provider.defaultModel
    };
}

function normalizeTimestamp(value: number | string | null | undefined): number {
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
            value = parsed;
        }
    }

    if (typeof value !== 'number' || Number.isNaN(value)) {
        return Date.now();
    }

    return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

function normalizeTitle(title: string | null | undefined): string {
    const trimmed = title?.trim();
    return trimmed || 'Untitled Conversation';
}

function extractTextPart(part: unknown): string {
    if (typeof part === 'string') {
        return part;
    }

    if (part && typeof part === 'object') {
        const candidate = part as { text?: unknown; content?: unknown };
        if (typeof candidate.text === 'string') {
            return candidate.text;
        }
        if (typeof candidate.content === 'string') {
            return candidate.content;
        }
    }

    return '';
}

function extractMessageText(content: ChatGPTMessageContent | null | undefined): string {
    if (!content) {
        return '';
    }

    if (typeof content.text === 'string') {
        return content.text.trim();
    }

    if (Array.isArray(content.parts)) {
        return content.parts.map(extractTextPart).join('\n').trim();
    }

    return '';
}

function toRenderableRole(role?: string | null): 'user' | 'assistant' | null {
    return role === 'user' || role === 'assistant' ? role : null;
}

function buildPrimaryNodeChain(detail: ChatGPTConversationDetail): ChatGPTMappingNode[] {
    const mapping = detail.mapping || {};
    const chain: ChatGPTMappingNode[] = [];
    const visited = new Set<string>();
    let currentId = detail.current_node || null;

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const node = mapping[currentId];
        if (!node) {
            break;
        }
        chain.unshift(node);
        currentId = node.parent || null;
    }

    if (chain.length > 0) {
        return chain;
    }

    const rootId = Object.keys(mapping).find((key) => !mapping[key]?.parent);
    currentId = rootId || null;

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const node = mapping[currentId];
        if (!node) {
            break;
        }
        chain.push(node);
        currentId = node.children?.[0] || null;
    }

    return chain;
}

function normalizeModelLabel(value: string): string {
    return value
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toModelConfig(candidate: unknown): ModelConfig | null {
    if (!candidate || typeof candidate !== 'object') {
        return null;
    }

    const record = candidate as Record<string, unknown>;
    const idCandidate = [record.slug, record.id, record.model_slug, record.model_id].find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
    );

    if (!idCandidate) {
        return null;
    }

    const nameCandidate = [
        record.title,
        record.name,
        record.label,
        record.display_name,
        record.text
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    return {
        id: idCandidate,
        name: nameCandidate || normalizeModelLabel(idCandidate)
    };
}

function collectModelConfigs(input: unknown, acc: ModelConfig[] = [], visited = new Set<unknown>()): ModelConfig[] {
    if (!input || typeof input !== 'object' || visited.has(input)) {
        return acc;
    }

    visited.add(input);

    if (Array.isArray(input)) {
        for (const item of input) {
            collectModelConfigs(item, acc, visited);
        }
        return acc;
    }

    const directCandidate = toModelConfig(input);
    if (directCandidate && !acc.some((item) => item.id === directCandidate.id)) {
        acc.push(directCandidate);
    }

    for (const value of Object.values(input as Record<string, unknown>)) {
        collectModelConfigs(value, acc, visited);
    }

    return acc;
}

function resolveDefaultModel(models: ModelConfig[], fallbackDefaultModel: string): string {
    if (models.some((model) => model.id === fallbackDefaultModel)) {
        return fallbackDefaultModel;
    }

    return models[0]?.id || fallbackDefaultModel;
}

function isLikelyChatGPTModelId(value: string): boolean {
    return /^(gpt|o[13]|o4|auto|text-|chatgpt-)/i.test(value);
}

export function normalizeChatGPTConversationDetail(
    detail: ChatGPTConversationDetail,
    fallbackExternalId: string
): Conversation {
    const backendId = detail.conversation_id || detail.id || fallbackExternalId;
    const messages = buildPrimaryNodeChain(detail)
        .map((node) => {
            const role = toRenderableRole(node.message?.author?.role);
            const content = extractMessageText(node.message?.content);
            if (!role || !content) {
                return null;
            }

            return {
                id: node.message?.id || node.id || generateUUID(),
                role,
                content
            };
        })
        .filter((item): item is Conversation['messages'][number] => item !== null);

    return {
        id: generateUUID(),
        title: normalizeTitle(detail.title),
        backendId,
        externalId: backendId,
        sourceType: CHATGPT_HISTORY_SOURCE,
        messages,
        updatedAt: normalizeTimestamp(detail.update_time ?? detail.create_time)
    };
}

export class ChatGPTWebProvider implements IModelProvider, IHistoryProvider {
    public id = 'chatgpt-web';
    private accessToken: string | null = null;
    private abortController: AbortController | null = null;

    async checkAuth(): Promise<boolean> {
        try {
            const resp = await fetch('https://chatgpt.com/api/auth/session', {
                credentials: 'include'
            });
            if (!resp.ok) return false;
            const data = await resp.json();
            if (data && data.accessToken) {
                this.accessToken = data.accessToken;
                return true;
            }
            return false;
        } catch (e) {
            console.error('ChatGPT auth check failed:', e);
            return false;
        }
    }

    async getAvailableModels(): Promise<ProviderModelCatalog> {
        const fallbackCatalog = getStaticChatGPTModelCatalog();
        const payload = await this.fetchModelCatalogPayload();
        const models = collectModelConfigs(payload).filter((model) => isLikelyChatGPTModelId(model.id));

        if (models.length === 0) {
            return fallbackCatalog;
        }

        return {
            models,
            defaultModel: resolveDefaultModel(models, fallbackCatalog.defaultModel)
        };
    }

    private async fetchModelCatalogPayload(): Promise<unknown> {
        const candidateUrls = [
            'https://chatgpt.com/backend-api/models?history_and_training_disabled=false',
            'https://chatgpt.com/backend-api/models'
        ];
        let lastError: unknown;

        for (const url of candidateUrls) {
            try {
                return await this.fetchJson<unknown>(url);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError instanceof Error ? lastError : new Error('Failed to fetch ChatGPT model catalog');
    }

    private async getOaiDeviceId(): Promise<string> {
        try {
            // If in an extension background, we can try to extract from cookies
            if (typeof chrome !== 'undefined' && chrome.cookies) {
                const cookie = await chrome.cookies.get({ url: 'https://chatgpt.com', name: 'oai-did' });
                if (cookie && cookie.value) return cookie.value;
            }
        } catch (e) {
            console.warn('Failed to get oai-did cookie', e);
        }
        return generateUUID(); // fallback
    }

    private async ensureAccessToken(): Promise<void> {
        if (this.accessToken) {
            return;
        }

        const isAuth = await this.checkAuth();
        if (!isAuth) {
            throw new Error('Not authenticated with ChatGPT Web');
        }
    }

    private async fetchJson<T>(input: string, init: RequestInit = {}): Promise<T> {
        await this.ensureAccessToken();

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.accessToken}`,
            ...(init.headers as Record<string, string> | undefined)
        };

        const response = await fetch(input, {
            ...init,
            credentials: 'include',
            headers
        });

        if (!response.ok) {
            const errorDetail = await response.text().catch(() => '');
            const detailSuffix = errorDetail ? ` - ${errorDetail}` : '';
            throw new Error(`ChatGPT request failed: ${response.status} ${response.statusText}${detailSuffix}`);
        }

        return response.json() as Promise<T>;
    }

    async getHistoryList(): Promise<ConversationHistorySummary[]> {
        const data = await this.fetchJson<{ items?: ChatGPTListItem[] }>(
            'https://chatgpt.com/backend-api/conversations?offset=0&limit=28&order=updated'
        );

        return (data.items || []).map((item) => ({
            id: item.id,
            title: normalizeTitle(item.title),
            updatedAt: normalizeTimestamp(item.update_time),
            sourceType: CHATGPT_HISTORY_SOURCE
        }));
    }

    async getHistoryDetail(externalId: string): Promise<Conversation> {
        const detail = await this.fetchJson<ChatGPTConversationDetail>(
            `https://chatgpt.com/backend-api/conversation/${externalId}`
        );

        return normalizeChatGPTConversationDetail(detail, externalId);
    }

    async getChatRequirements(): Promise<any | null> {
        try {
            await this.ensureAccessToken();
            const deviceId = await this.getOaiDeviceId();
            const resp = await fetch('https://chatgpt.com/backend-api/sentinel/chat-requirements', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    'OAI-Device-Id': deviceId,
                    'OAI-Language': 'en-US'
                },
                body: JSON.stringify({})
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data || null;
        } catch (e) {
            console.warn('Failed to get chat requirements:', e);
            return null;
        }
    }

    async sendMessage(
        prompt: string,
        options: {
            context?: { parentMessageId?: string, conversationId?: string },
            modelId?: string
        } = {},
        onUpdate: (chunk: string) => void
    ): Promise<{ text: string, conversationId: string, messageId: string }> {
        await this.ensureAccessToken();

        const requirements = await this.getChatRequirements();
        const requirementToken = requirements?.token;

        let proofToken: string | undefined;
        if (requirements?.proofofwork?.required) {
            proofToken = generateProofToken(
                requirements.proofofwork.seed,
                requirements.proofofwork.difficulty,
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            );
        }

        const deviceId = await this.getOaiDeviceId();
        const context = options.context || {};
        const parentMessageId = context.parentMessageId || generateUUID();
        const messageId = generateUUID();

        const payload: any = {
            action: 'next',
            messages: [
                {
                    id: messageId,
                    author: { role: 'user' },
                    content: { content_type: 'text', parts: [prompt] }
                }
            ],
            parent_message_id: parentMessageId,
            model: options.modelId || 'auto',
            timezone_offset_min: new Date().getTimezoneOffset(),
            history_and_training_disabled: false,
        };

        if (context.conversationId) {
            payload.conversation_id = context.conversationId;
        }

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'OAI-Device-Id': deviceId,
            'OAI-Language': 'en-US'
        };

        if (requirementToken) {
            headers['Openai-Sentinel-Chat-Requirements-Token'] = requirementToken;
        }
        if (proofToken) {
            headers['Openai-Sentinel-Proof-Token'] = proofToken;
        }

        this.abortController = new AbortController();

        const response = await fetch('https://chatgpt.com/backend-api/conversation', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const errorDetail = await response.text().catch(() => '');
            const detailSuffix = errorDetail ? ` - ${errorDetail}` : '';
            throw new Error(`ChatGPT API request failed: ${response.status} ${response.statusText}${detailSuffix}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body stream available');

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullText = '';
        let replyConversationId = context.conversationId || '';
        let replyMessageId = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');

            // Leave the last incomplete part in the buffer
            buffer = parts.pop() || '';

            for (const part of parts) {
                if (part.trim() === '') continue;
                if (!part.startsWith('data: ')) continue;

                const dataStr = part.substring(6).trim();
                if (dataStr === '[DONE]') break;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.message?.content?.parts?.[0]) {
                        // ChatGPT provides full text replacement
                        fullText = data.message.content.parts[0];
                        replyConversationId = data.conversation_id || replyConversationId;
                        replyMessageId = data.message.id || replyMessageId;
                        onUpdate(fullText);
                    }
                } catch (e) {
                    console.warn('Error parsing SSE data line', dataStr, e);
                }
            }
        }

        this.abortController = null;
        return {
            text: fullText,
            conversationId: replyConversationId,
            messageId: replyMessageId
        };
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
