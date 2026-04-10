## MODIFIED Requirements

### Requirement: Knowledge context provider MUST support tree listing and node creation
知识文件 Provider MUST 通过 `getContext()` 一次返回完整工作区上下文，而不是继续暴露逐层 `listTree(parentPath)` 目录枚举接口。该上下文 MUST 至少包含完整目录树、节点级 `isAgentOwner + agentKey` 元数据以及所有可被节点引用的 `agentConfigs` 缓存。Provider MUST 同时继续支持按父路径创建文件或目录节点，以满足左侧文件浏览与基本文件管理能力。对于通过 `linkDir` 声明的挂载目录，`getContext()` 返回的 `nodes` MUST 将其呈现为顶层目录节点，而不是暴露底层真实目录结构。

#### Scenario: Return the full workspace context in one call
- **WHEN** 工作区请求知识上下文数据
- **THEN** Provider MUST 通过 `getContext()` 返回完整工作区上下文
- **AND** 返回结果 MUST 包含完整目录树与 `agentConfigs`

#### Scenario: Include mounted top-level directories in the workspace context
- **WHEN** 根目录下某个空目录通过 `.agent.json` 声明了 `linkDir`
- **THEN** Provider MUST 将该目录作为顶层节点返回
- **AND** 该顶层节点下的子树 MUST 来自 `linkDir` 指向的真实目录

#### Scenario: Reject mixed-content mount roots
- **WHEN** 声明挂载的顶层目录除了 `.agent.json` 之外还包含其他可见文件或子目录
- **THEN** Provider MUST 将该目录视为非法挂载入口
- **AND** Provider MUST NOT 将它与真实目标目录混合成一个上下文节点

#### Scenario: Create a file or directory node
- **WHEN** 用户在知识工作区中新建文件或目录
- **THEN** Provider MUST 按给定父路径和节点类型创建目标节点
- **AND** 后续重新获取工作区上下文时 MUST 能看到该新节点

### Requirement: Knowledge context provider MUST support Markdown document read and write
知识文件 Provider MUST 提供面向单文档的读取和写入能力，使知识工作区可以加载并保存当前激活的用户文档。该契约 MUST 升级为 MIME-aware document 语义：读取结果 MUST 返回统一的 `mimeType + dataBase64` 载荷，文本 viewer 负责自行解码；写入入口 MUST 继续允许文本文档保存，同时对只读文档显式表达不可写状态。对于挂载目录内的文档，Provider MUST 通过虚拟路径定位到真实目标目录中的文件，但返回给上层的 `path` MUST 保持挂载后的虚拟路径。

#### Scenario: Read a document by path
- **WHEN** 工作区请求读取某个文档路径
- **THEN** Provider MUST 返回该文档的 `path`、`mimeType` 和 `dataBase64`
- **AND** 返回结果 MAY 包含 `updatedAt`、`version` 或 `canWrite` 等附加元数据

#### Scenario: Read a mounted document through its virtual path
- **WHEN** 工作区请求读取挂载目录中的 `/reports/summary.md`
- **THEN** Provider MUST 将其解析到挂载目标目录中的真实文件
- **AND** 返回结果中的 `path` MUST 仍然是 `/reports/summary.md`

#### Scenario: Write a text document by path
- **WHEN** 工作区请求将经由文本 viewer 序列化得到的文档内容写回某个路径
- **THEN** Provider MUST 通过统一的 `writeDocument` 契约持久化该文档的新内容
- **AND** 后续再次读取该路径时 MUST 能得到更新后的 `dataBase64`

#### Scenario: Write a mounted text document through its virtual path
- **WHEN** 工作区请求写回挂载目录中的 `/reports/summary.md`
- **THEN** Provider MUST 将写入落到挂载目标目录对应的真实文件
- **AND** 后续通过同一虚拟路径再次读取时 MUST 能看到更新

### Requirement: Knowledge context provider MUST support scope search for agent tools
知识文件 Provider MUST 提供作用域搜索能力，以支持 `search_in_scope` 在当前知识工作区中定位相关文件内容。搜索范围 MUST 以当前请求的虚拟路径为准，挂载目录内的搜索结果 MUST 继续返回虚拟路径，而不是泄露底层真实目录路径。

#### Scenario: Search content within the current knowledge scope
- **WHEN** 工作区或 Agent 工具请求执行一次作用域搜索
- **THEN** Provider MUST 返回符合查询条件的命中集合
- **AND** 每个结果 MUST 至少包含文件路径、行列位置与预览文本

#### Scenario: Return mounted search results using virtual paths
- **WHEN** 搜索命中来自挂载目录 `/reports`
- **THEN** 每个结果的 `path` MUST 以 `/reports/...` 形式返回
- **AND** 系统 MUST NOT 暴露底层真实目录路径

### Requirement: Knowledge context provider MUST expose agent ownership and effective agent metadata on nodes
知识文件 Provider MUST 在 `getContext()` 返回的节点结构上同时表达“目录是否直接拥有 Agent”与“节点当前生效 Agent 是谁”。其中 `isAgentOwner` MUST 表示目录是否直接存在 `.agent.json`，`agentKey` MUST 表示节点当前生效的 Agent，并且该 key MUST 能在同一次返回的 `agentConfigs` 中找到对应配置。对于挂载目录，`isAgentOwner` 与 `agentKey` MUST 基于挂载后的虚拟目录计算，而不是基于真实目录的物理路径计算。

#### Scenario: Mark an owner directory in the workspace context
- **WHEN** 某个目录自身直接存在 `.agent.json`
- **THEN** Provider MUST 将该目录节点标记为 `isAgentOwner = true`
- **AND** 该节点 MUST 继续携带当前生效的 `agentKey`

#### Scenario: Preserve agent metadata on mounted directories
- **WHEN** 某个挂载目录自身直接存在 `.agent.json`
- **THEN** Provider MUST 仍然把该挂载目录标记为 Agent owner
- **AND** 该节点的 `agentKey` MUST 能在 `agentConfigs` 中找到对应配置
