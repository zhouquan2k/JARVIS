## ADDED Requirements

### Requirement: Agent runtime adapter MUST route requests through a dedicated agent runtime
系统 MUST 在现有 `ProviderRuntime` 之上提供独立的 Agent 调度层，用于接收当前生效的 Agent 配置、选择目标 provider / model，并统一处理原生 Agent 路径与普通聊天 fallback，而不是把这部分逻辑散落在 UI store 或基础 provider 接口中。

#### Scenario: Receive the current resolved agent config from UI
- **WHEN** 知识工作区或普通聊天链路携带当前活动的 `ResolvedAgentConfig` 发起一次请求
- **THEN** 系统 MUST 先将该配置传递给 `AgentRuntime`
- **AND** `AgentRuntime` MUST 使用该配置决定目标 provider、模型与执行路径

### Requirement: Agent runtime adapter MUST prefer native agent execution when supported
系统 MUST 在 provider 支持原生 Agent 能力时优先走原生 Agent 执行链路；若当前 provider 不支持该能力，则 MUST 自动回退到现有普通聊天路径，并且两条路径都只允许由程序侧追加当前文件上下文，而不是额外组织 Agent/Tools 文本 prompt。

#### Scenario: Route to native agent provider with resolved tools
- **WHEN** `AgentRuntime` 解析到目标 provider 实现了 `IAgentCapableProvider`
- **THEN** 系统 MUST 调用该 provider 的原生 Agent 执行入口
- **AND** MUST 将当前 `ResolvedAgentConfig`、请求上下文以及运行时已解析的工具声明继续传递给该入口

#### Scenario: Execute provider tool calls through the shared tool executor
- **WHEN** 原生 Agent 返回工具调用请求
- **THEN** `AgentRuntime` MUST 通过共享的工具执行层执行该调用
- **AND** MUST 将工具结果回填到后续模型轮次，而不是继续返回未实现占位结果

#### Scenario: Fall back with active-file-only augmentation
- **WHEN** `AgentRuntime` 解析到目标 provider 未实现 `IAgentCapableProvider`
- **THEN** 系统 MUST 回退到现有 `sendMessage` 路径
- **AND** MUST 只通过程序侧 helper 追加可用的当前文件上下文
- **AND** MUST NOT 额外组织 Agent 身份、工具列表或技能列表文本

### Requirement: Agent runtime adapter MUST reuse existing stream update contracts in phase one
系统 MUST 在第一阶段继续复用当前 `text + annotations` 流式快照契约，使 UI 可以在不引入新事件流协议的前提下消费 Gemini Agent 的返回结果。

#### Scenario: Stream native agent output through the existing UI contract
- **WHEN** `AgentRuntime` 驱动一次 Gemini 原生 Agent 请求
- **THEN** 上层 `onUpdate` 回调 MUST 继续收到标准化的 `ProviderStreamUpdate`
- **AND** 最终完成态 MUST 继续返回标准化的 `ProviderSendResult`

### Requirement: Agent runtime adapter MUST pass workspace context into tool execution
系统 MUST 在知识工作区场景下把当前工作区上下文传递给工具执行层，以便文件工具可以使用当前激活路径和知识文件 Provider。

#### Scenario: Execute a scoped file tool from the knowledge workspace
- **WHEN** Agent 在知识工作区中触发某个文件工具
- **THEN** `AgentRuntime` MUST 将当前 `activePath` 与 `contextProvider` 传入工具执行上下文
- **AND** 文件工具 MUST 能基于这些上下文访问当前工作区内容

### Requirement: Agent runtime adapter MUST attach the active file with a stable prompt hint when available
系统 MUST 在知识工作区当前节点为文件时，以程序侧方式将该文件纳入本次模型请求：若该文件的 `mimeType` 被当前 provider 接受，则系统 MUST 将该文件作为附件发送；若该文件是文本文件，系统 MUST 同时在正文前追加一段稳定提示，说明当前文档已经作为附件提供，而不是把全文直接注入 prompt。该职责属于程序侧上下文增强，而不是默认 Agent instruction 的实现细节。

#### Scenario: Include the current text file as attachment plus stable prompt hint
- **WHEN** 右栏 Agent 请求对应的当前节点是一个文件
- **AND** 当前 provider 接受该文件的 `mimeType`
- **THEN** `AgentRuntime` MUST 将该文件作为附件加入本次模型请求
- **AND** 若该文件是文本文件，`AgentRuntime` MUST 在最终 prompt 中追加一段稳定提示，说明当前文档已作为附件提供
- **AND** 该规则 MUST 同时适用于 native agent 路径与 fallback 聊天路径

#### Scenario: Omit the active file when the provider rejects its MIME type
- **WHEN** 右栏 Agent 请求对应的当前节点是一个文件
- **AND** 当前 provider 不接受该文件的 `mimeType`
- **THEN** `AgentRuntime` MUST NOT 将该文件作为附件自动发送
- **AND** 系统 MAY 继续发送原始用户提示词，但 MUST NOT 伪造该文件已被纳入实际请求
