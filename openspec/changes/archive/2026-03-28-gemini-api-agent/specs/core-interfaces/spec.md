## ADDED Requirements

### Requirement: Core interfaces MUST define an optional agent-capable model provider extension
系统 MUST 在保持 `IModelProvider` 兼容性的前提下，定义可选的 Agent-capable provider 扩展契约，以表达某个模型 provider 具备原生 Agent 执行能力，而不是要求所有 provider 一起升级到新的必选接口。

#### Scenario: Preserve the base model provider contract
- **WHEN** 现有 ChatGPT Web、Desktop Proxy、Extension Proxy 或其他普通模型 provider 未实现 Agent 能力
- **THEN** 它们 MUST 继续仅通过 `IModelProvider` 契约工作
- **AND** 系统 MUST NOT 因 Agent 扩展而要求这些 provider 修改既有 `sendMessage` 签名

#### Scenario: Declare native agent capability on a provider
- **WHEN** 某个 provider 需要暴露原生 Agent 执行入口
- **THEN** 系统 MUST 允许该 provider 通过 `IAgentCapableProvider extends IModelProvider` 或等价契约声明能力
- **AND** 该扩展契约 MUST 至少表达能力声明接口与原生 Agent 执行入口

### Requirement: Core interfaces MUST define agent runtime request contracts using resolved agent config
系统 MUST 为 Agent 运行时定义稳定的请求与结果契约，并直接复用当前已解析的 `ResolvedAgentConfig` 作为运行态 Agent 配置，而不是再引入第二套并行的 Agent 配置模型。

#### Scenario: Send the current resolved agent into runtime
- **WHEN** 上层聊天或知识工作区发起一次 Agent 请求
- **THEN** Agent 运行时请求契约 MUST 允许直接携带当前活动的 `ResolvedAgentConfig`
- **AND** 该契约 MUST 同时包含 prompt、上下文历史、附件、模型选项与会话标识等执行所需信息

#### Scenario: Reuse existing stream result contracts
- **WHEN** Agent 运行时或 Agent-capable provider 返回流式更新与最终结果
- **THEN** 系统 MUST 继续复用既有的 `ProviderStreamUpdate` 与 `ProviderSendResult` 契约
- **AND** 第一阶段 MUST NOT 为 Agent 单独定义新的 UI 事件流结果结构
