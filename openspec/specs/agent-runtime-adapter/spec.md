## ADDED Requirements

### Requirement: Agent runtime adapter MUST convert resolved agent config into a stable execution context
系统 MUST 将解析后的 `ResolvedAgentConfig` 转换为平台无关的执行上下文，以便聊天运行时能够在不改变当前 provider 选择逻辑的前提下，把 Agent 身份、说明、模型选择和能力边界传递给大模型执行链路。

#### Scenario: Build execution context from a resolved agent
- **WHEN** 聊天运行时收到一个已解析的 `ResolvedAgentConfig`
- **THEN** 系统 MUST 能生成包含 `name`、`description`、`modelProviderName`、`modelName`、`effectiveInstructions`、`tools`、`skills` 与 `scopePath` 的执行上下文
- **AND** 该执行上下文 MUST 能被上层聊天发送链路稳定消费

### Requirement: Agent runtime adapter MUST support phase-one prompt-envelope execution for existing providers
在现有 provider contract 仍以 `prompt + options` 为中心的前提下，系统 MUST 先通过 prompt envelope 的方式将 Agent 上下文注入模型调用，而不是要求所有 provider 立即支持新的原生工具调用接口。

#### Scenario: Send a knowledge-workspace prompt with agent envelope
- **WHEN** 用户在知识工作区右栏发起一次聊天请求，且当前存在生效 Agent
- **THEN** 系统 MUST 先根据 Agent 指定的模型 Provider / 模型名称选择目标发送链路
- **AND** MUST 将 Agent 名称、职责、核心指令、模型信息和能力边界封装为一段稳定的 prompt envelope
- **AND** 再将该 envelope 与用户 prompt 一并发送给现有 provider

### Requirement: Agent runtime adapter MUST preserve provider compatibility while remaining evolvable
系统 MUST 允许未来将某些 provider 升级为原生 tools / functions 接入，但本次引入的 Agent 运行时适配 MUST 不得破坏当前 `IModelProvider` 的兼容性。

#### Scenario: Keep current provider contracts unchanged in phase one
- **WHEN** 系统为现有 ChatGPT Web、Gemini API、Desktop Proxy 或 Extension Proxy 注入 Agent 上下文
- **THEN** `IModelProvider.sendMessage` 的现有签名 MUST 保持不变
- **AND** 不同 provider MUST 继续可以在不感知新接口签名的情况下完成请求
