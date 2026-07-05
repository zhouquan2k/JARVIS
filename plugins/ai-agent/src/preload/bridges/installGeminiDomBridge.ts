import { injectPrompt, observeReply } from '../domChat/domChatObserver';
import {
    countReplyBubbles,
    readAvailableModels,
    readLatestReply,
    setActiveModel,
    setReasoningEffort,
    setWebSearchEnabled,
    type ReasoningEffort
} from '../domChat/domChatCore';
import type { ContextBridgeLike, IpcRendererLike } from '../types';

const DOM_EVENT_CHANNEL = 'desktop:controlled-page:dom-event-from-page';
const PROVIDER = 'gemini' as const;

interface DomEvent {
    providerId: string;
    requestId: string;
    type: 'chunk' | 'done' | 'error';
    text?: string;
    message?: string;
}

function resolveProviderId(): string {
    return document.documentElement.getAttribute('data-jarvis-provider-id') || 'gemini-dom';
}

function createSendEvent(ipc: IpcRendererLike) {
    return (event: Omit<DomEvent, 'providerId'>) => {
        ipc.send(DOM_EVENT_CHANNEL, { providerId: resolveProviderId(), ...event } satisfies DomEvent);
    };
}

let disposeObserver: (() => void) | null = null;

export function installGeminiDomBridge(deps: {
    contextBridge: ContextBridgeLike;
    ipcRenderer: IpcRendererLike;
}): void {
    const sendEvent = createSendEvent(deps.ipcRenderer);

    deps.contextBridge.exposeInMainWorld('__jarvisInjectPrompt', async (prompt: string, requestId: string): Promise<void> => {
        console.log('[GeminiDomPreload] inject-start', requestId);
        disposeObserver?.();
        disposeObserver = null;

        const baselineText = readLatestReply(document, PROVIDER);
        const baselineBubbleCount = countReplyBubbles(document, PROVIDER);

        const result = await injectPrompt(document, PROVIDER, prompt);
        if (!result.ok) {
            sendEvent({ requestId, type: 'error', message: `Gemini ${result.stage}: ${result.message}` });
            return;
        }

        console.log('[GeminiDomPreload] click-send', requestId);
        disposeObserver = observeReply(document, PROVIDER, {
            onSnapshot: (text) => sendEvent({ requestId, type: 'chunk', text }),
            onDone: (text, reason) => {
                console.log('[GeminiDomPreload] done', requestId, reason);
                sendEvent({ requestId, type: 'done', text });
            }
        }, { baselineText, baselineBubbleCount });
    });
    deps.contextBridge.exposeInMainWorld('__jarvisReadReplyText', () => readLatestReply(document, PROVIDER));
    deps.contextBridge.exposeInMainWorld('__jarvisSetWebSearch', async (enabled: boolean) => {
        console.log('[GeminiDomPreload] set-web-search', enabled);
        const result = await setWebSearchEnabled(document, PROVIDER, enabled);
        console.log('[GeminiDomPreload] set-web-search-result', JSON.stringify(result));
    });
    deps.contextBridge.exposeInMainWorld('__jarvisReadAvailableModels', async () => {
        console.log('[GeminiDomPreload] read-available-models');
        const models = await readAvailableModels(document, PROVIDER);
        console.log('[GeminiDomPreload] read-available-models-result', JSON.stringify(models));
        return models;
    });
    deps.contextBridge.exposeInMainWorld('__jarvisSetModel', async (modelId: string): Promise<{ ok: boolean; note: string }> => {
        console.log('[GeminiDomPreload] set-model', modelId);
        const result = await setActiveModel(document, PROVIDER, modelId);
        console.log('[GeminiDomPreload] set-model-result', JSON.stringify(result));
        return result;
    });
    deps.contextBridge.exposeInMainWorld('__jarvisSetReasoningEffort', async (effort: ReasoningEffort): Promise<{ ok: boolean; note: string }> => {
        console.log('[GeminiDomPreload] set-reasoning-effort', effort);
        const result = await setReasoningEffort(document, PROVIDER, effort);
        console.log('[GeminiDomPreload] set-reasoning-effort-result', JSON.stringify(result));
        return result;
    });
}
