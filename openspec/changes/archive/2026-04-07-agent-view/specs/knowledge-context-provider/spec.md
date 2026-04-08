## MODIFIED Requirements

### Requirement: Knowledge context provider MUST support tree listing and node creation
知识文件 Provider MUST 通过 `getContext()` 一次返回完整工作区上下文，而不是继续暴露逐层 `listTree(parentPath)` 目录枚举接口。该上下文 MUST 至少包含完整目录树、节点级 `isAgentOwner + agentKey` 元数据以及所有可被节点引用的 `agentConfigs` 缓存。Provider MUST 同时继续支持按父路径创建文件或目录节点，以满足左侧文件浏览与基本文件管理能力。

#### Scenario: Return the full workspace context in one call
- **WHEN** 工作区请求知识上下文数据
- **THEN** Provider MUST 通过 `getContext()` 返回完整工作区上下文
- **AND** 返回结果 MUST 包含完整目录树与 `agentConfigs`

#### Scenario: Include nested child nodes in the workspace context
- **WHEN** Provider 返回工作区上下文
- **THEN** 每个目录节点 MUST 能通过 `children` 表达其子树
- **AND** 工作区 MUST NOT 需要再通过逐层 `listTree(parentPath)` 请求来拼装完整目录树

#### Scenario: Create a file or directory node
- **WHEN** 用户在知识工作区中新建文件或目录
- **THEN** Provider MUST 按给定父路径和节点类型创建目标节点
- **AND** 后续重新获取工作区上下文时 MUST 能看到该新节点

## ADDED Requirements

### Requirement: Knowledge context provider MUST expose agent ownership and effective agent metadata on nodes
知识文件 Provider MUST 在 `getContext()` 返回的节点结构上同时表达“目录是否直接拥有 Agent”与“节点当前生效 Agent 是谁”。其中 `isAgentOwner` MUST 表示目录是否直接存在 `.agent.json`，`agentKey` MUST 表示节点当前生效 Agent，并且该 key MUST 能在同一次返回的 `agentConfigs` 中找到对应配置。

#### Scenario: Mark an owner directory in the workspace context
- **WHEN** 某个目录自身直接存在 `.agent.json`
- **THEN** Provider MUST 将该目录节点标记为 `isAgentOwner = true`
- **AND** 该节点 MUST 继续携带当前生效的 `agentKey`

#### Scenario: Provide an effective agent key for every node
- **WHEN** Provider 返回任意一个工作区节点
- **THEN** 该节点 MUST 包含一个可用的 `agentKey`
- **AND** 该 key MUST 对应到 `agentConfigs` 中的一条完整 Agent 配置
