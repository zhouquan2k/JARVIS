## MODIFIED Requirements

### Requirement: Implementation of Gemini API via SSE
系统 MUST 接入 Google Gemini API 以提供原生的大语言模型能力，并通过统一的流式快照契约输出标准化的 `text + annotations` 结果。该实现 MUST 同时消费 `modelId` 与规范化后的 `modelOptions`，以便在普通聊天、Deep Research 与第一阶段原生 Agent 模式之间切换 Gemini 侧请求行为。对于第一阶段原生 Agent 请求，系统 MUST 优先复用现有 `streamGenerateContent` 路径，而不是切换到 Live API 或新的实时 session 形态。

#### Scenario: Streaming response generation for standard chat
- **WHEN** 收到发往 Gemini 提供商的普通聊天请求，并附带了 `modelId`
- **THEN** Provider MUST 调用 Google Generative AI 端点，且响应模式为 SSE（Server-Sent Events），确保前端能收到流式的完整正文快照
- **AND** 这些快照 MUST 通过统一的 `onUpdate` 契约返回，而不是仅返回原始分片文本

#### Scenario: Enable deep research mode for Gemini request
- **WHEN** `sendMessage` 收到 `options.modelOptions.deep_research = true`
- **THEN** Provider MUST 将该标记翻译为 Gemini 兼容的 Deep Research 请求行为
- **AND** 当该标记缺失或为 `false` 时，Provider MUST 保持现有普通聊天请求路径不变

#### Scenario: Stream native agent request through the existing content API
- **WHEN** Gemini Provider 收到一次原生 Agent 执行请求
- **THEN** Provider MUST 继续基于现有 `streamGenerateContent` 或等价内容生成流式端点发起请求
- **AND** Provider MUST NOT 在第一阶段要求上层切换到 WebSocket Live API 会话模型

## ADDED Requirements

### Requirement: Gemini provider MUST expose native agent execution capability
系统 MUST 允许 Gemini Provider 在保留普通聊天能力的同时，显式声明其支持原生 Agent 执行，并接收当前已解析的 Agent 配置作为运行时输入。

#### Scenario: Declare native agent capability on Gemini provider
- **WHEN** 运行时请求 Gemini Provider 的能力声明
- **THEN** Provider MUST 明确表明其支持原生 Agent 执行
- **AND** 该能力声明 MUST 可被 `AgentRuntime` 用于执行路径选择

#### Scenario: Execute native agent request with the current resolved agent config
- **WHEN** `AgentRuntime` 将当前 `ResolvedAgentConfig` 与请求上下文传递给 Gemini Provider
- **THEN** Provider MUST 使用该配置中的模型、指令与能力边界构造 Gemini Agent 请求
- **AND** Provider MUST 继续通过标准化的流式文本更新契约向上返回结果

### Requirement: Gemini native agent execution MUST support application-managed tool loop in phase one
系统 MUST 允许第一阶段 Gemini 原生 Agent 请求通过 Gemini function calling / tools 机制工作，并由应用侧运行时维护多步 tool loop，而不是把完整的工具循环封装为新的传输协议。

#### Scenario: Send tool declarations with a native agent request
- **WHEN** Gemini Provider 发起一次原生 Agent 请求且当前 Agent 具有可用工具边界
- **THEN** Provider MUST 在 Gemini 请求中携带对应的 tools / function calling 配置
- **AND** Provider MUST 允许上层应用在收到工具调用后继续维护后续循环
