## Context

当前仓库已经形成稳定的三层结构：

- `packages/core` 负责 provider、runtime、分析器和存储抽象
- `packages/ui` 负责共享工作区与状态装配
- `apps/web`、`apps/extension` 负责不同宿主下的入口与依赖注入

其中 extension 模式已经验证了一条关键架构边界：

`UI -> Proxy -> Background -> Real Provider`

这条链路让 UI 层不直接接触浏览器权限、Cookie、跨域请求和页面桥接逻辑。桌面模式的设计目标不是复刻浏览器扩展 API，而是在 Electron 中复用这条边界，把 `Background` 替换为 `Electron host(main)`。

约束如下：

- 文档与实现都需要保持中文语境
- 桌面端应优先支持当前 extension 中可运行的 provider，尤其是 `chatgpt-web`
- 后续还要为 `gemini-web` 这类依赖受控页面的能力预留宿主接口
- 尽量复用现有 `packages/ui` 与 `packages/core`，避免把桌面实现写成第三套产品逻辑

## Goals / Non-Goals

**Goals:**

- 新增 `runtimeMode = 'desktop'`，让桌面宿主进入统一 runtime 装配体系。
- 新增 `apps/desktop`，复用共享工作区并承接桌面特有的 IPC、Session 和受控页面管理。
- 让桌面 renderer 通过代理 provider 与 host 通信，保持与 extension proxy 一致的请求/流式/中止模型。
- 重构 `ChatGPTWebProvider` 的宿主依赖，使其可以在 Electron host 中复用。
- 在 `chatgpt-web` 未登录时向用户暴露明确的登录入口，并通过 host 打开绑定持久化 Session 的 ChatGPT 登录窗口。
- 为未来接入 `gemini-web` 这类 DOM 型 provider 预留 controlled-page executor。

**Non-Goals:**

- 本阶段不要求一次性完成所有 provider 的桌面适配。
- 本阶段不要求桌面端直接加载现有 MV3 扩展。
- 本阶段不要求把本地存储立即迁移到 SQLite 或新增完整数据库层。
- 本阶段不要求定义桌面端自动更新、安装包签名和发布流水线。

## Decisions

### 决策 1：新增独立宿主 `apps/desktop`，不把桌面逻辑混入 `apps/web` 或 `apps/extension`

原因：

- 当前 `web` 与 `extension` 的差异主要是宿主装配层，桌面端也属于同一层次的问题。
- 单独的 `apps/desktop` 更符合现有仓库结构，便于复用 UI，又不会污染现有宿主入口。

替代方案：

- 方案 A：在 `apps/web` 内用条件分支兼容 Electron。缺点是 renderer 逻辑会被宿主分支污染，测试与构建边界会变差。
- 方案 B：尝试直接运行浏览器扩展。缺点是 Electron 对 Chrome Extension API 支持不完整，后续维护风险高。

涉及文件：

- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/package.json`
- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/main.ts`
- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/App.vue`

变更描述：

- 建立 Electron renderer 入口，复用共享工作区和桌面版 runtime 装配。

### 决策 2：把桌面宿主实现为 `UI -> DesktopProxy -> IPC -> Host -> Real Provider`

原因：

- 这与 extension 已验证的代理模式一致，UI 层无需感知宿主差异。
- streaming、abort、错误回传都可以沿用现有 proxyProtocol 的形状或仅做最小变体。

替代方案：

- 方案 A：在 renderer 直接实例化真实 provider。缺点是会把 Cookie、网络和宿主权限暴露到前端，且不利于接入受控页面型 provider。
- 方案 B：用单向命令式 IPC，不保留请求关联标识。缺点是并发对话、对比模式和历史查询会相互干扰。

涉及文件：

- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/providerRuntime.ts`
- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/utils/DesktopProxyProvider.ts`
- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/utils/DesktopHistoryProxy.ts`
- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/utils/proxyProtocol.ts`
- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/providerHost.ts`

建议方法签名：

```ts
export function createDesktopProxyRuntime(): ProviderRuntime
```

```ts
export class DesktopProxyProvider implements IModelProvider
```

```ts
export class DesktopHistoryProxy implements IHistoryProvider
```

```ts
export function registerProviderHostIpc(): void
```

变更描述：

- renderer 负责发送带 `requestId/channelId` 的请求。
- main 负责解析 providerId、创建真实 provider、推送增量、完成回包和 abort。

### 决策 3：在 core 中新增 `runtimeMode = 'desktop'`

原因：

- provider 可见性和实例创建策略已经由 runtimeMode 驱动，桌面模式应复用现有机制。
- 如果不把 `desktop` 纳入 runtimeMode，桌面宿主就会演变成旁路装配逻辑，后续维护成本高。

替代方案：

- 方案 A：桌面端自己维护一套 provider 白名单。缺点是会与 `APP_CONFIG`、provider selector 和现有 runtime 逻辑分叉。

涉及文件：

- 修改 `/Users/quanzhou/Workspace/ChatPrism/packages/core/config.ts`
- 修改 `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/types.ts`
- 修改 `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createProviderRuntime.ts`
- 修改 `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createProviderRuntime.test.ts`

建议签名变化：

```ts
export type RuntimeMode = 'extension' | 'web' | 'desktop';
```

变更描述：

- 扩展 provider 的 `supportedRuntimeModes`
- 保持 `createProviderRuntime(options)` 的调用方式不变，只扩大可接受的 runtimeMode 集合

### 决策 4：将 `ChatGPTWebProvider` 的宿主能力改为依赖注入

原因：

- 当前实现内部直接使用 `fetch` 和 `chrome.cookies`，在 Electron host 中无法直接复用。
- 该 provider 本质依赖的是“请求能力 + Cookie 读取能力 + 可选 User-Agent”，不需要绑定特定宿主 API。

替代方案：

- 方案 A：复制一份 `ElectronChatGPTProvider`。缺点是逻辑分叉，后续模型目录、SSE 解析和注解标准化需要重复维护。
- 方案 B：在 provider 内继续通过 `typeof chrome !== 'undefined'` 做更多宿主判断。缺点是会让 provider 越来越难测试和维护。

涉及文件：

- 修改 `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/ChatGPTWebProvider.ts`
- 可新增 `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/providerHostTypes.ts`

建议签名变化：

```ts
export interface ProviderRequestClient {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
```

```ts
export interface ProviderCookieStore {
  get(options: { url: string; name: string }): Promise<{ value?: string } | null>;
}
```

```ts
constructor(options?: {
  requestClient?: ProviderRequestClient;
  cookieStore?: ProviderCookieStore;
  userAgent?: string;
})
```

变更描述：

- 默认情况下仍兼容现有 extension/background 行为。
- Electron host 中通过 session 包装器提供 `requestClient` 和 `cookieStore`。

### 决策 5：网页登录型 provider 使用独立持久化 Session

原因：

- `chatgpt-web` 依赖官网登录态和 Cookie 持久化。
- 独立 partition 可以隔离不同 provider 的 Cookie，避免互相污染。

替代方案：

- 方案 A：所有 provider 共享默认 Session。缺点是登录态耦合、调试困难、后续多 provider 管理混乱。
- 方案 B：每次启动重新登录。缺点是用户体验不可接受。

涉及文件：

- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/sessionManager.ts`

建议方法签名：

```ts
export function getProviderSession(providerId: string): Session
```

变更描述：

- 为 `chatgpt-web` 返回 `persist:chatprism-chatgpt`
- 为未来 `gemini-web` 返回 `persist:chatprism-gemini`

### 决策 5.1：未登录态由 renderer 展示登录入口，实际登录流程仍由 host 承担

原因：

- 当前桌面端 `checkAuth()` 失败时，用户只能看到“当前 Provider 鉴权不可用”，缺少可执行下一步。
- `chatgpt-web` 的登录态属于 Electron 持久化 Session，必须复用 `persist:chatprism-chatgpt`，并由 host 打开的窗口完成登录，不能在 renderer 中伪造或直接写 Cookie。
- 登录入口、窗口拉起与状态刷新都属于宿主行为，放在 `apps/desktop` 比放进 `ChatGPTWebProvider` 更符合现有边界。

替代方案：

- 方案 A：只显示错误提示，不提供登录入口。缺点是用户无法理解“桌面宿主的独立 Session 未登录”这一前提，首用体验差。
- 方案 B：在 renderer 中嵌入 ChatGPT 登录页面。缺点是会破坏现有 `UI -> Proxy -> Host` 边界，也不利于隔离权限与后续窗口管理。

涉及文件：

- 修改 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/App.vue`
- 修改 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/index.ts`
- 修改 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/preload.ts`
- 修改 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/sessionManager.ts`
- 可新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/authWindow.ts`

建议方法签名：

```ts
export async function openProviderLoginWindow(
  providerId: string,
  options?: { targetUrl?: string }
): Promise<void>
```

```ts
export function getProviderLoginUrl(providerId: string): string
```

```ts
export function onProviderLoginWindowClosed(
  listener: (providerId: string) => void
): () => void
```

变更描述：

- renderer 在 `chatgpt-web` 鉴权失败时展示“登录 ChatGPT”按钮，而不是只显示被动错误文案。
- 点击按钮后通过 preload / IPC 请求 host 打开一个绑定 `persist:chatprism-chatgpt` 的登录窗口，目标地址默认为 `https://chatgpt.com/`。
- host 按 provider 复用登录窗口单例；如果同一 provider 的登录窗口已存在，则优先聚焦而不是重复创建。
- preload 负责向 renderer 暴露“打开登录窗口”和“登录窗口关闭事件”桥接。
- 登录窗口关闭后，主界面重新执行一次 `checkAuth()`；若鉴权恢复成功，则恢复 `chatgpt-web` 可用状态，否则保留未登录提示。
- 登录窗口的职责仅限于建立 Session/Cookie，不直接承载聊天 UI。

### 决策 6：为 DOM 型 provider 预留 controlled-page executor

原因：

- `GeminiHistoryTabBridge` 依赖“创建受控标签页、等待页面完成、注入脚本、收发消息”。
- 桌面端没有 `chrome.tabs`，但可以用隐藏窗口、`BrowserWindow` 或 `WebContentsView` 复现这一能力。

替代方案：

- 方案 A：只支持 fetch 型 provider。缺点是桌面端无法覆盖“插件里所有 provider 都可用”的目标。
- 方案 B：等需要时再临时补页面控制器。缺点是届时会打断桌面 runtime 的既有边界。

涉及文件：

- 新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/controlledPageManager.ts`
- 后续可能新增 `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/bridges/GeminiHistoryPageBridge.ts`

建议方法签名：

```ts
export function ensurePage(
  providerId: string,
  options?: { targetUrl?: string; visible?: boolean }
): Promise<WebContents>
```

变更描述：

- 先在设计上定义受控页面执行器接口，首版实现可以先只打通 `chatgpt-web`，但接口必须预留。

## Risks / Trade-offs

- [Electron 体积与资源占用较高] → 先接受宿主成本，优先换取 Chromium 会话一致性和网页登录型 provider 的可行性。
- [`ChatGPTWebProvider` 抽象注入后实现复杂度上升] → 将注入边界限制在 `fetch/cookie/userAgent`，不要过度泛化 provider 宿主接口。
- [登录窗口与主工作台的状态同步存在时序问题] → 通过统一的 host API 管理登录窗口生命周期，并在窗口关闭后主动触发一次鉴权刷新。
- [桌面 proxy 与 extension proxy 协议分叉] → 尽量复用现有消息结构和字段命名，必要时抽公共协议定义。
- [DOM 型 provider 在桌面端的稳定性低于 extension] → 通过 controlled-page manager 收敛页面等待、导航与错误标准化，降低分散实现风险。
- [跨平台打包与 Electron 工程化成本增加] → 本阶段只建立最小可运行桌面宿主，不把发布流水线纳入首批范围。

## Migration Plan

1. 新增 `apps/desktop` 基础工程，打通 Electron renderer 与共享 UI 的挂载。
2. 在 `packages/core` 中新增 `desktop` runtimeMode，并更新 provider 配置与测试。
3. 重构 `ChatGPTWebProvider` 为可注入宿主能力，同时保证 extension 现有行为不回退。
4. 在桌面 main 侧实现 provider host、session manager 与最小 IPC 代理链路。
5. 在 renderer 侧实现 `DesktopProxyProvider`、`DesktopHistoryProxy` 和 `createDesktopProxyRuntime()`。
6. 为 `chatgpt-web` 增加未登录态登录入口和 host 侧登录窗口拉起。
7. 先完成 `chatgpt-web` 的桌面闭环验证，再逐步接入 controlled-page executor。

回滚策略：

- 如果桌面宿主实现不稳定，可仅撤回 `apps/desktop` 与 `desktop` runtimeMode 的暴露，不影响现有 `web/extension`。
- `ChatGPTWebProvider` 的注入式改造应保持默认兼容路径，以便必要时只关闭 Electron 注入层而不回退 provider 主逻辑。

## Open Questions

- 桌面端首版是否需要同步支持外部历史导入 UI，还是先聚焦聊天与对比工作流。
- `apps/desktop` 的构建工具链采用纯 Electron + Vite，还是引入额外脚手架层。
- `Gemini` 这类 controlled-page provider 在桌面端是否需要可见窗口兜底，用于用户手动登录或排障。
- 桌面端本地存储首版是否继续使用现有 Web 存储实现，还是同时引入更稳定的文件级持久化方案。
