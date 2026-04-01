import { DEFAULT_GEMINI_HISTORY_PAGE_URL } from '@packages/core/config';
import {
    assertGeminiContentResponse,
    type GeminiContentConversationDetail,
    type GeminiContentHistorySummary,
    type GeminiContentRequest,
    type GeminiHistoryBridge,
    type GeminiHistoryRemoteConfig
} from '@packages/core/src';
import type { ControlledPageManager } from './controlledPageManager';

const GEMINI_BRIDGE_GLOBAL = 'chatprismGeminiHistory';

function getTargetUrl(pageUrl: string, externalId?: string): string {
    return externalId ? `${pageUrl.replace(/\/$/, '')}/${externalId}` : pageUrl;
}

export class GeminiHistoryPageBridge implements GeminiHistoryBridge {
    private readonly pageUrl: string;

    constructor(private readonly options: {
        controlledPageManager: ControlledPageManager;
        preloadPath: string;
        pageUrl?: string;
    }) {
        this.pageUrl = options.pageUrl ?? DEFAULT_GEMINI_HISTORY_PAGE_URL;
    }

    async getHistoryList(config: GeminiHistoryRemoteConfig): Promise<GeminiContentHistorySummary[]> {
        const response = await this.sendRequest({
            action: 'GET_HISTORY_LIST',
            config
        }, undefined, 'history_load');
        return assertGeminiContentResponse<GeminiContentHistorySummary[]>(response);
    }

    async probeHistoryListReady(
        config: GeminiHistoryRemoteConfig,
        options: { forceReload?: boolean } = {}
    ): Promise<boolean> {
        const response = await this.sendRequest({
            action: 'GET_HISTORY_LIST',
            config
        }, undefined, 'auth_probe', {
            forceReload: options.forceReload === true
        });

        return typeof response === 'object'
            && response !== null
            && 'ok' in response
            && (response as { ok?: unknown }).ok === true;
    }

    async getHistoryDetail(
        config: GeminiHistoryRemoteConfig,
        externalId: string
    ): Promise<GeminiContentConversationDetail> {
        const response = await this.sendRequest({
            action: 'GET_HISTORY_DETAIL',
            config,
            externalId
        }, externalId, 'detail_load');
        return assertGeminiContentResponse<GeminiContentConversationDetail>(response);
    }

    private async sendRequest(
        request: GeminiContentRequest,
        externalId?: string,
        source: 'history_load' | 'auth_probe' | 'detail_load' = request.action === 'GET_HISTORY_DETAIL' ? 'detail_load' : 'history_load',
        options: { forceReload?: boolean } = {}
    ) {
        const targetUrl = getTargetUrl(this.pageUrl, externalId);
        const page = await this.options.controlledPageManager.ensurePage('gemini-web', {
            targetUrl,
            visible: false,
            preloadPath: this.options.preloadPath,
            forceReload: options.forceReload === true || source === 'history_load'
        });
        const requestJson = JSON.stringify(request);

        const response = await page.executeJavaScript(`
            (() => {
                const bridge = window.${GEMINI_BRIDGE_GLOBAL};
                if (!bridge || typeof bridge.request !== 'function') {
                    throw new Error('Gemini history preload bridge is unavailable');
                }

                return bridge.request(${requestJson});
            })()
        `, true);
        return response;
    }
}
