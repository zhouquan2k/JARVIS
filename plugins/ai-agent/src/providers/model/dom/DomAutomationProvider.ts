import type { ModelOptionDefinition, ProviderModelCatalog } from '@packages/core/config';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate, SendMessageOptions } from '../../../interfaces/IModelProvider';
import type { DomTransport } from './domTransport';

const DOM_PROVIDER_TIMEOUT_MS = 90_000;
const TEXT_STABLE_WINDOW_MS = 2_000;

export const MODELS_NOT_READY_ERROR_NAME = 'ModelsNotReadyError';

/**
 * 受控页尚未渲染出模型选择器（页面刚导航、SPA 未水合、或未登录）时抛出。
 * 调用方应据此「不缓存兜底、下次重试」，而非把单一 'dom' 条目永久锁定。
 */
export function createModelsNotReadyError(providerId: string): Error {
    const error = new Error(`DOM provider '${providerId}' model picker not ready`);
    error.name = MODELS_NOT_READY_ERROR_NAME;
    return error;
}

export function isModelsNotReadyError(error: unknown): error is Error {
    return error instanceof Error && error.name === MODELS_NOT_READY_ERROR_NAME;
}

export interface DomAutomationProviderOptions {
    id: string;
    label: string;
    transport: DomTransport;
    /** 附加到每个模型条目的选项定义（来自静态 config，如 web_search）。 */
    modelOptions?: ModelOptionDefinition[];
    /** 动态模型条目的默认推理档位（来自静态 config 第一个模型的 reasoningEffort）。 */
    defaultReasoningEffort?: 'low' | 'medium' | 'high';
}

export class DomAutomationProvider implements IModelProvider {
    readonly id: string;
    private readonly label: string;
    private readonly transport: DomTransport;
    private readonly modelOptions: ModelOptionDefinition[] | undefined;
    private readonly defaultReasoningEffort: 'low' | 'medium' | 'high' | undefined;
    private unsubscribe: (() => void) | null = null;

    constructor(options: DomAutomationProviderOptions) {
        this.id = options.id;
        this.label = options.label;
        this.transport = options.transport;
        this.modelOptions = options.modelOptions;
        this.defaultReasoningEffort = options.defaultReasoningEffort;
    }

    async getAvailableModels(): Promise<ProviderModelCatalog> {
        const dynamicModels = await this.transport.readAvailableModels();
        if (dynamicModels.length > 0) {
            return {
                models: dynamicModels.map((m) => ({
                    id: m.id,
                    name: m.name,
                    options: this.modelOptions,
                    reasoningEffort: this.defaultReasoningEffort
                })),
                defaultModel: dynamicModels[0].id
            };
        }
        // 空结果 = 受控页模型选择器尚未就绪（页面刚导航 / 未水合 / 未登录）。
        // 抛出可重试错误，让上层「不粘性缓存兜底」，页面就绪后重开即可读到真实模型。
        console.warn('[DomAutomationProvider]', JSON.stringify({
            stage: 'getAvailableModels-not-ready',
            providerId: this.id
        }));
        throw createModelsNotReadyError(this.id);
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async sendMessage(
        prompt: string,
        options: SendMessageOptions,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        const requestId = `${this.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // 首轮（无历史）开全新 DOM 对话；后续轮复用同一对话持续追问（对齐 openteam）。
        const reset = !(options.history && options.history.length > 0);

        console.log('[DomAutomationProvider]', JSON.stringify({ stage: 'send-start', providerId: this.id, requestId }));
        console.log('[DomAutomationProvider]', JSON.stringify({ stage: 'session-mode', providerId: this.id, requestId, mode: reset ? 'reset' : 'continue' }));

        await this.transport.open({ reset });

        // 若用户选择了非 'dom' 的真实模型（仅 Gemini），在注入前切换页面模型。
        const requestedModelId = options.modelId;
        if (requestedModelId && requestedModelId !== 'dom') {
            console.log('[DomAutomationProvider]', JSON.stringify({ stage: 'set-model', providerId: this.id, requestId, modelId: requestedModelId }));
            try {
                await this.transport.setModel(requestedModelId);
            } catch (err) {
                console.warn('[DomAutomationProvider]', JSON.stringify({
                    stage: 'set-model-failed',
                    providerId: this.id,
                    requestId,
                    modelId: requestedModelId,
                    error: String(err)
                }));
            }
        }

        // 推理档位切换（chatgpt: Thinking/Instant；gemini: 扩展/标准）。
        // undefined → 兜底为 high（与 config reasoningEffort:'high' 一致）。
        const high = options.reasoningEffort == null || options.reasoningEffort === 'high';
        console.log('[DomAutomationProvider]', JSON.stringify({ stage: 'set-reasoning-effort', providerId: this.id, requestId, high }));
        try {
            await this.transport.setReasoningEffort(high);
        } catch (err) {
            console.warn('[DomAutomationProvider]', JSON.stringify({
                stage: 'set-reasoning-effort-failed',
                providerId: this.id,
                requestId,
                high,
                error: String(err)
            }));
        }

        const webSearch = options.modelOptions?.web_search === true;
        console.log('[DomAutomationProvider]', JSON.stringify({ stage: 'web-search-set', providerId: this.id, requestId, enabled: webSearch }));
        await this.transport.setWebSearch(webSearch);

        return new Promise<ProviderSendResult>((resolve, reject) => {
            let resolved = false;
            let accumulatedText = '';
            let firstChunkReceived = false;
            let stableTimer: ReturnType<typeof setTimeout> | null = null;
            let globalTimeout: ReturnType<typeof setTimeout> | null = null;
            let fallbackInFlight = false;

            const finish = (text: string) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(stableTimer ?? undefined);
                clearTimeout(globalTimeout ?? undefined);
                this.unsubscribe?.();
                this.unsubscribe = null;
                console.log('[DomAutomationProvider]', JSON.stringify({
                    stage: 'done',
                    providerId: this.id,
                    requestId,
                    textLength: text.length
                }));
                resolve({
                    text,
                    conversationId: this.id,
                    messageId: requestId
                });
            };

            const runFallbackRead = async (stage: 'timeout-fallback' | 'error-fallback', errorMessage?: string) => {
                if (resolved || fallbackInFlight) return;
                fallbackInFlight = true;
                clearTimeout(stableTimer ?? undefined);
                clearTimeout(globalTimeout ?? undefined);
                this.unsubscribe?.();
                this.unsubscribe = null;
                console.warn('[DomAutomationProvider]', JSON.stringify({
                    stage,
                    providerId: this.id,
                    requestId,
                    message: errorMessage
                }));
                try {
                    const finalText = await this.transport.readFinalText();
                    finish(finalText || accumulatedText);
                } catch (fallbackError) {
                    if (!resolved) {
                        resolved = true;
                        reject(fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)));
                    }
                } finally {
                    fallbackInFlight = false;
                }
            };

            const onTimeout = async () => {
                await runFallbackRead('timeout-fallback');
            };

            globalTimeout = setTimeout(onTimeout, DOM_PROVIDER_TIMEOUT_MS);

            this.unsubscribe = this.transport.subscribe((event) => {
                if (event.requestId !== requestId) return;

                if (event.type === 'chunk' && event.text) {
                    if (!firstChunkReceived) {
                        firstChunkReceived = true;
                        console.log('[DomAutomationProvider]', JSON.stringify({
                            stage: 'first-chunk',
                            providerId: this.id,
                            requestId
                        }));
                    }
                    // DOM 抓取发送的是「完整当前快照」，直接替换而非累加，避免重排/重渲染导致的重复。
                    accumulatedText = event.text;
                    onUpdate({ text: accumulatedText });

                    clearTimeout(stableTimer ?? undefined);
                    stableTimer = setTimeout(() => {
                        console.log('[DomAutomationProvider]', JSON.stringify({
                            stage: 'text-stable-window-hit',
                            providerId: this.id,
                            requestId
                        }));
                    }, TEXT_STABLE_WINDOW_MS);
                } else if (event.type === 'done') {
                    console.log('[DomAutomationProvider]', JSON.stringify({
                        stage: 'end-detection-done',
                        providerId: this.id,
                        requestId
                    }));
                    finish(event.text ?? accumulatedText);
                } else if (event.type === 'error') {
                    console.error('[DomAutomationProvider]', JSON.stringify({
                        stage: 'error',
                        providerId: this.id,
                        requestId,
                        message: event.message
                    }));
                    void runFallbackRead('error-fallback', event.message ?? 'DOM provider error');
                }
            });

            console.log('[DomAutomationProvider]', JSON.stringify({ stage: 'requestId-bound', providerId: this.id, requestId }));

            this.transport.injectAndSubmit(prompt, requestId).catch((err: unknown) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(stableTimer ?? undefined);
                    clearTimeout(globalTimeout ?? undefined);
                    this.unsubscribe?.();
                    this.unsubscribe = null;
                    reject(err);
                }
            });
        });
    }

    abort(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }
}
