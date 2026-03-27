# Phase 12: Desktop Runtime Mode

## 目标

为 ChatPrism 增加桌面运行模式，使桌面宿主能够复用当前浏览器插件里可运行的 provider 能力，尤其是基于网页登录态的 provider，例如 `ChatGPTWebProvider`。

这一阶段的核心目标不是简单增加一个桌面壳，而是补齐一个新的宿主运行时，使 `packages/core` 与 `packages/ui` 可以像在 `web` 和 `extension` 中一样，被 `desktop` 宿主装配，并保持一致的调用方式。

## 为什么采用 Electron

桌面方案优先采用 `Electron`，不采用“直接把现有扩展加载进 Electron”的方式，也不优先选 `Tauri`。

原因如下：

- 当前 extension 中的 provider 并不是单纯运行在页面里，而是依赖浏览器宿主能力，例如 `chrome.cookies`、`chrome.tabs`、`chrome.runtime.connect`
- `ChatGPTWebProvider` 本质上依赖 Chromium 会话、Cookie 和网络栈，Electron 更接近当前 extension 的运行前提
- Gemini 历史导入这类能力依赖受控页面与 DOM 抓取，Electron 更容易提供稳定的隐藏窗口或受控 WebContents
- Tauri 基于系统 WebView，Windows、macOS、Linux 底层实现不同，会放大这类网页登录态和页面兼容性的差异风险
- Electron 对 Chrome Extension API 只支持一个子集，不适合作为“直接复用现有扩展代码”的主路线

因此，桌面模式的正确方向是复用现有的架构边界，而不是复用扩展 API 本身。

## 桌面模式的核心思路

桌面宿主继续沿用当前 extension 已经验证过的分层边界：

```text
packages/ui
    │
    ▼
desktop renderer
    │ IPC
    ▼
desktop host(main)
 ├─ session-backed provider executor
 └─ controlled-page executor
```

也就是说：

- 渲染层继续负责 UI、store 和交互
- 桌面前端不直接持有网页登录态、Cookie 和敏感请求逻辑
- 真实 provider 实例运行在 Electron host 侧
- 前端通过代理 provider 和 IPC 与 host 通信

这和当前 extension 的 `UI -> Proxy -> Background -> Real Provider` 结构保持一致，只是把 background 换成桌面 host。

## 本阶段架构设计

### 1. 新增 `desktop` 运行模式

需要在核心 runtime 中新增第三种宿主模式：

- `web`
- `extension`
- `desktop`

`runtimeMode = 'desktop'` 的职责与其他模式一致：

- 控制 provider 是否可见
- 控制 provider 如何创建
- 控制宿主如何注入凭据、会话和执行环境

这样桌面宿主可以继续使用统一的 Runtime 装配能力，而不是另起一套分发逻辑。

### 2. 区分两类 provider 执行方式

桌面模式下，现有 provider 应分为两类：

#### A. Session-backed HTTP Provider

这类 provider 主要依赖：

- 持久化 Cookie
- Chromium 网络栈
- 登录态复用

例如：

- `ChatGPTWebProvider`

这类 provider 在 Electron 中应运行在 host 侧，并绑定独立 `Session`。

#### B. Controlled-page Provider

这类 provider 主要依赖：

- 真实页面上下文
- DOM 抓取
- 宿主主动控制页面打开、加载、导航、消息传递

例如：

- `Gemini` 历史导入能力

这类 provider 不能只靠普通 `fetch` 实现，需要桌面 host 创建受控页面并执行桥接逻辑。

### 3. 桌面模式继续使用代理运行时

桌面前端不应该直接 new 真实 provider。

应当延续 extension 的代理设计：

- renderer 中创建 `DesktopProxyProvider`
- `DesktopProxyProvider` 通过 IPC 向 Electron main 发起请求
- main 中解析 providerId，创建真实 provider 并执行
- 流式更新、结束、错误、中止都通过 IPC 回传

这样可以保持：

- UI 层接口不变
- provider 并发隔离方式不变
- 请求中止与 streaming 协议模型不变

### 4. 每个网页登录态 provider 使用独立持久化 Session

桌面端应为每个网页登录型 provider 分配独立 partition，例如：

- `persist:chatprism-chatgpt`
- `persist:chatprism-gemini`

这样做的收益：

- 登录态长期保留
- provider 之间 Cookie 隔离
- 后续支持更多网页登录 provider 时不会互相污染

## 与现有仓库结构的衔接方式

当前仓库已经有清晰的分层：

- `packages/core`
- `packages/ui`
- `apps/web`
- `apps/extension`

因此桌面模式最合适的落点是新增：

- `apps/desktop`

而不是把桌面逻辑混进现有 `apps/web` 或 `apps/extension`。

`apps/desktop` 的职责应当是：

- 装配共享 UI
- 初始化桌面 runtime
- 提供 IPC 通道
- 管理持久化 session
- 管理受控页面

## 推荐的文件与模块规划

以下是本阶段建议新增或修改的文件，以及各自职责。

### 需要修改的现有文件

#### `packages/core/config.ts`

需要修改的内容：

- 将 `RuntimeMode` 从 `'extension' | 'web'` 扩展为 `'extension' | 'web' | 'desktop'`
- 为可在桌面运行的 provider 增加 `supportedRuntimeModes: ['desktop']`
- 保持 provider 可见性仍由配置驱动

#### `packages/core/src/providers/ChatGPTWebProvider.ts`

需要修改的内容：

- 将内部直接依赖的 `fetch` 与 `chrome.cookies` 抽象为可注入能力
- 让 provider 可运行于 extension background，也可运行于 Electron host

建议构造方式：

```ts
constructor(options?: {
  requestClient?: ProviderRequestClient;
  cookieStore?: ProviderCookieStore;
  userAgent?: string;
})
```

重构目标：

- 不再把宿主 API 写死在 provider 内部
- 让同一个 provider 实现在不同宿主间复用

### 需要新增的桌面宿主文件

#### `apps/desktop/src/providerRuntime.ts`

职责：

- 创建 `desktop` 模式下的代理 runtime
- 向 UI 层暴露统一的 `ProviderRuntime`

建议方法：

```ts
export function createDesktopProxyRuntime(): ProviderRuntime
```

#### `apps/desktop/src/utils/DesktopProxyProvider.ts`

职责：

- 对齐 `BackgroundProxyProvider` 的协议模型
- 在 renderer 中承接 `sendMessage`、`checkAuth`、`getAvailableModels`、`abort`
- 通过 Electron IPC 与 host 通信

#### `apps/desktop/src/utils/DesktopHistoryProxy.ts`

职责：

- 为外部历史 provider 提供桌面版代理层
- 与 host 之间转发 `getHistoryList` / `getHistoryDetail`

#### `apps/desktop/main/sessionManager.ts`

职责：

- 管理不同 provider 的 Electron `Session`
- 为网页登录型 provider 返回稳定的持久化 partition

建议方法：

```ts
export function getProviderSession(providerId: string): Session
```

#### `apps/desktop/main/providerHost.ts`

职责：

- 注册 IPC handler
- 在 host 侧创建真实 provider
- 管理请求生命周期、流式响应与 abort

建议方法：

```ts
export function registerProviderHostIpc(): void
```

#### `apps/desktop/main/controlledPageManager.ts`

职责：

- 为 Gemini 这类 provider 管理受控页面
- 支持创建、复用、导航隐藏窗口或 WebContentsView
- 提供后续 DOM 抓取桥接能力

建议方法：

```ts
export function ensurePage(
  providerId: string,
  options?: { targetUrl?: string; visible?: boolean }
): Promise<WebContents>
```

#### `apps/desktop/src/App.vue`

职责：

- 复用现有共享 UI 工作区
- 完成桌面宿主下的 store 装配
- 注入桌面版 runtime、history providers、storage provider

实现方式应尽量参考 `apps/extension/src/App.vue` 的宿主装配逻辑，而不是从零再写一份产品层流程。

## 分阶段实施建议

### 第一阶段：先打通 `ChatGPTWebProvider`

先只完成最关键的网页登录 provider 复用：

- 新建 `desktop` 宿主
- 打通 renderer 与 host 的 provider proxy
- 在 host 侧为 `ChatGPTWebProvider` 注入 session 能力
- 验证登录态保留、消息发送、流式输出、模型目录读取

这一阶段的目标是证明：

桌面模式确实能够承接“插件里依赖网页登录态的 provider”。

### 第二阶段：支持 Gemini 这类受控页面 provider

在桌面 host 中补齐：

- 隐藏窗口或受控 WebContents
- 页面导航
- 页面准备态检测
- DOM 抓取桥接

这一阶段完成后，桌面模式不只支持后台 `fetch` 型 provider，也能支持依赖页面上下文的 provider。

### 第三阶段：再考虑桌面本地存储升级

例如未来可逐步考虑：

- SQLite
- 更稳定的本地缓存
- 更强的桌面离线数据能力

但这不是本阶段的前置条件，不应阻塞桌面运行模式的首版落地。

## 不推荐的方案

### 不建议直接加载现有 MV3 扩展

不建议把现有浏览器扩展直接作为 Electron 桌面方案来运行。

原因：

- Electron 对 Chrome Extension API 只支持子集
- 当前扩展依赖的 `chrome.cookies`、`chrome.tabs.create`、`chrome.runtime.connect` 并不适合作为桌面主实现基础
- 即使早期可运行，后续维护成本和行为差异也会越来越大

因此，桌面模式应该复用“架构边界”，而不是复用“浏览器扩展宿主本身”。

## 结论

本阶段的桌面方案应采用：

- `Electron`
- 新增 `apps/desktop`
- 新增 `runtimeMode = 'desktop'`
- 继续沿用代理运行时
- host 侧承接真实 provider 执行
- 使用独立持久化 Session 管理网页登录态
- 通过受控页面机制承接 DOM 型 provider

这条路线与当前仓库分层保持一致，能最大化复用已有的 `core`、`ui` 和 runtime 设计，同时避免把桌面实现绑死在浏览器扩展 API 上。
