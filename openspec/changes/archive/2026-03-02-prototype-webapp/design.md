## Context

本项目旨在构建一个跨平台的 AI 聊天客户端。目前第一阶段（Phase 1）的目标是产出一个以浏览器插件形式运行的 WebApp 模式 MVP。在浏览器插件环境下，前端直接请求大模型接口会面临严重的 CORS 跨域问题。同时，为了保证未来的跨端能力（如迁移至基于 Tauri 的桌面端），我们需要在架构设计阶段就将 UI 层、业务逻辑层（特别是网络通信和数据存储）彻底解耦。

## Goals / Non-Goals

**Goals:**
- 实现跨端 Monorepo 工程的物理隔离与环境搭建。
- 设计双核抽象（Provider Pattern），实现网络通信与数据持久化的接口化。
- 在插件环境中实现 WebApp 模式的网络通信架构，通过 Background 特权规避 CORS 限制。
- 逆向 ChatGPT Web API，实现鉴权、真实请求发起和 SSE 流式解析。
- 利用 IndexedDB 实现插件端的聊天对话持久化。

**Non-Goals:**
- 第一阶段不包含 Tauri 桌面端的具体实现，仅为其预留核心契约与架构空间。
- 不包括复杂的多模型支持体系，重心放在跑通 ChatGPT Web 单一通路的 MVP。

## Decisions

### 1. 跨端 Monorepo 物理结构设计
- **变更文件**: `pnpm-workspace.yaml`, `packages/core/`, `packages/ui/`, `apps/extension/`
- **说明**: 采用 pnpm workspaces（或 Turborepo）管理。`core` 包专注于纯业务逻辑与契约层（禁绝 DOM API）；`ui` 包负责基于 Vue 3 的界面的纯渲染；`apps/extension` 基于 WXT 框架，在此处组装依赖。这样可以保证核心代码在多种宿主环境间无缝复用。

### 2. 双核抽象设计 (Provider Pattern)
- **变更文件**: 
  - `packages/core/src/interfaces/IModelProvider.ts`
  - `packages/core/src/interfaces/IStorageProvider.ts`
- **接口签名变更**:
  - `IModelProvider`: 
    - `checkAuth(): Promise<boolean>;`
    - `sendMessage(prompt: string, context: any, onUpdate: Function): Promise<any>;`
    - `abort(): void;`
  - `IStorageProvider`: 
    - `saveConversation(chat: Conversation): Promise<void>;`
    - `getConversation(id: string): Promise<Conversation | null>;`
    - `getAllConversations(): Promise<Conversation[]>;`
    - `deleteConversation(id: string): Promise<void>;`
- **说明**: 在 `core` 层定义两大核心契约，屏蔽底层实现细节。UI 层仅面向契约编程。

### 3. WebApp 模式的网络通信架构 (规避 CORS)
- **变更文件**: 
  - `packages/core/src/providers/ChatGPTWebProvider.ts` (真实引擎)
  - `apps/extension/entrypoints/background.ts` (后台代理)
  - `apps/extension/src/utils/BackgroundProxyProvider.ts` (UI 层替身)
- **说明**: 宿主后台环境 (`background.ts`) 实例化 `ChatGPTWebProvider` 利用插件跨域特权发起真实网络请求并处理 SSE；UI 层则调用伪装的 `BackgroundProxyProvider`，通过插件通信机制（如长连接）将指令与数据与后台交互。此架构解决了浏览器环境下的跨域和流传输障碍。

### 4. API 逆向实现设计 (参考 ChatGPTBox 源码)
- **变更文件**: `packages/core/src/providers/ChatGPTWebProvider.ts`
- **说明**: 编写 `ChatGPTWebProvider.ts` 时，定向提取（但不直接引用）开源项目如 [ChatGPTBox](https://github.com/josStorer/chatGPTBox) 的纯函数逻辑：
  - **鉴权**: 模拟 `GET https://chatgpt.com/api/auth/session` 获取 `accessToken`。
  - **防爬 (可选)**: 模拟 `POST .../sentinel/chat-requirements` 获取 `token`。
  - **Payload**: 使用 `uuid` 生成 V4 格式 `message_id`，构造包含 `action: 'next'` 的深层 JSON。
  - **SSE 流解析**: 使用 `TextDecoder('utf-8')` 解码二进制块，按 `\n\n` 分割，剥离 `data: ` 前缀，过滤 `[DONE]`，全量覆盖解析出的 `parts[0]` 文本。

### 4. 存储适配层实现
- **变更文件**: 
  - `packages/core/src/providers/IndexedDBStorageProvider.ts`
- **说明**: 使用 localforage 或 dexie.js 等库实现 `IStorageProvider`。状态机（Pinia）在 `apps/extension/` 被初始化时注入此 IndexedDB 实例，从而实现将打字机效果对话持久化落盘。
### 5. Browser Extension 打包与 UI 渲染实现 (WXT + Vue 3)
- **变更文件**: 
  - `pnpm-workspace.yaml`, `apps/extension/package.json`, `apps/extension/wxt.config.ts`
  - `apps/extension/entrypoints/sidepanel.html`, `apps/extension/src/App.vue` 等组件
- **说明**: 
  - **环境构建**: 在 `apps/extension` 下初始化 WXT 和相关的包依赖（vue, pinia, localforage 等），配置 `pnpm-workspace.yaml` 把核心模块映射过来。在 `wxt.config.ts` 声明所需的 `host_permissions`（允许跨域请求 `*://chatgpt.com/*`）。
  - **UI 渲染**: 创建一个基础的 Sidepanel（侧边栏应用）或 Popup 作为插件的前端展示载体。使用 Vue 3 渲染聊天界面，由下置输入框和上置消息流组成，绑定 `useChatStore` 收发模型数据并实现打字机效果。

## Risks / Trade-offs

- **Risk: 非官方 API 的不稳定性**
  - **描述**: 我们通过逆向页面鉴权来调用 ChatGPT Web 内部 API，若其接口结构（包含 Payload 格式和 SSE 数据结构）变化，可能会破坏应用。
  - **Mitigation**: 在 `ChatGPTWebProvider` 内将请求构建与 SSE 解析过程抽离为高内聚的纯函数，并辅以单元测试。当 API 变更时仅需定位修改这些纯函数，降低维护成本。
- **Trade-off: 增加的代理层复杂性**
  - **描述**: 直接使用浏览器的 `fetch` 是最简单的，但因引入了 `BackgroundProxyProvider` 及后台消息转发机制，增添了调试与维护难度。
  - **Rationale**: 插件环境跨域通信的硬性限制以及长连接 SSE 流的正确处理，使得这种中转架构成为不可避免的最优解。
