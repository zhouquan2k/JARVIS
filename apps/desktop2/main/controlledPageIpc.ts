import { BrowserWindow, ipcMain, type IpcMain, type WebContents } from 'electron';
import {
    DESKTOP_CONTROLLED_PAGE_DOM_EVENT_FROM_PAGE_CHANNEL,
    DESKTOP_CONTROLLED_PAGE_DOM_EVENT_TO_RENDERER_CHANNEL,
    DESKTOP_CONTROLLED_PAGE_EVALUATE_CHANNEL,
    DESKTOP_CONTROLLED_PAGE_OPEN_CHANNEL,
    type ControlledPageDomEvent,
    type EvaluateInControlledPageRequest,
    type OpenControlledPageRequest
} from '../shared/controlledPageBridge';
import type { ControlledPageManager } from './controlledPageManager';

const consoleForwardedPages = new WeakSet<WebContents>();

function summarizeEvaluateResult(result: unknown): Record<string, unknown> {
    if (typeof result !== 'object' || result === null) {
        return { type: typeof result };
    }

    const record = result as Record<string, unknown>;
    const summary: Record<string, unknown> = {
        type: 'object',
        ok: 'ok' in record ? record.ok : undefined,
        code: 'code' in record ? record.code : undefined,
        message: 'message' in record ? record.message : undefined
    };

    if (Array.isArray(record.data)) {
        summary.dataLength = record.data.length;
    } else if ('data' in record) {
        summary.dataType = typeof record.data;
    }

    return summary;
}

function forwardControlledPageConsole(page: WebContents, providerId: string): void {
    if (typeof page.on !== 'function' || consoleForwardedPages.has(page)) {
        return;
    }

    consoleForwardedPages.add(page);
    page.on('console-message', (_event, level, message, line, sourceId) => {
        if (!message.includes('[ChatPrism][GeminiHistory]')) {
            return;
        }

        console.log('[ControlledPageWindow]', message, JSON.stringify({
            providerId,
            level,
            line,
            sourceId,
            url: page.getURL()
        }));
    });
}

export function registerControlledPageIpc(options: {
    controlledPageManager: ControlledPageManager;
    /**
     * providerId → preload 文件路径的映射。capability 层只做路由，不内置业务知识。
     * 由调用方（main/index.ts）在初始化时配置，例如 `{ 'gemini-web': geminiHistoryPreloadPath }`。
     */
    preloadRegistry?: Record<string, string>;
    ipc?: Pick<IpcMain, 'handle' | 'removeHandler'>;
}) {
    const ipc = options.ipc ?? ipcMain;

    function resolvePreloadPath(providerId: string): string | undefined {
        return options.preloadRegistry?.[providerId];
    }

    ipc.handle(DESKTOP_CONTROLLED_PAGE_OPEN_CHANNEL, async (_event, request: OpenControlledPageRequest) => {
        console.log('[ControlledPageIpc]', JSON.stringify({
            stage: 'open-request',
            providerId: request.providerId,
            targetUrl: request.targetUrl,
            visible: request.visible === true,
            forceReload: request.forceReload === true
        }));
        const page = await options.controlledPageManager.ensurePage(request.providerId, {
            targetUrl: request.targetUrl,
            targetUrlIfBlank: request.targetUrlIfBlank,
            visible: request.visible,
            forceReload: request.forceReload,
            preloadPath: resolvePreloadPath(request.providerId)
        });
        forwardControlledPageConsole(page, request.providerId);
        console.log('[ControlledPageIpc]', JSON.stringify({
            stage: 'open-page-ready',
            providerId: request.providerId,
            targetUrl: request.targetUrl,
            finalUrl: page.getURL()
        }));
    });

    ipc.handle(DESKTOP_CONTROLLED_PAGE_EVALUATE_CHANNEL, async (_event, request: EvaluateInControlledPageRequest) => {
        console.log('[ControlledPageIpc]', JSON.stringify({
            stage: 'evaluate-request',
            providerId: request.providerId,
            targetUrl: request.targetUrl,
            visible: request.visible === true,
            forceReload: request.forceReload === true
        }));
        const page = await options.controlledPageManager.ensurePage(request.providerId, {
            targetUrl: request.targetUrl,
            visible: request.visible,
            forceReload: request.forceReload,
            preloadPath: resolvePreloadPath(request.providerId)
        });
        forwardControlledPageConsole(page, request.providerId);
        console.log('[ControlledPageIpc]', JSON.stringify({
            stage: 'evaluate-page-ready',
            providerId: request.providerId,
            targetUrl: request.targetUrl,
            finalUrl: page.getURL()
        }));

        try {
            const result = await page.executeJavaScript(request.script, true);
            console.log('[ControlledPageIpc]', JSON.stringify({
                stage: 'evaluate-result',
                providerId: request.providerId,
                finalUrl: page.getURL(),
                result: summarizeEvaluateResult(result)
            }));
            return result;
        } catch (error) {
            console.error('[ControlledPageIpc]', JSON.stringify({
                stage: 'evaluate-error',
                providerId: request.providerId,
                finalUrl: page.getURL(),
                message: error instanceof Error ? error.message : String(error)
            }), error instanceof Error ? error.stack : undefined);
            throw error;
        }
    });

    const domEventHandler = (_event: Electron.IpcMainEvent, payload: ControlledPageDomEvent) => {
        console.log('[ControlledPageIpc]', JSON.stringify({
            stage: payload.type === 'chunk' ? 'dom-event-chunk' : `dom-event-${payload.type}`,
            providerId: payload.providerId,
            requestId: payload.requestId,
            textLength: payload.text?.length ?? 0
        }));
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(DESKTOP_CONTROLLED_PAGE_DOM_EVENT_TO_RENDERER_CHANNEL, payload);
            }
        }
    };

    ipcMain.on(DESKTOP_CONTROLLED_PAGE_DOM_EVENT_FROM_PAGE_CHANNEL, domEventHandler);

    return () => {
        ipcMain.off(DESKTOP_CONTROLLED_PAGE_DOM_EVENT_FROM_PAGE_CHANNEL, domEventHandler);
        ipc.removeHandler?.(DESKTOP_CONTROLLED_PAGE_OPEN_CHANNEL);
        ipc.removeHandler?.(DESKTOP_CONTROLLED_PAGE_EVALUATE_CHANNEL);
    };
}
