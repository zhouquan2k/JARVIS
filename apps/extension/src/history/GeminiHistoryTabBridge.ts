/// <reference types="chrome"/>
import { ExternalHistoryError, resolveGeminiHistoryRuntimeConfig, type GeminiHistoryRemoteConfig } from '@packages/core/src';
import {
    assertGeminiContentResponse,
    type GeminiContentConversationDetail,
    type GeminiContentHistorySummary,
    type GeminiContentRequest,
    type GeminiContentResponse
} from './geminiContentProtocol';

type AppEnv = Record<string, string | undefined>;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTabUrl(baseUrl: string, externalId?: string): string {
    return externalId ? `${baseUrl}/${externalId}` : baseUrl;
}

export class GeminiHistoryTabBridge {
    private tabId: number | null = null;
    private readonly pageOrigin: string;
    private readonly pageUrl: string;
    private hasTriedManualInjection = false;

    constructor(options: { env?: AppEnv } = {}) {
        const runtimeConfig = resolveGeminiHistoryRuntimeConfig({ env: options.env });
        this.pageOrigin = runtimeConfig.pageOrigin;
        this.pageUrl = runtimeConfig.pageUrl;
    }

    async getHistoryList(config: GeminiHistoryRemoteConfig): Promise<GeminiContentHistorySummary[]> {
        const tabId = await this.ensureTab();
        await this.waitForContentScriptReady(tabId);
        const response = await this.sendRequest(tabId, {
            action: 'GET_HISTORY_LIST',
            config
        });
        return assertGeminiContentResponse<GeminiContentHistorySummary[]>(response);
    }

    async getHistoryDetail(config: GeminiHistoryRemoteConfig, externalId: string): Promise<GeminiContentConversationDetail> {
        const tabId = await this.ensureTab(externalId);
        await this.waitForContentScriptReady(tabId);
        const response = await this.sendRequest(tabId, {
            action: 'GET_HISTORY_DETAIL',
            config,
            externalId
        });
        return assertGeminiContentResponse<GeminiContentConversationDetail>(response);
    }

    private async ensureTab(externalId?: string): Promise<number> {
        const targetUrl = normalizeTabUrl(this.pageUrl, externalId);
        const tab = await this.getExistingTab() ?? await this.findOpenGeminiTab();

        if (!tab) {
            const createdTab = await chrome.tabs.create({
                url: targetUrl,
                active: false
            });
            if (!createdTab.id) {
                throw new ExternalHistoryError('TAB_UNAVAILABLE', '无法创建 Gemini 后台标签页。', {
                    providerId: 'gemini-web'
                });
            }
            this.tabId = createdTab.id;
            await this.waitForTabComplete(createdTab.id);
            return createdTab.id;
        }

        if (tab.id === undefined) {
            throw new ExternalHistoryError('TAB_UNAVAILABLE', 'Gemini 标签页状态异常。', {
                providerId: 'gemini-web'
            });
        }

        this.tabId = tab.id;
        if (externalId && (!tab.url || !tab.url.startsWith(targetUrl))) {
            await chrome.tabs.update(tab.id, {
                url: targetUrl,
                active: false
            });
            await this.waitForTabComplete(tab.id);
        }

        return tab.id;
    }

    private async findOpenGeminiTab(): Promise<chrome.tabs.Tab | null> {
        const tabs = await chrome.tabs.query({
            url: [`${this.pageOrigin}/*`]
        });

        if (tabs.length === 0) {
            return null;
        }

        return tabs.find((tab) => tab.active) || tabs[0] || null;
    }

    private async getExistingTab(): Promise<chrome.tabs.Tab | null> {
        if (this.tabId === null) {
            return null;
        }

        try {
            return await chrome.tabs.get(this.tabId);
        } catch {
            this.tabId = null;
            return null;
        }
    }

    private async inspectTabContext(tabId: number): Promise<void> {
        const tab = await chrome.tabs.get(tabId);
        const currentUrl = tab.url || '';

        if (!currentUrl) {
            return;
        }

        if (currentUrl.startsWith(this.pageOrigin)) {
            return;
        }

        if (/accounts\.google\.com|ServiceLogin/i.test(currentUrl)) {
            throw new ExternalHistoryError('AUTH_REQUIRED', 'Gemini 标签页跳转到了登录页，请先完成登录后再重试。', {
                providerId: 'gemini-web'
            });
        }

        throw new ExternalHistoryError('TAB_UNAVAILABLE', `Gemini 标签页当前不在可抓取页面：${currentUrl}`, {
            providerId: 'gemini-web'
        });
    }

    private async ensureContentScriptInjected(tabId: number): Promise<void> {
        if (typeof chrome.scripting?.executeScript !== 'function' || this.hasTriedManualInjection) {
            return;
        }

        this.hasTriedManualInjection = true;
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-scripts/gemini-history.js']
        });
        await sleep(300);
    }

    private async waitForTabComplete(tabId: number): Promise<void> {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
            await sleep(800);
            return;
        }

        await new Promise<void>((resolve) => {
            const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
                if (updatedTabId === tabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });

        await sleep(800);
    }

    private async waitForContentScriptReady(tabId: number): Promise<void> {
        for (let attempt = 0; attempt < 12; attempt += 1) {
            try {
                const response = await chrome.tabs.sendMessage(tabId, {
                    action: 'PING'
                });
                const result = assertGeminiContentResponse<{ ready: true }>(response as GeminiContentResponse);
                if (result.ready) {
                    this.hasTriedManualInjection = false;
                    return;
                }
            } catch {
                await this.inspectTabContext(tabId);
                await this.ensureContentScriptInjected(tabId);
            }

            await sleep(500);
        }

        throw new ExternalHistoryError('TAB_UNAVAILABLE', 'Gemini 内容脚本未就绪，请等待页面加载完成后重试。', {
            providerId: 'gemini-web'
        });
    }

    private async sendRequest(tabId: number, request: GeminiContentRequest): Promise<GeminiContentResponse> {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
                const response = await chrome.tabs.sendMessage(tabId, request) as GeminiContentResponse;
                if (response) {
                    return response;
                }
            } catch (error) {
                if (attempt === 3) {
                    throw new ExternalHistoryError('TAB_UNAVAILABLE', 'Gemini 内容脚本未就绪。', {
                        providerId: 'gemini-web',
                        cause: error
                    });
                }
            }

            await sleep(300);
        }

        throw new ExternalHistoryError('TAB_UNAVAILABLE', 'Gemini 内容脚本未响应。', {
            providerId: 'gemini-web'
        });
    }
}
