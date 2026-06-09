/**
 * ChatGPT DOM preload — injected into the hidden chatgpt.com BrowserWindow.
 * Exposes `window.__jarvisInjectPrompt(prompt, requestId)` to the main world.
 *
 * 仅做 electron 桥接：注入/提取/结束检测的实际逻辑在共享纯模块 domChat/* 中，
 * 与独立实时探针、jsdom 回归单测共用同一份实现。
 */
import { contextBridge, ipcRenderer } from 'electron';
import { injectPrompt, observeReply } from './domChat/domChatObserver';
import { readAvailableModels, readLatestReply, setReasoningEffort, setWebSearchEnabled } from './domChat/domChatCore';

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

function sendEvent(event: Omit<DomEvent, 'providerId'>) {
    ipcRenderer.send(DOM_EVENT_CHANNEL, { providerId: PROVIDER_ID, ...event } satisfies DomEvent);
}

let disposeObserver: (() => void) | null = null;

async function injectAndSubmit(prompt: string, requestId: string): Promise<void> {
    console.log('[ChatGPTDomPreload] inject-start', requestId);
    disposeObserver?.();
    disposeObserver = null;

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
    });
}

contextBridge.exposeInMainWorld('__jarvisInjectPrompt', injectAndSubmit);

function readReplyText(): string {
    return readLatestReply(document, PROVIDER);
}

contextBridge.exposeInMainWorld('__jarvisReadReplyText', readReplyText);

async function setWebSearch(enabled: boolean): Promise<void> {
    console.log('[ChatGPTDomPreload] set-web-search', enabled);
    const result = await setWebSearchEnabled(document, PROVIDER, enabled);
    console.log('[ChatGPTDomPreload] set-web-search-result', JSON.stringify(result));
}

contextBridge.exposeInMainWorld('__jarvisSetWebSearch', setWebSearch);

async function getAvailableModels() {
    console.log('[ChatGPTDomPreload] read-available-models');
    const models = await readAvailableModels(document, PROVIDER);
    console.log('[ChatGPTDomPreload] read-available-models-result', JSON.stringify(models));
    return models;
}

contextBridge.exposeInMainWorld('__jarvisReadAvailableModels', getAvailableModels);

async function setReasoningEffortBridge(high: boolean): Promise<{ ok: boolean; note: string }> {
    console.log('[ChatGPTDomPreload] set-reasoning-effort', high);
    const result = await setReasoningEffort(document, PROVIDER, high);
    console.log('[ChatGPTDomPreload] set-reasoning-effort-result', JSON.stringify(result));
    return result;
}

contextBridge.exposeInMainWorld('__jarvisSetReasoningEffort', setReasoningEffortBridge);
