English | [中文](spec.zh-CN.md)

## MODIFIED Requirements

### Requirement: ChatGPT Web Message Sending
系统 MUST 实现构建多模态 Payload、发起请求并流式解析 SSE (Server-Sent Events) 的能力，并将 ChatGPT Web 私有返回结构标准化为统一的 `text + annotations` 输出契约。该请求构建过程 MUST 同时消费 `options.modelId` 与规范化后的 `options.modelOptions`，并且 MUST 能通过宿主注入的请求客户端与 Cookie 能力在不同宿主中执行。

#### Scenario: Streaming response parsing with specific model
- **WHEN** 调用 `sendMessage` 发送请求并接收到包含 `data:` 块的二进制流
- **THEN** 系统 MUST 过滤 `[DONE]` 标记，解析出当前完整正文快照，并通过 `onUpdate` 回调实时传递标准化后的 `text`
- **AND** 发往后台 `backend-api/conversation` 的 Payload MUST 消费传入的 `options.modelId`（而不是硬写死 `model: 'auto'`），向 ChatGPT 官方接口指定对应模型

#### Scenario: Send multimodal payload to ChatGPT Web
- **WHEN** 调用 `sendMessage` 时附带图片或文件附件
- **THEN** 系统 MUST 将这些附件编码并组装进 ChatGPT Web 可接受的消息负载结构
- **AND** 同一条用户消息的文本与附件 MUST 在同一次请求中一起提交

#### Scenario: Enable web search mode for ChatGPT Web request
- **WHEN** `sendMessage` 收到 `options.modelOptions.web_search = true`
- **THEN** 系统 MUST 将该请求翻译为 ChatGPT Web 可识别的联网搜索模式
- **AND** 当 `deep_research` 未启用时，请求 MUST 不携带 Deep Research 模式

#### Scenario: Enable deep research mode for ChatGPT Web request
- **WHEN** `sendMessage` 收到 `options.modelOptions.deep_research = true`
- **THEN** 系统 MUST 将该请求翻译为 ChatGPT Web 可识别的 Deep Research 模式
- **AND** Provider MUST 基于传入的规范化选项构造请求，而不是自行恢复被上层裁剪掉的冲突项

#### Scenario: Use host-injected request client in desktop host
- **WHEN** `ChatGPTWebProvider` 运行于桌面 host 且宿主注入了请求客户端
- **THEN** Provider MUST 通过该注入的请求客户端执行认证、模型目录、历史查询和消息发送请求
- **AND** Provider MUST NOT 依赖 renderer 环境中的浏览器扩展 API

### Requirement: ChatGPT Web history detail normalization
系统 MUST 提供针对 ChatGPT 网页版历史详情的读取与标准化能力，以便导入流程复用统一的 `Conversation` 模型，并保留消息级附件与注解信息。

#### Scenario: Normalize ChatGPT history detail into Conversation
- **WHEN** 系统请求某条 ChatGPT 历史对话的详情
- **THEN** 系统 MUST 从原始树状节点中提取一条可渲染的主链
- **AND** 系统 MUST 返回包含 `backendId`、`externalId`、`sourceType` 和线性 `messages` 的标准化 `Conversation`

## ADDED Requirements

### Requirement: ChatGPT Web provider MUST support searchable history summaries
系统 MUST 为 ChatGPT 网页版历史 provider 提供可搜索的摘要列表查询能力，并继续复用统一的 `ConversationHistorySummary` 契约。该能力 MUST 同时支持“最近列表”和“关键词搜索”两种查询模式，而不改变现有详情读取与标准化行为。

#### Scenario: Return recent ChatGPT history summaries without query
- **WHEN** UI 调用 `ChatGPTWebProvider.getHistoryList()`，且未传入 `query` 或传入空字符串
- **THEN** Provider MUST 返回最近一页 ChatGPT 历史摘要列表
- **AND** 每条摘要 MUST 包含 `id`、`title`、`updatedAt` 与 `origin = 'chatgpt-web'`

#### Scenario: Return searched ChatGPT history summaries with query
- **WHEN** UI 调用 `ChatGPTWebProvider.getHistoryList({ query })`，且 `query` 为非空字符串
- **THEN** Provider MUST 调用 ChatGPT 原生历史搜索能力并返回匹配结果
- **AND** 返回结果 MUST 继续标准化为统一的 `ConversationHistorySummary[]`

### Requirement: ChatGPT Web provider MUST resolve device and cookie context through host abstractions
系统 MUST 通过宿主抽象解析 `oai-did` 等设备与 Cookie 上下文，以便在 extension background 和 desktop host 中复用同一个 Provider 实现。

#### Scenario: Resolve device cookie through injected cookie store
- **WHEN** Provider 运行于支持宿主注入 Cookie 能力的环境中
- **THEN** 系统 MUST 优先通过注入的 Cookie 读取能力获取 `oai-did`
- **AND** 当宿主未提供该能力或读取失败时，Provider MUST 回退到可接受的设备标识生成策略

### Requirement: ChatGPT Web provider MUST expose auth state suitable for host-side recovery flows
系统 MUST 允许宿主基于 `ChatGPTWebProvider.checkAuth()` 的结果触发登录恢复流程，而不是将鉴权失败视为不可恢复的终态。该行为 MUST 兼容桌面宿主使用独立持久化 Session 的场景。

#### Scenario: Desktop host uses checkAuth result to drive login recovery
- **WHEN** 桌面宿主中的 `ChatGPTWebProvider.checkAuth()` 返回失败
- **THEN** 宿主 MUST 能将该结果解释为“当前 Session 未登录”
- **AND** 宿主 MUST 可以在用户完成登录后重新执行 `checkAuth()` 以确认认证状态是否恢复

### Requirement: ChatGPT Web provider MUST normalize provider-private annotations
系统 MUST 在 provider 层清洗 ChatGPT Web 私有的引用、图片组等标识，并输出统一的结构化注解，而不是将私有 token 暴露给 UI。

#### Scenario: Normalize cite and image group markers
- **WHEN** ChatGPT Web 流式响应中包含引用或图片组等私有标识
- **THEN** 系统 MUST 将这些标识转换为标准化的 `annotations`
- **AND** 返回给 UI 的 `text` MUST 不再包含原始私有 token
