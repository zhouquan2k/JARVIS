## ADDED Requirements

### Requirement: ChatGPT Web Authentication
系统 MUST 提供针对 ChatGPT 网页版的鉴权检查机制，从网页环境获取有效的 Session。

#### Scenario: Successful auth check
- **WHEN** 调用 `checkAuth` 方法请求 https://chatgpt.com/api/auth/session 成功且响应包含 accessToken
- **THEN** 系统 MUST 返回 true

### Requirement: ChatGPT Web Message Sending
系统 MUST 实现构建 Payload 发起请求并流式解析 SSE (Server-Sent Events) 的能力。

#### Scenario: Streaming response parsing with specific model
- **WHEN** 调用 `sendMessage` 发送请求并接收到包含 `data:` 块的二进制流
- **THEN** 系统 MUST 过滤 `[DONE]` 标记，解析出有效文本块，并通过 `onUpdate` 回调实时传递完整拼接的文本
- **AND** 发往后台 `backend-api/conversation` 的 Payload MUST 消费传入的 `options.modelId`（而不是硬写死 `model: 'auto'`），向 ChatGPT 官方接口指定对应模型。

### Requirement: ChatGPT Web history list fetching
系统 MUST 提供针对 ChatGPT 网页版历史会话列表的读取能力，以便扩展宿主展示最近可导入的历史记录。

#### Scenario: Fetch first page of ChatGPT history
- **WHEN** 历史 provider 请求 ChatGPT 网页版历史列表
- **THEN** 系统 MUST 读取最近的第 1 页历史结果
- **AND** 系统 MUST 将每条结果标准化为包含 `id`、`title`、`updatedAt` 的历史摘要

### Requirement: ChatGPT Web history detail normalization
系统 MUST 提供针对 ChatGPT 网页版历史详情的读取与标准化能力，以便导入流程复用统一的 `Conversation` 模型。

#### Scenario: Normalize ChatGPT history detail into Conversation
- **WHEN** 系统请求某条 ChatGPT 历史对话的详情
- **THEN** 系统 MUST 从原始树状节点中提取一条可渲染的主链
- **AND** 系统 MUST 返回包含 `backendId`、`externalId`、`sourceType` 和线性 `messages` 的标准化 `Conversation`

### Requirement: ChatGPT Web provider MUST return current available models
系统 MUST 允许 `ChatGPTWebProvider` 根据当前网页鉴权上下文返回当前账号可用的模型列表，而不是仅依赖静态配置。

#### Scenario: Resolve ChatGPT Web model catalog
- **WHEN** extension 宿主请求 `chatgpt-web` provider 的可用模型
- **THEN** 系统 MUST 返回当前账号可见的模型集合与 `defaultModel`
- **AND** 该模型集合 MUST 来源于 ChatGPT 网页真实的模型目录接口，而不是聊天前置校验接口
- **AND** 若动态查询失败，系统 MUST 回退到静态配置中的 ChatGPT 模型列表
