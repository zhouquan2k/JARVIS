import type { ModelOptionDefinition, ProviderModelCatalog } from '@packages/core/config';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate, ReasoningEffort, SendMessageOptions } from '../../../interfaces/IModelProvider';
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
    /**
     * 受控页面是否暴露动态模型选择器（如 Gemini 的模型下拉）。
     * - true（默认）：调用 readAvailableModels()，为空则抛 ModelsNotReadyError（可重试）。
     * - false：跳过动态抓取，直接抛普通 Error，让 runtime 缓存静态兜底并令 loaded=true。
     *   适用于 claude-dom、chatgpt-dom 等不暴露模型选择器的 provider。
     */
    supportsModelPicker?: boolean;
}

export class DomAutomationProvider implements IModelProvider {
    readonly id: string;
    private readonly label: string;
    private readonly transport: DomTransport;
    private readonly modelOptions: ModelOptionDefinition[] | undefined;
    private readonly defaultReasoningEffort: 'low' | 'medium' | 'high' | undefined;
    private readonly supportsModelPicker: boolean;
    private unsubscribe: (() => void) | null = null;

    constructor(options: DomAutomationProviderOptions) {
        this.id = options.id;
        this.label = options.label;
        this.transport = options.transport;
        this.modelOptions = options.modelOptions;
        this.defaultReasoningEffort = options.defaultReasoningEffort;
        this.supportsModelPicker = options.supportsModelPicker ?? true;
    }

    async getAvailableModels(): Promise<ProviderModelCatalog> {
        if (!this.supportsModelPicker) {
            // 该 provider 不暴露动态模型选择器（如 chatgpt-dom）。
            // 抛出普通 Error（非 ModelsNotReadyError），让 runtime 缓存静态兜底目录并设 loaded=true，
            // 避免 UI 永远处于「正在加载模型目录」的等待状态。
            throw new Error(`DOM provider '${this.id}' uses static model catalog (no model picker)`);
        }
        const dynamicModels = await this.transport.readAvailableModels();
        console.log('[DomAutomationProvider]', JSON.stringify({
            stage: 'getAvailableModels-read-done',
            providerId: this.id,
            count: dynamicModels.length,
            modelIds: dynamicModels.map((m) => m.id)
        }));
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

    /**
     * 把模型与推理档位同步到受控页面（sendMessage 与 applyPageDefaults 共用）。
     * - 仅当 modelId 为非 'dom' 的真实模型时切换页面模型（如 Gemini/Claude 的具体模型）。
     * - 推理档位：调用方传入优先，缺省回退 config 的 defaultReasoningEffort，再兜底 high。
     * 各步骤失败仅 warn 不抛，保证不阻塞后续注入/初始化。
     */
    private async syncModelAndReasoning(
        modelId: string | undefined,
        reasoningEffort: ReasoningEffort | undefined,
        requestId: string
    ): Promise<void> {
        if (modelId && modelId !== 'dom') {
            try {
                await this.transport.setModel(modelId);
            } catch (err) {
                console.warn('[DomAutomationProvider]', JSON.stringify({
                    stage: 'set-model-failed',
                    providerId: this.id,
                    requestId,
                    modelId,
                    error: String(err)
                }));
            }
        }

        const effort = reasoningEffort ?? this.defaultReasoningEffort ?? 'high';
        try {
            await this.transport.setReasoningEffort(effort);
        } catch (err) {
            console.warn('[DomAutomationProvider]', JSON.stringify({
                stage: 'set-reasoning-effort-failed',
                providerId: this.id,
                requestId,
                effort,
                error: String(err)
            }));
        }
    }

    /**
     * 初始化时机（切 provider / 改模型档位 / 目录就绪）把默认模型与档位同步到受控页面，
     * 让网页状态即时反映 app 选择，无需等发送消息。reset:false 不打断网页当前对话。
     */
    async applyPageDefaults(options: { modelId?: string; reasoningEffort?: ReasoningEffort }): Promise<void> {
        const requestId = `${this.id}-init-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        console.log('[DomAutomationProvider]', JSON.stringify({
            stage: 'apply-page-defaults',
            providerId: this.id,
            requestId,
            modelId: options.modelId,
            reasoningEffort: options.reasoningEffort
        }));
        try {
            await this.transport.open({ reset: false });
            await this.syncModelAndReasoning(options.modelId, options.reasoningEffort, requestId);
        } catch (err) {
            console.warn('[DomAutomationProvider]', JSON.stringify({
                stage: 'apply-page-defaults-failed',
                providerId: this.id,
                requestId,
                error: String(err)
            }));
        }
    }

    async sendMessage(
        prompt: string,
        options: SendMessageOptions,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        const requestId = `${this.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // 首轮（无历史）开全新 DOM 对话；后续轮复用同一对话持续追问（对齐 openteam）。
        const reset = !(options.history && options.history.length > 0);

        await this.transport.open({ reset });

        // 注入前同步页面模型与推理档位（与 applyPageDefaults 共用同一逻辑）。
        await this.syncModelAndReasoning(options.modelId, options.reasoningEffort, requestId);

        const webSearch = options.modelOptions?.web_search === true;
        await this.transport.setWebSearch(webSearch);

        return new Promise<ProviderSendResult>((resolve, reject) => {
            let resolved = false;
            let accumulatedText = '';
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
                    // DOM 抓取发送的是「完整当前快照」，直接替换而非累加，避免重排/重渲染导致的重复。
                    accumulatedText = event.text;
                    onUpdate({ text: accumulatedText });

                    clearTimeout(stableTimer ?? undefined);
                    stableTimer = setTimeout(() => {}, TEXT_STABLE_WINDOW_MS);
                } else if (event.type === 'done') {
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
