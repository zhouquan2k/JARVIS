## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Agent runtime adapter MUST pass workspace context into tool execution
系统 MUST 在知识工作区场景下把当前工作区上下文传递给工具执行层，以便文件工具可以使用当前激活路径和知识文件 Provider。

#### Scenario: Execute a scoped file tool from the knowledge workspace
- **WHEN** Agent 在知识工作区中触发某个文件工具
- **THEN** `AgentRuntime` MUST 将当前 `activePath` 与 `contextProvider` 传入工具执行上下文
- **AND** 文件工具 MUST 能基于这些上下文访问当前工作区内容

### Requirement: Agent runtime adapter MUST inject the active file as primary request context when available
系统 MUST 在知识工作区当前节点为文件时，将该文件内容作为本次请求的主要上下文注入到模型请求中；该职责属于程序侧上下文增强，而不是默认 Agent instruction 的实现细节。

#### Scenario: Include the current file in both native and fallback request paths
- **WHEN** 右栏 Agent 请求对应的当前节点是一个文件
- **THEN** `AgentRuntime` MUST 将该文件路径与内容加入本次模型请求的上下文增强结果
- **AND** 该规则 MUST 同时适用于 native agent 路径与 fallback 聊天路径
