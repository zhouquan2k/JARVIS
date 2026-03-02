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
