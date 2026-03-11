## MODIFIED Requirements

### Requirement: ChatGPT Web Message Sending
系统 MUST 实现构建多模态 Payload、发起请求并流式解析 SSE (Server-Sent Events) 的能力，并将 ChatGPT Web 私有返回结构标准化为统一的 `text + annotations` 输出契约。

#### Scenario: Streaming response parsing with specific model
- **WHEN** 调用 `sendMessage` 发送请求并接收到包含 `data:` 块的二进制流
- **THEN** 系统 MUST 过滤 `[DONE]` 标记，解析出当前完整正文快照，并通过 `onUpdate` 回调实时传递标准化后的 `text`
- **AND** 发往后台 `backend-api/conversation` 的 Payload MUST 消费传入的 `options.modelId`（而不是硬写死 `model: 'auto'`），向 ChatGPT 官方接口指定对应模型

#### Scenario: Send multimodal payload to ChatGPT Web
- **WHEN** 调用 `sendMessage` 时附带图片或文件附件
- **THEN** 系统 MUST 将这些附件编码并组装进 ChatGPT Web 可接受的消息负载结构
- **AND** 同一条用户消息的文本与附件 MUST 在同一次请求中一起提交

### Requirement: ChatGPT Web history detail normalization
系统 MUST 提供针对 ChatGPT 网页版历史详情的读取与标准化能力，以便导入流程复用统一的 `Conversation` 模型，并保留消息级附件与注解信息。

#### Scenario: Normalize ChatGPT history detail into Conversation
- **WHEN** 系统请求某条 ChatGPT 历史对话的详情
- **THEN** 系统 MUST 从原始树状节点中提取一条可渲染的主链
- **AND** 系统 MUST 返回包含 `backendId`、`externalId`、`sourceType` 和线性 `messages` 的标准化 `Conversation`

## ADDED Requirements

### Requirement: ChatGPT Web provider MUST normalize provider-private annotations
系统 MUST 在 provider 层清洗 ChatGPT Web 私有的引用、图片组等标识，并输出统一的结构化注解，而不是将私有 token 暴露给 UI。

#### Scenario: Normalize cite and image group markers
- **WHEN** ChatGPT Web 流式响应中包含引用或图片组等私有标识
- **THEN** 系统 MUST 将这些标识转换为标准化的 `annotations`
- **AND** 返回给 UI 的 `text` MUST 不再包含原始私有 token
