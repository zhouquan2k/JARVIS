## ADDED Requirements

### Requirement: Core interfaces MUST define standardized agent binding types
系统 MUST 在共享核心接口层定义标准化的 Agent 配置与解析结果类型，以表达目录作用域 Agent 的名称、职责、核心指令、目标模型 Provider、目标模型名称、工具、技能、继承策略和最终生效结果。

#### Scenario: Express scoped agent configuration in shared types
- **WHEN** 共享层需要描述某个目录中的 `.agent.json`
- **THEN** 系统 MUST 提供 `AgentConfig` 或等价类型来表达 `name`、`instructions`、`modelProviderName`、`modelName`、`tools`、`skills` 与 `inheritance`
- **AND** 这些类型 MUST 可被 Web、Desktop 和 Extension 的共享逻辑直接复用

### Requirement: Core interfaces MUST define a resolved agent contract for runtime consumption
系统 MUST 定义标准化的已解析 Agent 结构，使解析器与聊天运行时之间可以通过稳定契约传递作用域路径、配置来源和最终指令文本，而不是依赖宿主私有对象。

#### Scenario: Describe the effective agent after scope resolution
- **WHEN** provider 完成最近父级查找、`override` 截断与默认兜底
- **THEN** 系统 MUST 提供 `ResolvedAgentConfig` 或等价契约来表达最终生效的 Agent
- **AND** 该契约 MUST 包含 `scopePath`、`sourcePaths`、模型信息和最终指令内容

### Requirement: IContextProvider MUST own scoped agent resolution
系统 MUST 通过 `IContextProvider` 或等价 provider contract 暴露“按节点解析生效 Agent”的统一能力，而不是要求 UI 或独立调用方自行读取 `.agent.json` 并回溯父级目录。

#### Scenario: Resolve the effective scoped agent through the provider
- **WHEN** 上层传入一个当前选中的文件或目录节点路径
- **THEN** `IContextProvider` MUST 直接返回该节点对应的 `ResolvedAgentConfig`
- **AND** 该结果 MUST 已经包含默认兜底、作用域路径与配置来源信息
