import { contextBridge } from 'electron';
import type { GeminiContentRequest, GeminiContentResponse } from '@packages/core/src';
import { createGeminiDomScraper } from '@packages/core/src';

const GEMINI_HISTORY_DEBUG_TEXT_MAX = 120;
const GEMINI_HISTORY_DEBUG_ARRAY_MAX = 1;

function summarizeText(value: string, maxLength = GEMINI_HISTORY_DEBUG_TEXT_MAX): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
}

function safeSerialize(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch (error) {
        return JSON.stringify({
            serializationError: error instanceof Error ? error.message : 'unknown',
            fallbackType: typeof value
        });
    }
}

function shrinkDebugValue(value: unknown, depth = 0): unknown {
    if (typeof value === 'string') {
        return summarizeText(value);
    }

    if (depth >= 4) {
        return Array.isArray(value) ? `[array:${value.length}]` : '[object]';
    }

    if (Array.isArray(value)) {
        return value.slice(0, GEMINI_HISTORY_DEBUG_ARRAY_MAX).map((item) => shrinkDebugValue(item, depth + 1));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [key, shrinkDebugValue(entryValue, depth + 1)])
        );
    }

    return value;
}

function debugHistory(stage: string, payload?: unknown) {
    console.debug(`[ChatPrism][GeminiHistory] ${safeSerialize({
        stage,
        payload: shrinkDebugValue(payload ?? null)
    })}`);
}

const scraper = createGeminiDomScraper({
    mode: 'desktop',
    debug: debugHistory
});

export const {
    applyHistorySearchQuery,
    extractHistoryList,
    hasGeminiHistoryScaffold,
    isAuthRequired,
    shouldTreatMissingHistoryScaffoldAsAuthRequired,
    waitForHistorySearchSettled
} = scraper;

async function handleRequest(request: GeminiContentRequest): Promise<GeminiContentResponse> {
    return scraper.handleRequest(request);
}

export async function handleGeminiHistoryRequestForTest(request: GeminiContentRequest): Promise<GeminiContentResponse> {
    return handleRequest(request);
}

contextBridge.exposeInMainWorld('chatprismGeminiHistory', {
    request(request: GeminiContentRequest) {
        return handleRequest(request);
    }
});
