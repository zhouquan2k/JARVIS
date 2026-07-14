import { injectPrompt, observeReply, waitForConversationSettled } from '../domChat/domChatObserver';
import {
    readAvailableModels,
    readLatestReply,
    setActiveModel,
    setReasoningEffort,
    setWebSearchEnabled,
    type ReasoningEffort
} from '../domChat/domChatCore';
import type { ContextBridgeLike, IpcRendererLike } from '../types';

const DOM_EVENT_CHANNEL = 'desktop:controlled-page:dom-event-from-page';
const PROVIDER_ID = 'chatgpt-dom';
const PROVIDER = 'chatgpt' as const;

interface DomEvent {
    providerId: string;
    requestId: string;
    type: 'chunk' | 'done' | 'error';
    text?: string;
    message?: string;
}

function createSendEvent(ipc: IpcRendererLike) {
    return (event: Omit<DomEvent, 'providerId'>) => {
        ipc.send(DOM_EVENT_CHANNEL, { providerId: PROVIDER_ID, ...event } satisfies DomEvent);
    };
}

let disposeObserver: (() => void) | null = null;

export function installChatGPTDomBridge(deps: {
    contextBridge: ContextBridgeLike;
    ipcRenderer: IpcRendererLike;
}): void {
    const sendEvent = createSendEvent(deps.ipcRenderer);

    deps.contextBridge.exposeInMainWorld('__jarvisInjectPrompt', async (prompt: string, requestId: string): Promise<void> => {
        console.log('[ChatGPTDomPreload] inject-start', requestId);
        disposeObserver?.();
        disposeObserver = null;

        // 捕获基线前先等会话历史渲染稳定：resume 追问轮 loadURL 后 SPA 仍在水合，
        // 立即数气泡会低估基线，导致后补渲染的旧气泡被误当成本轮回复。
        const { text: baselineText, bubbleCount: baselineBubbleCount } = await waitForConversationSettled(document, PROVIDER);

        const result = await injectPrompt(document, PROVIDER, prompt);
        if (!result.ok) {
            sendEvent({ requestId, type: 'error', message: `ChatGPT ${result.stage}: ${result.message}` });
            return;
        }

        console.log('[ChatGPTDomPreload] click-send', requestId);
        disposeObserver = observeReply(document, PROVIDER, {
            onSnapshot: (text) => sendEvent({ requestId, type: 'chunk', text }),
            onDone: (text, reason) => {
                console.log('[ChatGPTDomPreload] done', requestId, reason);
                sendEvent({ requestId, type: 'done', text });
            }
        }, { baselineText, baselineBubbleCount });
    });
    deps.contextBridge.exposeInMainWorld('__jarvisReadReplyText', () => readLatestReply(document, PROVIDER));
    deps.contextBridge.exposeInMainWorld('__jarvisSetWebSearch', async (enabled: boolean) => {
        console.log('[ChatGPTDomPreload] set-web-search', enabled);
        const result = await setWebSearchEnabled(document, PROVIDER, enabled);
        console.log('[ChatGPTDomPreload] set-web-search-result', JSON.stringify(result));
    });
    deps.contextBridge.exposeInMainWorld('__jarvisReadAvailableModels', async () => {
        console.log('[ChatGPTDomPreload] read-available-models');
        const models = await readAvailableModels(document, PROVIDER);
        console.log('[ChatGPTDomPreload] read-available-models-result', JSON.stringify(models));
        return models;
    });
    deps.contextBridge.exposeInMainWorld('__jarvisSetModel', async (modelId: string): Promise<{ ok: boolean; note: string }> => {
        console.log('[ChatGPTDomPreload] set-model', modelId);
        const result = await setActiveModel(document, PROVIDER, modelId);
        console.log('[ChatGPTDomPreload] set-model-result', JSON.stringify(result));
        return result;
    });
    deps.contextBridge.exposeInMainWorld('__jarvisSetReasoningEffort', async (effort: ReasoningEffort): Promise<{ ok: boolean; note: string }> => {
        console.log('[ChatGPTDomPreload] set-reasoning-effort', effort);
        const result = await setReasoningEffort(document, PROVIDER, effort);
        console.log('[ChatGPTDomPreload] set-reasoning-effort-result', JSON.stringify(result));
        return result;
    });
}
