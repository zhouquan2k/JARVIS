import type { ControlledPageCapability, ControlledPageEvent } from '@packages/core';
import type { DomModelInfo } from '../../../preload/domChat/domChatCore';
import type { ReasoningEffort } from '../../../interfaces/IModelProvider';

export interface DomTransportOptions {
    providerId: string;
    targetUrl: string;
    capability: ControlledPageCapability;
    /**
     * 恢复轮是否需要「预热两步导航」：先加载站点首页启动 SPA（激活 Service Worker），再进入会话 URL。
     * 某些 SPA（如 Claude）在全新受控窗口里冷加载深链接 `/chat/<id>` 会白屏，必须先从首页热启动。
     * 默认 false（ChatGPT/Gemini 直连恢复即可）。
     */
    resumeViaWarmBoot?: boolean;
}

export interface DomTransportOpenOptions {
    /**
     * 是否开启全新 DOM 对话。
     * - true（JARVIS 会话首轮）：强制导航到站点首页，开一个空白新对话。
     * - false（后续轮）：复用受控页当前会话（如 /c/<id>），不导航，从而像 openteam 一样在同一对话内持续追问。
     */
    reset?: boolean;
    /**
     * 后续轮恢复用：此前落盘的站点会话 URL。
     * 传入时导航到该 URL（受控页空白或 URL 不同才实际加载），用于重启后回到原对话续聊。
     * 与 reset 互斥；reset 优先。
     */
    resumeUrl?: string;
}

export interface DomTransport {
    open(openOptions?: DomTransportOpenOptions): Promise<void>;
    setWebSearch(enabled: boolean): Promise<void>;
    readFinalText(): Promise<string>;
    injectAndSubmit(prompt: string, requestId: string): Promise<void>;
    subscribe(onEvent: (event: ControlledPageEvent) => void): () => void;
    /** 读取受控页当前 URL（location.href），用于持久化会话 URL 与恢复校验。失败返回空字符串。 */
    readConversationUrl(): Promise<string>;
    /** 打开页面（仅空白时导航）后读取模型选择器中的可用模型列表。失败返回空数组。 */
    readAvailableModels(): Promise<DomModelInfo[]>;
    /** 在页面内切换到指定模型（仅 Gemini）。失败时记录日志但不抛出。 */
    setModel(modelId: string): Promise<void>;
    /** 在页面内切换推理档位（透传真实档位 low/medium/high，各 provider 内部映射）。失败时记录日志但不抛出。 */
    setReasoningEffort(effort: ReasoningEffort): Promise<void>;
}

export function createDomTransport(options: DomTransportOptions): DomTransport {
    const { providerId, targetUrl, capability } = options;
    const resumeViaWarmBoot = options.resumeViaWarmBoot === true;

    // 预热：等待站点 Service Worker 就绪（有界超时），确保后续深链接加载被 SW 正常接管而非白屏。
    const waitForServiceWorkerReady = async (): Promise<void> => {
        await capability.evaluateInPage({
            providerId,
            script: `(async () => {
                try {
                    if (navigator.serviceWorker) {
                        await Promise.race([
                            navigator.serviceWorker.ready,
                            new Promise((resolve) => setTimeout(resolve, 4000))
                        ]);
                    }
                } catch {}
                return true;
            })()`
        });
    };

    return {
        async open(openOptions?: DomTransportOpenOptions) {
            const reset = openOptions?.reset === true;
            const resumeUrl = openOptions?.resumeUrl;
            console.log('[DomTransport]', JSON.stringify({ stage: 'open-controlled-page', providerId, targetUrl, reset, resume: Boolean(resumeUrl), warmBoot: resumeViaWarmBoot }));
            if (reset) {
                // 首轮：强制重载站点首页，确保是一个全新空白对话。
                await capability.openControlledPage({ providerId, targetUrl, forceReload: true });
            } else if (resumeUrl && resumeViaWarmBoot) {
                // 预热恢复轮（如 Claude）：直接冷加载深链接会白屏，需复刻在线路径——
                // 先加载首页启动 SPA + 激活 Service Worker，就绪后再进入会话 URL。
                console.log('[DomTransport]', JSON.stringify({ stage: 'warm-boot-home', providerId, targetUrl }));
                await capability.openControlledPage({ providerId, targetUrl, forceReload: true });
                await waitForServiceWorkerReady();
                console.log('[DomTransport]', JSON.stringify({ stage: 'warm-boot-navigate', providerId, resumeUrl }));
                await capability.openControlledPage({ providerId, targetUrl: resumeUrl });
            } else if (resumeUrl) {
                // 恢复轮：导航回落盘的会话 URL（受控页空白或 URL 不同才实际加载），重启后回到原对话。
                await capability.openControlledPage({ providerId, targetUrl: resumeUrl });
            } else {
                // 后续轮：仅当受控页空白时才加载首页；已有活跃对话（/c/<id>）则保留，不导航。
                await capability.openControlledPage({ providerId, targetUrlIfBlank: targetUrl });
            }
            console.log('[DomTransport]', JSON.stringify({ stage: 'controlled-page-ready', providerId, reset, resume: Boolean(resumeUrl) }));
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

        async readConversationUrl(): Promise<string> {
            try {
                const url = await capability.evaluateInPage<string>({
                    providerId,
                    script: 'location.href'
                });
                const resolved = typeof url === 'string' ? url : '';
                console.log('[DomTransport]', JSON.stringify({ stage: 'read-conversation-url', providerId, url: resolved }));
                return resolved;
            } catch (err) {
                console.warn('[DomTransport]', JSON.stringify({ stage: 'read-conversation-url-failed', providerId, error: String(err) }));
                return '';
            }
        },

        async readAvailableModels(): Promise<DomModelInfo[]> {
            console.log('[DomTransport]', JSON.stringify({ stage: 'read-available-models', providerId }));
            // 仅当受控页为空白时导航，不重置已有会话。
            await capability.openControlledPage({ providerId, targetUrlIfBlank: targetUrl });

            // 主动诊断：复刻 readClaudeModels 的开菜单流程，分别报告
            // 「合成点击 / 原生点击 / 展开 More models」各步骤的菜单项计数与提取出的模型名，
            // 直接在渲染端 DevTools 可见，定位到底卡在哪一步。
            const probeScript = `(async () => {
                const q = (sel) => { try { return document.querySelectorAll(sel).length; } catch { return -1; } };
                const sleep = (ms) => new Promise(r => setTimeout(r, ms));
                const ITEM = '[role="menuitemradio"]';
                const nameOf = (el) => { const f = el.querySelector('.font-ui'); if (!f) return ''; return Array.from(f.childNodes).filter(n=>n.nodeType===3).map(n=>(n.textContent||'').trim()).filter(Boolean).join(''); };
                const names = () => Array.from(document.querySelectorAll(ITEM)).map(nameOf).filter(Boolean);
                const fire = (el) => { const o={bubbles:true,cancelable:true,button:0,pointerId:1,pointerType:'mouse',isPrimary:true}; el.dispatchEvent(new PointerEvent('pointerdown',o)); el.dispatchEvent(new PointerEvent('pointerup',o)); el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0})); };
                const out = { hasBridge: typeof window.__jarvisReadAvailableModels === 'function', href: location.href };
                const trigger = document.querySelector('[data-testid="model-selector-dropdown"]');
                if (!trigger) { out.noTrigger = true; return out; }
                fire(trigger); await sleep(350);
                out.nAfterSynthetic = q(ITEM);
                if (out.nAfterSynthetic === 0 && typeof trigger.click === 'function') { trigger.click(); await sleep(350); out.nAfterNative = q(ITEM); }
                out.namesTopLevel = names();
                const more = Array.from(document.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]')).find(el => /more models|更多模型/i.test(el.textContent||''));
                if (more) { const ho={bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',isPrimary:true}; more.dispatchEvent(new PointerEvent('pointerover',ho)); fire(more); await sleep(350); if (q(ITEM) <= out.namesTopLevel.length && typeof more.click==='function'){ more.click(); await sleep(400);} out.hasMoreModels = true; }
                out.namesAfterExpand = names();
                document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
                document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
                return out;
            })()`;
            const probe = await capability.evaluateInPage<Record<string, unknown>>({ providerId, script: probeScript });
            console.log('[DomTransport]', JSON.stringify({ stage: 'read-available-models-probe', providerId, ...probe }));

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
            if (!result?.ok) {
                throw new Error(result?.note || `set-model failed for ${providerId}:${modelId}`);
            }
        },

        async setReasoningEffort(effort: ReasoningEffort): Promise<void> {
            console.log('[DomTransport]', JSON.stringify({ stage: 'set-reasoning-effort', providerId, effort }));
            const result = await capability.evaluateInPage<{ ok: boolean; note: string }>({
                providerId,
                script: `window.__jarvisSetReasoningEffort?.(${JSON.stringify(effort)})`
            });
            console.log('[DomTransport]', JSON.stringify({ stage: 'set-reasoning-effort-done', providerId, effort, result }));
            if (!result?.ok) {
                throw new Error(result?.note || `set-reasoning-effort failed for ${providerId}:${effort}`);
            }
        }
    };
}
