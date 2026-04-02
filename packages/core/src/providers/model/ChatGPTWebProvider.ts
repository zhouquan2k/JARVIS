/// <reference types="chrome"/>
import { APP_CONFIG, type ModelConfig, type ProviderModelCatalog } from '../../../config';
import type {
    ConversationHistorySummary,
    ExternalHistoryProviderId,
    HistoryListQueryOptions,
    IHistoryProvider
} from '../../interfaces/IHistoryProvider';
import type {
    CiteAnnotation,
    Conversation,
    ConversationMessage,
    MessageAnnotation,
    MessageAttachment
} from '../../interfaces/IStorageProvider';
import { IModelProvider, type ProviderSendResult, type ProviderStreamUpdate, type SendMessageOptions } from '../../interfaces/IModelProvider';
import { sha3_512 } from 'js-sha3';
import type { ChatGPTWebProviderOptions, ProviderCookieStore, ProviderRequestClient } from './providerHostTypes';

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
        metadata?: Record<string, unknown> | null;
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

const CHATGPT_HISTORY_ORIGIN: ExternalHistoryProviderId = 'chatgpt-web';
const CHATGPT_HISTORY_LIST_LIMIT = 28;
const PRIVATE_CITE_PATTERN = /cite(?:([^]+))?/g;
const PRIVATE_IMAGE_GROUP_PATTERN = /image_group(?:([^]+))??/g;
const DEFAULT_CHATGPT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function createDefaultRequestClient(): ProviderRequestClient {
    return {
        fetch(input: string, init?: RequestInit) {
            return fetch(input, init);
        }
    };
}

function createDefaultCookieStore(): ProviderCookieStore | undefined {
    if (typeof chrome === 'undefined' || !chrome.cookies) {
        return undefined;
    }

    return {
        get(options) {
            return chrome.cookies.get(options);
        }
    };
}

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

function cloneModelConfig(model: ModelConfig): ModelConfig {
    return {
        ...model,
        options: model.options?.map((option) => ({
            ...option,
            conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
        }))
    };
}

function getChatGPTModelOptions() {
    const provider = APP_CONFIG.providers.find((item) => item.id === 'chatgpt-web');
    return provider?.models[0]?.options?.map((option) => ({
        ...option,
        conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
    }));
}

function attachChatGPTModelOptions(model: ModelConfig): ModelConfig {
    return {
        ...cloneModelConfig(model),
        options: getChatGPTModelOptions()
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

function normalizeHistoryQuery(query: string | undefined): string {
    return query?.trim() || '';
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

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => toRecord(item))
        .filter((item): item is Record<string, unknown> => !!item);
}

function normalizeChatGPTListItem(value: unknown): ChatGPTListItem | null {
    const record = toRecord(value);
    if (!record) {
        return null;
    }

    const conversationRecord = toRecord(record.conversation) || toRecord(record.item) || toRecord(record.data);
    const source = conversationRecord || record;
    const idCandidate = typeof source.id === 'string'
        ? source.id
        : typeof source.conversation_id === 'string'
            ? source.conversation_id
            : '';
    if (!idCandidate) {
        return null;
    }

    const titleCandidate = typeof source.title === 'string' || source.title === null
        ? source.title
        : typeof record.title === 'string' || record.title === null
            ? record.title
            : null;
    const updateTimeCandidate = source.update_time ?? record.update_time ?? source.updated_at ?? record.updated_at ?? null;

    return {
        id: idCandidate,
        title: typeof titleCandidate === 'string' || titleCandidate === null ? titleCandidate : null,
        update_time: typeof updateTimeCandidate === 'number' || typeof updateTimeCandidate === 'string' || updateTimeCandidate === null
            ? updateTimeCandidate
            : null
    };
}

function extractChatGPTHistoryItems(payload: unknown): ChatGPTListItem[] {
    const record = toRecord(payload);
    const nestedData = toRecord(record?.data);
    const candidates = [
        payload,
        record?.items,
        record?.results,
        record?.conversations,
        nestedData?.items,
        nestedData?.results,
        nestedData?.conversations
    ];

    for (const candidate of candidates) {
        if (!Array.isArray(candidate)) {
            continue;
        }

        return candidate
            .map((item) => normalizeChatGPTListItem(item))
            .filter((item): item is ChatGPTListItem => !!item);
    }

    return [];
}

function stripDataUriPrefix(data: string | undefined): string | undefined {
    if (!data) {
        return undefined;
    }

    return data.replace(/^data:[^;]+;base64,/, '');
}

function normalizeAttachmentPartType(part: Record<string, unknown>): MessageAttachment['type'] | null {
    const rawType = [part.type, part.kind, part.content_type].find((value) => typeof value === 'string');
    if (rawType === 'image') {
        return 'image';
    }

    if (
        rawType === 'file'
        || rawType === 'attachment'
        || rawType === 'input_file'
        || rawType === 'file_attachment'
    ) {
        return 'file';
    }

    const mimeType = typeof part.mimeType === 'string'
        ? part.mimeType
        : typeof part.mime_type === 'string'
            ? part.mime_type
            : '';
    if (mimeType.startsWith('image/')) {
        return 'image';
    }

    if (mimeType) {
        return 'file';
    }

    return null;
}

function extractAttachmentFromPart(part: unknown, index: number): MessageAttachment | null {
    const record = toRecord(part);
    if (!record) {
        return null;
    }

    const attachmentType = normalizeAttachmentPartType(record);
    const mimeType = typeof record.mimeType === 'string'
        ? record.mimeType
        : typeof record.mime_type === 'string'
            ? record.mime_type
            : '';
    const name = typeof record.name === 'string'
        ? record.name
        : typeof record.filename === 'string'
            ? record.filename
            : '';
    if (!attachmentType || !mimeType || !name) {
        return null;
    }

    const base64Data = typeof record.base64Data === 'string'
        ? record.base64Data
        : typeof record.data === 'string'
            ? record.data
            : typeof record.inline_data === 'string'
                ? record.inline_data
                : undefined;
    const previewBase64 = typeof record.previewBase64 === 'string'
        ? record.previewBase64
        : typeof record.preview_base64 === 'string'
            ? record.preview_base64
            : undefined;
    const size = typeof record.size === 'number'
        ? record.size
        : typeof record.size_bytes === 'number'
            ? record.size_bytes
            : 0;

    return {
        id: typeof record.id === 'string' ? record.id : `attachment-${index}`,
        type: attachmentType,
        name,
        mimeType,
        size,
        base64Data: stripDataUriPrefix(base64Data),
        previewBase64: stripDataUriPrefix(previewBase64)
    };
}

function extractMessageAttachments(content: ChatGPTMessageContent | null | undefined): MessageAttachment[] | undefined {
    if (!content?.parts || !Array.isArray(content.parts)) {
        return undefined;
    }

    const attachments = content.parts
        .map((part, index) => extractAttachmentFromPart(part, index))
        .filter((item): item is MessageAttachment => !!item);

    return attachments.length > 0 ? attachments : undefined;
}

function firstString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function getCandidateRefId(candidate: Record<string, unknown>): string | undefined {
    return firstString(candidate.refId, candidate.ref_id, candidate.id, candidate.search_id, candidate.searchId);
}

function getCandidateLabel(candidate: Record<string, unknown>, index: number): string {
    return firstString(candidate.label, candidate.citation_label, candidate.citationLabel) || `[${index + 1}]`;
}

function getCandidateUrl(candidate: Record<string, unknown>): string | undefined {
    return firstString(
        candidate.url,
        candidate.uri,
        candidate.href,
        candidate.link,
        candidate.link_url,
        candidate.linkUrl,
        candidate.source_url,
        candidate.sourceUrl,
        candidate.target_url,
        candidate.targetUrl,
        candidate.canonical_url,
        candidate.canonicalUrl
    );
}

function getCandidateTitle(candidate: Record<string, unknown>): string | undefined {
    return firstString(
        candidate.title,
        candidate.name,
        candidate.display_name,
        candidate.displayName,
        candidate.source_title,
        candidate.sourceTitle
    );
}

function getCandidateSnippet(candidate: Record<string, unknown>): string | undefined {
    return firstString(
        candidate.snippet,
        candidate.text,
        candidate.excerpt,
        candidate.summary,
        candidate.description
    );
}

function isLikelyCiteCandidate(candidate: Record<string, unknown>): boolean {
    const type = typeof candidate.kind === 'string' ? candidate.kind : candidate.type;
    return type === 'cite' || !!getCandidateUrl(candidate) || !!getCandidateRefId(candidate);
}

function isLikelyImageGroupCandidate(candidate: Record<string, unknown>): boolean {
    const type = typeof candidate.kind === 'string' ? candidate.kind : candidate.type;
    return type === 'image_group' || Array.isArray(candidate.images);
}

function buildCandidateFingerprint(candidate: Record<string, unknown>): string {
    return [
        typeof candidate.kind === 'string' ? candidate.kind : candidate.type,
        getCandidateRefId(candidate),
        getCandidateUrl(candidate),
        getCandidateTitle(candidate),
        Array.isArray(candidate.images) ? `images:${candidate.images.length}` : '',
        firstString(candidate.groupId, candidate.group_id)
    ].filter(Boolean).join('|');
}

function collectChatGPTAnnotationCandidates(
    input: unknown,
    acc: Record<string, unknown>[] = [],
    visited = new Set<unknown>(),
    fingerprints = new Set<string>()
): Record<string, unknown>[] {
    if (!input || typeof input !== 'object' || visited.has(input)) {
        return acc;
    }

    visited.add(input);

    if (Array.isArray(input)) {
        for (const item of input) {
            collectChatGPTAnnotationCandidates(item, acc, visited, fingerprints);
        }
        return acc;
    }

    const record = toRecord(input);
    if (!record) {
        return acc;
    }

    if (isLikelyCiteCandidate(record) || isLikelyImageGroupCandidate(record)) {
        const fingerprint = buildCandidateFingerprint(record);
        if (fingerprint && !fingerprints.has(fingerprint)) {
            fingerprints.add(fingerprint);
            acc.push(record);
        }
    }

    for (const value of Object.values(record)) {
        collectChatGPTAnnotationCandidates(value, acc, visited, fingerprints);
    }

    return acc;
}

function scoreCiteCandidate(candidate: Record<string, unknown>): number {
    return (getCandidateUrl(candidate) ? 4 : 0)
        + (getCandidateTitle(candidate) ? 2 : 0)
        + (getCandidateSnippet(candidate) ? 1 : 0);
}

function buildBestCiteCandidateMap(candidates: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
    const bestByRefId = new Map<string, Record<string, unknown>>();

    for (const candidate of candidates) {
        const refId = getCandidateRefId(candidate);
        if (!refId) {
            continue;
        }

        const existing = bestByRefId.get(refId);
        if (!existing || scoreCiteCandidate(candidate) > scoreCiteCandidate(existing)) {
            bestByRefId.set(refId, candidate);
        }
    }

    return bestByRefId;
}

function buildCitePayload(candidate: Record<string, unknown> | undefined, index: number): CiteAnnotation | null {
    if (!candidate) {
        return null;
    }

    const label = getCandidateLabel(candidate, index);
    const refId = getCandidateRefId(candidate) || `cite-${index + 1}`;

    return {
        kind: 'cite',
        range: { start: 0, end: 0 },
        payload: {
            refId,
            label,
            title: getCandidateTitle(candidate),
            url: getCandidateUrl(candidate),
            snippet: getCandidateSnippet(candidate)
        }
    };
}

function buildImageGroupPayload(candidate: Record<string, unknown> | undefined, index: number): MessageAnnotation | null {
    if (!candidate) {
        return null;
    }

    const images = toRecordArray(candidate.images).map((image, imageIndex) => ({
        id: typeof image.id === 'string' ? image.id : `image-${index + 1}-${imageIndex + 1}`,
        mimeType: typeof image.mimeType === 'string'
            ? image.mimeType
            : typeof image.mime_type === 'string'
                ? image.mime_type
                : 'image/png',
        alt: typeof image.alt === 'string' ? image.alt : undefined,
        previewBase64: stripDataUriPrefix(
            typeof image.previewBase64 === 'string'
                ? image.previewBase64
                : typeof image.preview_base64 === 'string'
                    ? image.preview_base64
                    : undefined
        ),
        remoteUrl: typeof image.remoteUrl === 'string'
            ? image.remoteUrl
            : typeof image.url === 'string'
                ? image.url
                : undefined,
        width: typeof image.width === 'number' ? image.width : undefined,
        height: typeof image.height === 'number' ? image.height : undefined
    }));

    if (images.length === 0) {
        return null;
    }

    return {
        kind: 'image_group',
        range: null,
        payload: {
            groupId: typeof candidate.groupId === 'string'
                ? candidate.groupId
                : typeof candidate.group_id === 'string'
                    ? candidate.group_id
                    : `image-group-${index + 1}`,
            images
        }
    };
}

function normalizeChatGPTResponseSnapshot(
    rawText: string,
    metadata?: Record<string, unknown> | null
): Pick<ProviderStreamUpdate, 'text' | 'annotations'> {
    const candidates = collectChatGPTAnnotationCandidates(metadata);
    const citeCandidates = candidates.filter((candidate) => isLikelyCiteCandidate(candidate));
    const imageGroupCandidates = candidates.filter((candidate) => isLikelyImageGroupCandidate(candidate));
    const citeCandidatesByRefId = buildBestCiteCandidateMap(citeCandidates);

    const annotations: MessageAnnotation[] = [];
    let normalizedText = '';
    let cursor = 0;
    let citeIndex = 0;

    for (const match of rawText.matchAll(PRIVATE_CITE_PATTERN)) {
        const matchIndex = match.index ?? 0;
        normalizedText += rawText.slice(cursor, matchIndex);
        const refIdFromMarker = match[1];
        const matchedCandidate = refIdFromMarker
            ? citeCandidatesByRefId.get(refIdFromMarker) || citeCandidates[citeIndex]
            : citeCandidates[citeIndex];
        const fallbackCandidate = refIdFromMarker ? { ref_id: refIdFromMarker } : undefined;
        const citeAnnotation = buildCitePayload(matchedCandidate || fallbackCandidate, citeIndex);
        const label = citeAnnotation?.payload.label || `[${citeIndex + 1}]`;
        const start = normalizedText.length;
        normalizedText += label;
        if (citeAnnotation) {
            annotations.push({
                ...citeAnnotation,
                range: { start, end: start + label.length }
            });
        }
        cursor = matchIndex + match[0].length;
        citeIndex += 1;
    }

    normalizedText += rawText.slice(cursor);
    normalizedText = normalizedText.replace(PRIVATE_IMAGE_GROUP_PATTERN, '').replace(/\n{3,}/g, '\n\n').trim();

    imageGroupCandidates
        .map((candidate, index) => buildImageGroupPayload(candidate, index))
        .filter((item): item is MessageAnnotation => !!item)
        .forEach((annotation) => annotations.push(annotation));

    return {
        text: normalizedText,
        annotations: annotations.length > 0 ? annotations : undefined
    };
}

function normalizeChatGPTMessage(
    content: ChatGPTMessageContent | null | undefined,
    metadata?: Record<string, unknown> | null
): Pick<ConversationMessage, 'content' | 'attachments' | 'annotations'> {
    const textSnapshot = normalizeChatGPTResponseSnapshot(extractMessageText(content), metadata);
    return {
        content: textSnapshot.text,
        attachments: extractMessageAttachments(content),
        annotations: textSnapshot.annotations
    };
}

function buildChatGPTRequestContent(prompt: string, attachments: MessageAttachment[]): ChatGPTMessageContent {
    if (attachments.length === 0) {
        return { content_type: 'text', parts: [prompt] };
    }

    return {
        content_type: 'multimodal_text',
        parts: [
            prompt,
            ...attachments.map((attachment) => ({
                id: attachment.id,
                type: attachment.type === 'image' ? 'image' : 'file_attachment',
                name: attachment.name,
                mimeType: attachment.mimeType,
                size: attachment.size,
                base64Data: stripDataUriPrefix(attachment.base64Data),
                previewBase64: stripDataUriPrefix(attachment.previewBase64)
            }))
        ]
    };
}

function buildChatGPTModePayload(modelOptions: Record<string, boolean> | undefined): Partial<Record<string, unknown>> {
    if (modelOptions?.deep_research === true) {
        return {
            conversation_mode: { kind: 'research' },
            client_contextual_info: {
                is_deep_research: true
            }
        };
    }

    if (modelOptions?.web_search === true) {
        return {
            conversation_mode: { kind: 'search' },
            client_contextual_info: {
                use_search: true
            }
        };
    }

    return {};
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
    const messages: ConversationMessage[] = [];

    for (const node of buildPrimaryNodeChain(detail)) {
        const role = toRenderableRole(node.message?.author?.role);
        const message = normalizeChatGPTMessage(node.message?.content, node.message?.metadata);
        if (!role || !message.content) {
            continue;
        }

        messages.push({
            id: node.message?.id || node.id || generateUUID(),
            role,
            content: message.content,
            attachments: message.attachments,
            annotations: message.annotations
        });
    }

    return {
        id: generateUUID(),
        title: normalizeTitle(detail.title),
        backendId,
        externalId: backendId,
        origin: CHATGPT_HISTORY_ORIGIN,
        messages,
        updatedAt: normalizeTimestamp(detail.update_time ?? detail.create_time)
    };
}

export class ChatGPTWebProvider implements IModelProvider, IHistoryProvider {
    public id: ExternalHistoryProviderId = 'chatgpt-web';
    private accessToken: string | null = null;
    private abortController: AbortController | null = null;
    private readonly requestClient: ProviderRequestClient;
    private readonly cookieStore?: ProviderCookieStore;
    private readonly userAgent: string;

    constructor(options: ChatGPTWebProviderOptions = {}) {
        this.requestClient = options.requestClient ?? createDefaultRequestClient();
        this.cookieStore = options.cookieStore ?? createDefaultCookieStore();
        this.userAgent = options.userAgent ?? DEFAULT_CHATGPT_USER_AGENT;
    }

    async checkAuth(): Promise<boolean> {
        try {
            const resp = await this.requestClient.fetch('https://chatgpt.com/api/auth/session', {
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
            models: models.map(attachChatGPTModelOptions),
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
            if (this.cookieStore) {
                const cookie = await this.cookieStore.get({ url: 'https://chatgpt.com', name: 'oai-did' });
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

        const response = await this.requestClient.fetch(input, {
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

    private normalizeHistorySummaries(items: ChatGPTListItem[]): ConversationHistorySummary[] {
        return items.map((item) => ({
            id: item.id,
            title: normalizeTitle(item.title),
            updatedAt: normalizeTimestamp(item.update_time),
            origin: CHATGPT_HISTORY_ORIGIN
        }));
    }

    private async fetchHistoryListJson(input: string, init?: RequestInit): Promise<ConversationHistorySummary[]> {
        const payload = await this.fetchJson<unknown>(input, init);
        return this.normalizeHistorySummaries(extractChatGPTHistoryItems(payload));
    }

    private async searchHistoryList(query: string): Promise<ConversationHistorySummary[]> {
        const encodedQuery = encodeURIComponent(query);
        const searchCandidates: Array<{ input: string; init?: RequestInit }> = [
            {
                input: `https://chatgpt.com/backend-api/conversations/search?query=${encodedQuery}&offset=0&limit=${CHATGPT_HISTORY_LIST_LIMIT}`
            },
            {
                input: `https://chatgpt.com/backend-api/conversations/search?q=${encodedQuery}&offset=0&limit=${CHATGPT_HISTORY_LIST_LIMIT}`
            },
            {
                input: 'https://chatgpt.com/backend-api/conversations/search',
                init: {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query,
                        offset: 0,
                        limit: CHATGPT_HISTORY_LIST_LIMIT
                    })
                }
            },
            {
                input: `https://chatgpt.com/backend-api/conversations?offset=0&limit=${CHATGPT_HISTORY_LIST_LIMIT}&order=updated&query=${encodedQuery}`
            }
        ];
        let lastError: unknown;

        for (const candidate of searchCandidates) {
            try {
                return await this.fetchHistoryListJson(candidate.input, candidate.init);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError instanceof Error ? lastError : new Error('ChatGPT history search failed');
    }

    async getHistoryList(options: HistoryListQueryOptions = {}): Promise<ConversationHistorySummary[]> {
        const query = normalizeHistoryQuery(options.query);
        if (query) {
            return this.searchHistoryList(query);
        }

        return this.fetchHistoryListJson(
            `https://chatgpt.com/backend-api/conversations?offset=0&limit=${CHATGPT_HISTORY_LIST_LIMIT}&order=updated`
        );
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
            const resp = await this.requestClient.fetch('https://chatgpt.com/backend-api/sentinel/chat-requirements', {
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
        options: SendMessageOptions = {},
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        await this.ensureAccessToken();

        const requirements = await this.getChatRequirements();
        const requirementToken = requirements?.token;

        let proofToken: string | undefined;
        if (requirements?.proofofwork?.required) {
            proofToken = generateProofToken(
                requirements.proofofwork.seed,
                requirements.proofofwork.difficulty,
                this.userAgent
            );
        }

        const deviceId = await this.getOaiDeviceId();
        const context = options.context || {};
        const parentMessageId = context.parentMessageId || generateUUID();
        const messageId = generateUUID();
        const attachments = options.attachments || [];

        const payload: any = {
            action: 'next',
            messages: [
                {
                    id: messageId,
                    author: { role: 'user' },
                    content: buildChatGPTRequestContent(prompt, attachments)
                }
            ],
            parent_message_id: parentMessageId,
            model: options.modelId || 'auto',
            timezone_offset_min: new Date().getTimezoneOffset(),
            history_and_training_disabled: false,
            ...buildChatGPTModePayload(options.modelOptions)
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

        const response = await this.requestClient.fetch('https://chatgpt.com/backend-api/conversation', {
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
        let latestAnnotations: MessageAnnotation[] | undefined;

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
                    const normalizedMessage = normalizeChatGPTMessage(
                        data.message?.content,
                        toRecord(data.message?.metadata)
                    );
                    if (normalizedMessage.content) {
                        // ChatGPT provides full text replacement
                        fullText = normalizedMessage.content;
                        latestAnnotations = normalizedMessage.annotations;
                        replyConversationId = data.conversation_id || replyConversationId;
                        replyMessageId = data.message.id || replyMessageId;
                        onUpdate({
                            text: fullText,
                            annotations: normalizedMessage.annotations
                        });
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
            messageId: replyMessageId,
            annotations: latestAnnotations
        };
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
