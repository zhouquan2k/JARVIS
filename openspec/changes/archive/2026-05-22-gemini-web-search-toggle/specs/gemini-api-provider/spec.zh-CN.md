## MODIFIED Requirements

### Requirement: Implementation of Gemini API via SSE
系统 MUST 集成 Google Gemini API，通过统一的流式快照契约输出标准化的 `text + annotations` 结果，从而提供原生大语言模型能力。实现 MUST 同时消费 `modelId` 和归一化后的 `modelOptions`，以便 Gemini 请求行为能够在普通聊天、基于网页的搜索、Deep Research 以及第一阶段 native agent 模式之间切换。对于第一阶段 native agent 请求，系统 MUST 优先复用现有 `streamGenerateContent` 路径，而不是切换到 Live API 或新的实时会话形式。

#### Scenario: Streaming response generation for standard chat
- **WHEN** 一个带有 `modelId` 的普通聊天请求被发送到 Gemini provider
- **THEN** provider MUST 使用 SSE（Server-Sent Events）响应模式调用 Google Generative AI endpoint，使前端能够收到流式完整文本快照
- **AND** 这些快照 MUST 通过统一的 `onUpdate` 契约返回，而不是只返回原始 chunk 文本

#### Scenario: Enable web search mode for Gemini request
- **WHEN** `sendMessage` 收到 `options.modelOptions.web_search = true`
- **THEN** provider MUST 在请求 payload 中加入 Gemini 原生 Google Search tool
- **AND** provider MUST 继续走现有 Gemini content API 路径，而不是发明一条应用侧搜索传输链路

#### Scenario: Enable deep research mode for Gemini request
- **WHEN** `sendMessage` 收到 `options.modelOptions.deep_research = true`
- **THEN** provider MUST 将该标志翻译为 Gemini 兼容的 Deep Research 请求行为
- **AND** 当该标志缺失或为 `false` 时，provider MUST 保持现有普通聊天请求路径不变

#### Scenario: Stream native agent request through the existing content API
- **WHEN** Gemini provider 收到一个 native agent 执行请求
- **THEN** provider MUST 继续通过现有 `streamGenerateContent` 或等效内容生成流式 endpoint 发出请求
- **AND** 在第一阶段 provider MUST NOT 要求调用方切换到 WebSocket Live API session 模型

### Requirement: Gemini native agent execution MUST support application-managed tool loop in phase one
系统 MUST 允许第一阶段 Gemini native agent 请求通过 Gemini function calling / tools 工作，同时应用侧 runtime MUST 维护多步 tool loop，而不是用新的传输协议包裹整个循环。

#### Scenario: Send tool declarations with a native agent request
- **WHEN** Gemini provider 启动一个 native agent 请求，且当前 agent 具有可用 tool 边界
- **THEN** provider MUST 在 Gemini 请求中包含相应的 tools / function-calling 配置
- **AND** provider MUST 允许应用在收到 tool calls 后继续维护后续循环

#### Scenario: Combine built-in web search with runtime tool declarations
- **WHEN** `AgentRuntime` 发送一个带有 `modelOptions.web_search = true` 的 Gemini native agent 请求
- **THEN** provider MUST 在请求中同时包含 Gemini 原生 Google Search tool 和运行时解析得到的 function declarations
- **AND** provider MUST NOT 因为启用了 web search 就丢弃应用侧 Agent tools

#### Scenario: Consume runtime-resolved tool declarations
- **WHEN** `AgentRuntime` 已为本次请求解析出结构化 tool declarations
- **THEN** Gemini provider MUST 使用这些运行时 tool declarations 来生成 function declarations
- **AND** provider MUST NOT 要求自己直接从原始 `agent.tools` 推导本地工具实现细节

#### Scenario: Consume runtime-augmented agent and workspace context
- **WHEN** `AgentRuntime` 已为本次请求准备好增强后的 Agent / Workspace context
- **THEN** Gemini provider MUST 直接消费这些运行时输入来发出 native agent 请求
- **AND** provider MUST NOT 自行决定是否读取或注入当前活动文件内容
