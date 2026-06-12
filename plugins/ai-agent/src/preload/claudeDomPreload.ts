/**
 * Claude DOM preload — injected into the hidden claude.ai BrowserWindow.
 * Exposes `window.__jarvisInjectPrompt(prompt, requestId)` to the main world.
 *
 * 仅做 electron 桥接：注入/提取/结束检测的实际逻辑在共享纯模块 domChat/* 中，
 * 与独立实时探针、jsdom 回归单测共用同一份实现。
 *
 * claude.ai DOM 选择器已经浏览器实探验证（2026-06）。
 */
import { contextBridge, ipcRenderer } from 'electron';
import { injectPrompt, observeReply } from './domChat/domChatObserver';
import { readAvailableModels, readLatestReply, setActiveModel, setReasoningEffort, type ReasoningEffort } from './domChat/domChatCore';

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

function sendEvent(event: Omit<DomEvent, 'providerId'>) {
    ipcRenderer.send(DOM_EVENT_CHANNEL, { providerId: PROVIDER_ID, ...event } satisfies DomEvent);
}

let disposeObserver: (() => void) | null = null;

async function injectAndSubmit(prompt: string, requestId: string): Promise<void> {
    console.log('[ClaudeDomPreload] inject-start', requestId);
    disposeObserver?.();
    disposeObserver = null;

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
            sendEvent({ requestId, type: 'done', text });
        }
    });
}

contextBridge.exposeInMainWorld('__jarvisInjectPrompt', injectAndSubmit);

function readReplyText(): string {
    return readLatestReply(document, PROVIDER);
}

contextBridge.exposeInMainWorld('__jarvisReadReplyText', readReplyText);

async function getAvailableModels() {
    console.log('[ClaudeDomPreload] read-available-models');
    const models = await readAvailableModels(document, PROVIDER);
    console.log('[ClaudeDomPreload] read-available-models-result', JSON.stringify(models));
    return models;
}

contextBridge.exposeInMainWorld('__jarvisReadAvailableModels', getAvailableModels);

async function setReasoningEffortBridge(effort: ReasoningEffort): Promise<{ ok: boolean; note: string }> {
    console.log('[ClaudeDomPreload] set-reasoning-effort', effort);
    const result = await setReasoningEffort(document, PROVIDER, effort);
    console.log('[ClaudeDomPreload] set-reasoning-effort-result', JSON.stringify(result));
    return result;
}

contextBridge.exposeInMainWorld('__jarvisSetReasoningEffort', setReasoningEffortBridge);

async function setModelBridge(modelId: string): Promise<{ ok: boolean; note: string }> {
    console.log('[ClaudeDomPreload] set-model', modelId);
    const result = await setActiveModel(document, PROVIDER, modelId);
    console.log('[ClaudeDomPreload] set-model-result', JSON.stringify(result));
    return result;
}

contextBridge.exposeInMainWorld('__jarvisSetModel', setModelBridge);
