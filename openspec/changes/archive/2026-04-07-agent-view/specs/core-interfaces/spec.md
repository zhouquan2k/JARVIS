## ADDED Requirements

### Requirement: Core interfaces MUST define workspace context contracts for knowledge workspaces
系统 MUST 为知识工作区定义统一的 `WorkspaceContext` 契约，并要求 `IContextProvider` 通过 `getContext()` 返回该契约，而不是继续依赖逐层目录枚举与路径级 Agent 解析。`WorkspaceContext` MUST 同时提供完整目录树与 `agentConfigs` 缓存，使 UI 能够直接通过 `agentKey` 获取当前生效 Agent。

#### Scenario: Return workspace context from the context provider
- **WHEN** 上层知识工作区请求上下文数据
- **THEN** `IContextProvider` MUST 提供 `getContext(): Promise<WorkspaceContext>`
- **AND** 返回结果 MUST 至少包含 `nodes` 与 `agentConfigs`

#### Scenario: Reference agent configs by agent key
- **WHEN** 某个节点声明了自己的 `agentKey`
- **THEN** `WorkspaceContext.agentConfigs` MUST 包含与该 key 对应的完整 `ResolvedAgentConfig`
- **AND** 上层 UI MUST 能仅通过 `agentKey + agentConfigs` 获取当前 Agent，而不再依赖路径级解析

### Requirement: Core interfaces MUST define hierarchical context nodes with agent metadata
系统 MUST 将知识工作区节点定义为层级结构，而不是仅支持按父路径分页式枚举。`ContextNode` MUST 支持 `children`、`isAgentOwner` 与 `agentKey`，其中 `isAgentOwner` 表示目录是否直接拥有 `.agent.json`，`agentKey` 表示该节点当前生效的 Agent。

#### Scenario: Represent the full tree through nested children
- **WHEN** `IContextProvider.getContext()` 返回目录树
- **THEN** `ContextNode` MUST 能通过 `children` 表达完整子树结构
- **AND** 上层 MUST 可以仅基于这棵树完成目录遍历与节点查找

#### Scenario: Represent owner and effective agent separately
- **WHEN** `ContextNode` 表达一个目录节点
- **THEN** 该节点 MUST 能独立表达 `isAgentOwner` 与 `agentKey`
- **AND** 系统 MUST NOT 把“目录直接拥有 Agent”与“节点当前生效 Agent”混为同一个字段

### Requirement: Agent configs MUST automatically inherit from system fallback via merge
系统 MUST 去除 `.agent.json` 中复杂的 `override` 和 `merge` 声明属性，所有的 Agent 配置 MUST 隐式使用 `merge` 逻辑进行自顶向下的合并。同时，系统的全局兜底配置（Fallback）MUST 作为合并链路的最底层基底（Base），从而使得即使是最深层的子目录也能天然继承到基础的工具能力和指令。

#### Scenario: Subfolder config without explicit tools
- **WHEN** 子目录的 `.agent.json` 只定义了 `modelName` 而没有定义 `tools`
- **THEN** `resolveScopedAgentConfig` MUST 将系统的 fallback `tools` 完好地合并进来
- **AND** 该子目录的 Agent 应当同时具备自定义的模型名称和全局默认的工具列表

#### Scenario: No override keyword needed
- **WHEN** 用户希望完全修改上级设置
- **THEN** 用户只需在 `.agent.json` 中显式提供自身的属性（例如重新提供空工具列表或全套属性）
- **AND** 系统不再需要通过特殊的 `inheritance: 'override'` 语法来截断继承链
