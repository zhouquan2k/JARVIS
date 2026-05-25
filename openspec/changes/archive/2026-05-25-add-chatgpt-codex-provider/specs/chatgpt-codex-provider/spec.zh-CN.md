## ADDED Requirements

### Requirement: ChatGPT Codex provider MUST 在 web、extension、desktop 三端暴露统一 provider
系统 MUST 提供一等的 `chatgpt-codex` model provider，并让它通过 `ModelProviderRuntime` 出现在 `web`、`extension`、`desktop` 三种 runtime mode 中。该 provider MUST 使用统一的 server-backed 执行路径，而不是继续依赖各宿主各自的 ChatGPT Web session 实现。

#### Scenario: 在任意支持的 runtime 中解析 Codex provider
- **WHEN** 宿主以 `runtimeMode = 'web'`、`runtimeMode = 'extension'` 或 `runtimeMode = 'desktop'` 初始化 `ModelProviderRuntime`
- **THEN** `ModelProviderRuntime.getAvailableProviders()` MUST 包含 `chatgpt-codex`
- **AND** `ModelProviderRuntime.getProvider('chatgpt-codex')` MUST 返回一个基于同一套 server-facing contract 的 provider 实例

#### Scenario: 仅在不支持的 runtime 中排除 Codex provider
- **WHEN** 某个 runtime mode 不满足 `chatgpt-codex` 的支持矩阵
- **THEN** 该 provider MUST 不出现在该 runtime 的 provider catalog 中
- **AND** 其缺失 MUST 由 runtime 过滤决定，而不是由宿主 UI 做特判隐藏

### Requirement: ChatGPT Codex provider MUST 通过本地 provider server 解析认证与模型目录
`chatgpt-codex` provider MUST 通过本地 provider server 完成认证状态检查和模型目录读取，而不是直接依赖浏览器 cookie 或直接访问私有 ChatGPT Web endpoint。

#### Scenario: 通过本地 server 检查认证状态
- **WHEN** UI 对 `chatgpt-codex` 调用 `checkAuth()`
- **THEN** provider MUST 向本地 provider server 查询 Codex 认证状态
- **AND** provider MUST 返回适合宿主恢复流程消费的规范化布尔值

#### Scenario: 通过本地 server 读取模型目录
- **WHEN** runtime 对 `chatgpt-codex` 调用 `getAvailableModels()`
- **THEN** provider MUST 向本地 provider server 查询 Codex 模型目录
- **AND** provider MUST 返回规范化的 `ProviderModelCatalog`

### Requirement: ChatGPT Codex provider MUST 通过流式 provider update 支持普通聊天执行
`chatgpt-codex` provider MUST 通过本地 provider server 支持普通 `sendMessage(...)` 执行，并且 MUST 继续输出与现有聊天渲染链路兼容的 `ProviderStreamUpdate` / `ProviderSendResult`。

#### Scenario: 流式返回一条普通 Codex 响应
- **WHEN** 调用方对 `chatgpt-codex` 执行 `sendMessage(prompt, options, onUpdate)`
- **THEN** provider MUST 将该请求转发到本地 provider server
- **AND** provider MUST 通过 `onUpdate` 输出规范化的流式文本更新
- **AND** 最终结果 MUST 包含规范化后的 `text`、`conversationId` 和 `messageId`

#### Scenario: 明确 Codex 不承担 external history 职责
- **WHEN** 系统解析 `chatgpt-codex`
- **THEN** 该 provider MUST 继续只承担 model provider 职责
- **AND** 该 provider MUST NOT 被要求实现 external history import 能力

### Requirement: ChatGPT Codex provider MUST 实现 IAgentCapableProvider
`chatgpt-codex` provider MUST 实现 `IAgentCapableProvider`，使 ChatPrism Agent mode 可以把它作为 native-agent 后端来选择。

#### Scenario: 暴露 native agent capability
- **WHEN** agent runtime 解析到 `chatgpt-codex`
- **THEN** provider MUST 暴露 `getAgentCapabilities()`
- **AND** 返回的 capability 声明 MUST 将该 provider 标记为支持 native agent

#### Scenario: 通过 Codex 后端执行一次 Agent 请求
- **WHEN** agent runtime 对 `chatgpt-codex` 执行 `runAgent(request, onUpdate)`
- **THEN** provider MUST 将该请求转发到本地 provider server 的 Codex agent 执行路径
- **AND** provider MUST 返回与现有 agent runtime 契约兼容的规范化 `ProviderSendResult`

### Requirement: ChatGPT Codex provider MUST 规范化 server-backed 认证失败，便于恢复
`chatgpt-codex` provider MUST 以便于宿主显示登录或恢复入口的方式，暴露未认证和后端不可用状态。

#### Scenario: 在未认证时不破坏工作区
- **WHEN** 本地 provider server 报告 Codex 当前未认证
- **THEN** `checkAuth()` MUST resolve 为 `false`
- **AND** 宿主 MUST 可以在不重建 provider 契约的情况下再次发起认证

#### Scenario: 在执行失败时返回可定位到 provider 的错误
- **WHEN** 本地 provider server 无法执行 Codex 的 chat 或 agent 请求
- **THEN** provider MUST 向调用方返回规范化错误
- **AND** 该错误 MUST 保持可归因到当前 provider，而不是被误分类为 external history 失败
