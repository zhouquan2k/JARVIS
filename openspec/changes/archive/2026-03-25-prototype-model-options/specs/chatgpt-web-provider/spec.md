## MODIFIED Requirements

### Requirement: ChatGPT Web Message Sending
系统 MUST 实现构建多模态 Payload、发起请求并流式解析 SSE (Server-Sent Events) 的能力，并将 ChatGPT Web 私有返回结构标准化为统一的 `text + annotations` 输出契约。该请求构建过程 MUST 同时消费 `options.modelId` 与规范化后的 `options.modelOptions`，以便驱动普通聊天、联网搜索或 Deep Research 等模型能力。

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
