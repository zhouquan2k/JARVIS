## MODIFIED Requirements

### Requirement: Core interfaces MUST define agent runtime request contracts using resolved agent config
系统 MUST 为 Agent 运行时定义稳定的请求与结果契约，并直接复用当前已解析的 `ResolvedAgentConfig` 作为运行态 Agent 配置，而不是再引入第二套并行的 Agent 配置模型。

#### Scenario: Send the current resolved agent into runtime
- **WHEN** 上层聊天或知识工作区发起一次 Agent 请求
- **THEN** Agent 运行时请求契约 MUST 允许直接携带当前活动的 `ResolvedAgentConfig`
- **AND** 该契约 MUST 同时包含 prompt、上下文历史、附件、模型选项与会话标识等执行所需信息

#### Scenario: Pass workspace context and resolved tool declarations into runtime and provider
- **WHEN** 知识工作区中的 Agent 请求需要使用作用域文件工具
- **THEN** `AgentRuntimeRequest` MUST 能携带当前 `activePath`、`contextProvider` 与可选的 `activeDocument`
- **AND** `AgentRunRequest` MUST 能携带运行时已解析好的工具声明，而不是只依赖原始 `agent.tools`

#### Scenario: Represent the active file as program-provided primary context
- **WHEN** 当前知识工作区节点是一个文件且右栏 Agent 发起请求
- **THEN** Agent 运行时请求契约 MUST 允许把该文件的路径与内容作为结构化上下文一并传递
- **AND** 该上下文 MUST 由程序侧提供，而不是要求模型先调用工具才能获得当前文件内容

#### Scenario: Reuse existing stream result contracts
- **WHEN** Agent 运行时或 Agent-capable provider 返回流式更新与最终结果
- **THEN** 系统 MUST 继续复用既有的 `ProviderStreamUpdate` 与 `ProviderSendResult` 契约
- **AND** 第一阶段 MUST NOT 为 Agent 单独定义新的 UI 事件流结果结构
