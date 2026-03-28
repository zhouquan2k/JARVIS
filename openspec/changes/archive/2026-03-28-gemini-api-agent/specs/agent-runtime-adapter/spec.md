## ADDED Requirements

### Requirement: Agent runtime adapter MUST route requests through a dedicated agent runtime
系统 MUST 在现有 `ProviderRuntime` 之上提供独立的 Agent 调度层，用于接收当前生效的 Agent 配置、选择目标 provider / model，并统一处理原生 Agent 路径与普通聊天 fallback，而不是把这部分逻辑散落在 UI store 或基础 provider 接口中。

#### Scenario: Receive the current resolved agent config from UI
- **WHEN** 知识工作区或普通聊天链路携带当前活动的 `ResolvedAgentConfig` 发起一次请求
- **THEN** 系统 MUST 先将该配置传递给 `AgentRuntime`
- **AND** `AgentRuntime` MUST 使用该配置决定目标 provider、模型与执行路径

### Requirement: Agent runtime adapter MUST prefer native agent execution when supported
系统 MUST 在 provider 支持原生 Agent 能力时优先走原生 Agent 执行链路；若当前 provider 不支持该能力，则 MUST 自动回退到现有 prompt-envelope 普通聊天路径，以保持兼容性。

#### Scenario: Route to native agent provider
- **WHEN** `AgentRuntime` 解析到目标 provider 实现了 `IAgentCapableProvider`
- **THEN** 系统 MUST 调用该 provider 的原生 Agent 执行入口
- **AND** MUST 将当前 `ResolvedAgentConfig` 与请求上下文继续传递给该入口

#### Scenario: Fall back to prompt-envelope execution
- **WHEN** `AgentRuntime` 解析到目标 provider 未实现 `IAgentCapableProvider`
- **THEN** 系统 MUST 回退到现有 `sendMessage` 路径
- **AND** MUST 继续通过 prompt envelope 注入 Agent 身份、指令与能力边界

### Requirement: Agent runtime adapter MUST reuse existing stream update contracts in phase one
系统 MUST 在第一阶段继续复用当前 `text + annotations` 流式快照契约，使 UI 可以在不引入新事件流协议的前提下消费 Gemini Agent 的返回结果。

#### Scenario: Stream native agent output through the existing UI contract
- **WHEN** `AgentRuntime` 驱动一次 Gemini 原生 Agent 请求
- **THEN** 上层 `onUpdate` 回调 MUST 继续收到标准化的 `ProviderStreamUpdate`
- **AND** 最终完成态 MUST 继续返回标准化的 `ProviderSendResult`
