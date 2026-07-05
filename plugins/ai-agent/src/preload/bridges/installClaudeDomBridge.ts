import { injectPrompt, observeReply } from '../domChat/domChatObserver';
import {
    countReplyBubbles,
    describeLatestReplyNode,
    readAvailableModels,
    readLatestReply,
    setActiveModel,
    setReasoningEffort,
    type ReasoningEffort
} from '../domChat/domChatCore';
import type { ContextBridgeLike, IpcRendererLike } from '../types';

const DOM_EVENT_CHANNEL = 'desktop:controlled-page:dom-event-from-page';
const PROVIDER_ID = 'claude-dom';
const PROVIDER = 'claude' as const;

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

export function installClaudeDomBridge(deps: {
    contextBridge: ContextBridgeLike;
    ipcRenderer: IpcRendererLike;
}): void {
    const sendEvent = createSendEvent(deps.ipcRenderer);

    deps.contextBridge.exposeInMainWorld('__jarvisInjectPrompt', async (prompt: string, requestId: string): Promise<void> => {
        console.log('[ClaudeDomPreload] inject-start', requestId);
        disposeObserver?.();
        disposeObserver = null;

        const baselineText = readLatestReply(document, PROVIDER);
        const baselineBubbleCount = countReplyBubbles(document, PROVIDER);

        const result = await injectPrompt(document, PROVIDER, prompt);
        if (!result.ok) {
            sendEvent({ requestId, type: 'error', message: `Claude ${result.stage}: ${result.message}` });
            return;
        }

        console.log('[ClaudeDomPreload] click-send', requestId);
        disposeObserver = observeReply(document, PROVIDER, {
            onSnapshot: (text) => sendEvent({ requestId, type: 'chunk', text }),
            onDone: (text, reason) => {
                console.log('[ClaudeDomPreload] done', requestId, reason);
                try {
                    const dump = describeLatestReplyNode(document, PROVIDER);
                    const { outerHTML, ...summary } = dump;
                    console.log('[ClaudeDomPreload] reply-node-dump-summary', requestId, JSON.stringify({ reason, ...summary }));
                    console.log('[ClaudeDomPreload] reply-node-dump-html', requestId, outerHTML);
                } catch (err) {
                    console.warn('[ClaudeDomPreload] reply-node-dump-failed', requestId, String(err));
                }
                sendEvent({ requestId, type: 'done', text });
            }
        }, { baselineText, baselineBubbleCount });
    });
    deps.contextBridge.exposeInMainWorld('__jarvisReadReplyText', () => readLatestReply(document, PROVIDER));
    deps.contextBridge.exposeInMainWorld('__jarvisReadAvailableModels', async () => {
        console.log('[ClaudeDomPreload] read-available-models');
        const models = await readAvailableModels(document, PROVIDER);
        console.log('[ClaudeDomPreload] read-available-models-result', JSON.stringify(models));
        return models;
    });
    deps.contextBridge.exposeInMainWorld('__jarvisSetReasoningEffort', async (effort: ReasoningEffort): Promise<{ ok: boolean; note: string }> => {
        console.log('[ClaudeDomPreload] set-reasoning-effort', effort);
        const result = await setReasoningEffort(document, PROVIDER, effort);
        console.log('[ClaudeDomPreload] set-reasoning-effort-result', JSON.stringify(result));
        return result;
    });
    deps.contextBridge.exposeInMainWorld('__jarvisSetModel', async (modelId: string): Promise<{ ok: boolean; note: string }> => {
        console.log('[ClaudeDomPreload] set-model', modelId);
        const result = await setActiveModel(document, PROVIDER, modelId);
        console.log('[ClaudeDomPreload] set-model-result', JSON.stringify(result));
        return result;
    });
}
