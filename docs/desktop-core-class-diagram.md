# Desktop App 核心实现视图

本文用多张 Mermaid 图描述 `Desktop App` 的不同核心类群与关键对象关系。

约束如下：

- 优先画核心实现类
- 不画接口类本体
- 不画局部类
- 对于不是显式类、但又是桌面架构关键节点的对象，使用关系图表达
- 在实现类说明中标注其主要实现/承担的接口职责

---

## 1. Provider / History 类图

这张图聚焦桌面端 renderer 代理类、Gemini 历史桥接，以及最终落到的真实 provider。

```mermaid
classDiagram
direction TB

class DesktopProxyProvider {
  <<implements IModelProvider>>
  - id: string
  - channelId: string
  - pending: Map
  + checkAuth()
  + getAvailableModels()
  + getDocumentCapability()
  + sendMessage(prompt, options, onUpdate)
  + analyzeComparison(payload, onUpdate)
  + abort()
}

class DesktopHistoryProxy {
  <<implements IExternalConversationProvider / IHistoryProvider>>
  - id: string
  - channelId: string
  - pending: Map
  + getHistoryList(options)
  + getHistoryDetail(externalId)
}

class GeminiHistoryPageBridge {
  <<implements GeminiHistoryBridge>>
  - pageUrl: string
  + getHistoryList(config, options)
  + probeHistoryListReady(config, options)
  + getHistoryDetail(config, externalId)
}

class GeminiDomHistoryProvider {
  <<implements IExternalConversationProvider / IHistoryProvider>>
  + getHistoryList(options)
  + getHistoryDetail(externalId)
}

class ChatGPTWebProvider {
  <<implements IModelProvider and IHistoryProvider>>
  + checkAuth()
  + getAvailableModels()
  + getHistoryList(options)
  + getHistoryDetail(externalId)
  + sendMessage(prompt, options, onUpdate)
  + abort()
}

class GeminiApiProvider {
  <<implements IModelProvider and IAgentCapableProvider>>
  + checkAuth()
  + getAvailableModels()
  + sendMessage(prompt, options, onUpdate)
  + runAgent(request, onUpdate)
  + abort()
}

DesktopProxyProvider ..> ChatGPTWebProvider : 代理到主进程中的真实 provider
DesktopProxyProvider ..> GeminiApiProvider : 代理到主进程中的真实 provider
DesktopHistoryProxy ..> ChatGPTWebProvider : 代理外部历史读取
DesktopHistoryProxy ..> GeminiDomHistoryProvider : 代理外部历史读取
GeminiDomHistoryProvider --> GeminiHistoryPageBridge : 使用页面桥接读取 Gemini 历史
```

---

## 2. Agent 执行关系图

这张图不强求只画显式类，而是表达桌面端 Agent 相关的当前关键执行链路。

当前要点：

- renderer 侧普通发送流程仍主要落在 `useChatStore.sendDraft`
- agent 执行编排由 `createAgentRuntime(...)` 产物承载
- 真实 model provider 的实现落点已在“图 1 Provider / History 类图”中表达，这里不再重复展开

```mermaid
classDiagram
direction TB

class ChatStore {
  <<ui-store>>
  sendDraft()
}

class AgentRuntime {
  <<runtime object>>
  run(request, onUpdate)
  abort()
}

class DesktopProxyProvider {
  <<implements IModelProvider>>
  sendMessage(prompt, options, onUpdate)
  abort()
}

class WorkspaceContext {
  <<desktop workspace context>>
  activeWorkspaceDocument
  contextProvider
}

ChatStore --> AgentRuntime : Agent 模式入口
ChatStore --> DesktopProxyProvider : 普通模型请求入口
AgentRuntime --> DesktopProxyProvider : 委托模型执行
AgentRuntime --> WorkspaceContext : 使用活动文档与 context

link DesktopProxyProvider "#1-provider--history-类图" "见图1：Provider / History 类图"
```

说明：

- 如果后续引入 `ConversationWorkflowController`，它应位于 `chatStore.sendDraft` 与 `agentRuntime` / `DesktopProxyProvider` 之间
- 真实 model provider 的实现链路见本文的 [1. Provider / History 类图](#1-provider--history-类图)
- 桌面 bridge / host / IPC 细节见本文的 [4. Host / IPC 关系图](#4-host--ipc-关系图)

---

## 3. Desktop ContextProvider 实现关系图

这张图聚焦桌面端 `ContextProvider` 是如何实现出来的。

当前桌面知识工作区的关键实现方式是：

- renderer 侧通过 `createDesktopContextProvider()` 返回桌面专用 provider 对象
- 该 provider 的方法通过 `window.chatprismDesktop` bridge 转发到主进程
- 主进程由 `registerContextIpc(...)` 注册的 IPC handlers 承载真实实现
- 真实实现再落到 workspace root 与作用域 agent 配置解析

```mermaid
classDiagram
direction TB

class DocumentWorkspaceView {
  <<ui>>
}

class AgentPane {
  <<ui>>
}

class DesktopContextProvider {
  <<implements IContextProvider>>
  + initializeAccess()
  + listTree(parentPath)
  + readDocument(path)
  + writeDocument(input)
  + createNode(input)
  + searchInScope(request)
  + resolveScopedAgentConfig(targetPath)
}

class DesktopBridge {
  <<bridge>>
  window.chatprismDesktop
}

class ContextIpcHandlers {
  <<host service>>
  registerContextIpc(...)
}

class WorkspaceRoot {
  <<filesystem>>
  CHATPRISM_KNOWLEDGE_ROOT
}

class ResolvedAgentConfig {
  <<domain>>
}

DocumentWorkspaceView --> DesktopContextProvider : 使用
AgentPane --> DesktopContextProvider : 使用
DesktopContextProvider --> DesktopBridge : 方法转发
DesktopBridge --> ContextIpcHandlers : IPC 调用
ContextIpcHandlers --> WorkspaceRoot : 读写目录与文件
ContextIpcHandlers --> ResolvedAgentConfig : 解析作用域配置
```

说明：

- `DesktopContextProvider` 对应的是 `createDesktopContextProvider()` 返回对象
- `ContextIpcHandlers` 对应的是 `registerContextIpc(...)` 注册的一组主进程处理器
- 这张图的重点不是知识工作区如何“使用” context，而是桌面专用 `ContextProvider` 如何被实现出来

---

## 4. Host / IPC 关系图

这张图聚焦 Desktop host 的关键对象关系。

```mermaid
flowchart TD
    DesktopMainBootstrap["DesktopMainBootstrap<br/>main process composition root"] --> ProviderHost["providerHost<br/>createProviderHost(...) 产物"]
    DesktopMainBootstrap --> ControlledPageManager["controlledPageManager<br/>createControlledPageManager(...) 产物"]
    DesktopMainBootstrap --> GeminiHistoryPageBridge["GeminiHistoryPageBridge"]
    DesktopMainBootstrap --> AuthWindowManager["authWindowManager<br/>provider login windows for chatgpt-web / gemini-web"]
    DesktopMainBootstrap --> ContextIpc["registerContextIpc(...)"]

    GeminiHistoryPageBridge --> ControlledPageManager
    ProviderHost --> DesktopHostRuntime["desktop host runtime<br/>createDesktopHostRuntime(...)"]
    DesktopRenderer["Desktop renderer"] --> DesktopBridge["preload / IPC bridge"]
    DesktopBridge --> ProviderHost
    DesktopBridge --> ContextIpc
    DesktopBridge --> AuthWindowManager
```

说明：

- 这里最重要的是宿主对象关系，而不是类继承关系
- `providerHost`、`controlledPageManager`、`authWindowManager` 虽然不是显式类，但它们是桌面端真实存在的核心运行对象
- `DesktopMainBootstrap` 表示主进程入口的装配职责，对应 `main/index.ts`
- `AuthWindowManager` 同时服务 `chatgpt-web` 与 `gemini-web`，但当前其“登录完成探测”逻辑主要是为 Gemini 历史页面准备的

---

## 5. 阅读建议

建议按下面顺序读这几张图：

1. `Provider / History 类图`
   - 看清 renderer 代理类与真实 provider 的关系
2. `Agent 执行关系图`
   - 看清 Agent 请求从聊天入口如何落到主进程真实 provider
3. `Knowledge / Context 关系图`
   - 看清桌面知识工作区如何通过 bridge 和 IPC 落到本地知识目录
4. `Host / IPC 关系图`
   - 看清 Electron 主进程如何把 provider、历史、受控页面与登录恢复串起来

## 6. 后续建议

如果后续继续细化桌面架构文档，下一步最值得补的是：

- `ConversationWorkflowController` 引入后的桌面对话执行类图
- `providerHost` 的内部处理流程时序图
- `GeminiHistoryPageBridge` 与 `controlledPageManager` 的协作时序图
