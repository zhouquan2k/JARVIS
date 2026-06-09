import type { ControlledPageCapability, ControlledPageEvent } from '@packages/core/src/interfaces/ControlledPageCapability';
import type { DomModelInfo } from '../../../preload/domChat/domChatCore';

export interface DomTransportOptions {
    providerId: string;
    targetUrl: string;
    capability: ControlledPageCapability;
}

export interface DomTransportOpenOptions {
    /**
     * 是否开启全新 DOM 对话。
     * - true（JARVIS 会话首轮）：强制导航到站点首页，开一个空白新对话。
     * - false（后续轮）：复用受控页当前会话（如 /c/<id>），不导航，从而像 openteam 一样在同一对话内持续追问。
     */
    reset?: boolean;
}

export interface DomTransport {
    open(openOptions?: DomTransportOpenOptions): Promise<void>;
    setWebSearch(enabled: boolean): Promise<void>;
    readFinalText(): Promise<string>;
    injectAndSubmit(prompt: string, requestId: string): Promise<void>;
    subscribe(onEvent: (event: ControlledPageEvent) => void): () => void;
    /** 打开页面（仅空白时导航）后读取模型选择器中的可用模型列表。失败返回空数组。 */
    readAvailableModels(): Promise<DomModelInfo[]>;
    /** 在页面内切换到指定模型（仅 Gemini）。失败时记录日志但不抛出。 */
    setModel(modelId: string): Promise<void>;
    /** 在页面内切换推理档位（high=true → ChatGPT Thinking / Gemini 扩展）。失败时记录日志但不抛出。 */
    setReasoningEffort(high: boolean): Promise<void>;
}

export function createDomTransport(options: DomTransportOptions): DomTransport {
    const { providerId, targetUrl, capability } = options;

    return {
        async open(openOptions?: DomTransportOpenOptions) {
            const reset = openOptions?.reset === true;
            console.log('[DomTransport]', JSON.stringify({ stage: 'open-controlled-page', providerId, targetUrl, reset }));
            if (reset) {
                // 首轮：强制重载站点首页，确保是一个全新空白对话。
                await capability.openControlledPage({ providerId, targetUrl, forceReload: true });
            } else {
                // 后续轮：仅当受控页空白时才加载首页；已有活跃对话（/c/<id>）则保留，不导航。
                await capability.openControlledPage({ providerId, targetUrlIfBlank: targetUrl });
            }
            console.log('[DomTransport]', JSON.stringify({ stage: 'controlled-page-ready', providerId, reset }));
        },

        async setWebSearch(enabled: boolean) {
            console.log('[DomTransport]', JSON.stringify({ stage: 'set-web-search', providerId, enabled }));
            await capability.evaluateInPage({
                providerId,
                script: `window.__jarvisSetWebSearch?.(${enabled})`
            });
            console.log('[DomTransport]', JSON.stringify({ stage: 'set-web-search-done', providerId, enabled }));
        },

        async readFinalText() {
            console.log('[DomTransport]', JSON.stringify({ stage: 'read-final-text', providerId }));
            const text = await capability.evaluateInPage<string>({
                providerId,
                script: 'window.__jarvisReadReplyText?.() ?? ""'
            });
            console.log('[DomTransport]', JSON.stringify({ stage: 'read-final-text-done', providerId, textLength: text.length }));
            return text;
        },

        async injectAndSubmit(prompt: string, requestId: string) {
            console.log('[DomTransport]', JSON.stringify({ stage: 'inject-and-submit', providerId, requestId }));
            // 不传 targetUrl：注入步骤只复用 open() 已就绪的受控页，绝不触发导航/重载，避免打断当前对话。
            await capability.evaluateInPage({
                providerId,
                script: `window.__jarvisInjectPrompt?.(${JSON.stringify(prompt)}, ${JSON.stringify(requestId)})`
            });
            console.log('[DomTransport]', JSON.stringify({ stage: 'inject-success', providerId, requestId }));
        },

        subscribe(onEvent: (event: ControlledPageEvent) => void): () => void {
            return capability.subscribeControlledPageEvent(providerId, onEvent);
        },

        async readAvailableModels(): Promise<DomModelInfo[]> {
            console.log('[DomTransport]', JSON.stringify({ stage: 'read-available-models', providerId }));
            // 仅当受控页为空白时导航，不重置已有会话。
            await capability.openControlledPage({ providerId, targetUrlIfBlank: targetUrl });
            const raw = await capability.evaluateInPage<DomModelInfo[] | null>({
                providerId,
                script: 'window.__jarvisReadAvailableModels?.() ?? []'
            });
            const models: DomModelInfo[] = Array.isArray(raw) ? raw : [];
            console.log('[DomTransport]', JSON.stringify({ stage: 'read-available-models-done', providerId, count: models.length }));
            return models;
        },

        async setModel(modelId: string): Promise<void> {
            console.log('[DomTransport]', JSON.stringify({ stage: 'set-model', providerId, modelId }));
            const result = await capability.evaluateInPage<{ ok: boolean; note: string }>({
                providerId,
                script: `window.__jarvisSetModel?.(${JSON.stringify(modelId)})`
            });
            console.log('[DomTransport]', JSON.stringify({ stage: 'set-model-done', providerId, modelId, result }));
        },

        async setReasoningEffort(high: boolean): Promise<void> {
            console.log('[DomTransport]', JSON.stringify({ stage: 'set-reasoning-effort', providerId, high }));
            const result = await capability.evaluateInPage<{ ok: boolean; note: string }>({
                providerId,
                script: `window.__jarvisSetReasoningEffort?.(${high})`
            });
            console.log('[DomTransport]', JSON.stringify({ stage: 'set-reasoning-effort-done', providerId, high, result }));
        }
    };
}
