English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Knowledge context provider MUST initialize document access explicitly
系统 MUST 定义独立的知识文件访问接口，用于承载知识工作区所需的访问初始化和文档访问能力。该接口 MUST 与聊天会话存储职责分离。具体宿主或服务端 MAY 在接口外部注入额外配置，例如 `LocalFileContextProvider` 使用的根路径或 `DatabaseContextProvider` 使用的用户 context 映射。

#### Scenario: Initialize knowledge access before reading workspace data
- **WHEN** 宿主准备进入知识工作区并请求访问知识 context 数据
- **THEN** 系统 MUST 通过知识文件 Provider 执行显式的访问初始化
- **AND** 后续目录树和文档读取流程 MUST 建立在该初始化结果之上

#### Scenario: Use backend-specific configuration in a concrete provider
- **WHEN** 具体实现需要使用文件系统根路径或数据库映射信息
- **THEN** Provider MAY 使用这些配置建立自己的访问范围
- **AND** 这些配置来源 MUST 不改变通用知识文件接口的方法集合

### Requirement: Knowledge context provider MUST support tree listing and node creation
知识文件 Provider MUST 通过 `getContext()` 一次返回完整工作区上下文，而不是继续暴露逐层 `listTree(parentPath)` 目录枚举接口。该上下文 MUST 至少包含完整目录树、节点级 `isAgentOwner + agentKey` 元数据以及所有可被节点引用的 `agentConfigs` 缓存。Provider MUST 同时继续支持按父路径创建文件或目录节点，以满足左侧文件浏览与基本文件管理能力。对于通过 `linkDir` 声明的挂载目录，`getContext()` 返回的 `nodes` MUST 将其呈现为顶层目录节点，而不是暴露底层真实目录结构。

#### Scenario: Return the full workspace context in one call
- **WHEN** 工作区请求知识上下文数据
- **THEN** Provider MUST 通过 `getContext()` 返回完整工作区上下文
- **AND** 返回结果 MUST 包含完整目录树与 `agentConfigs`

#### Scenario: Include nested child nodes in the workspace context
- **WHEN** Provider 返回工作区上下文
- **THEN** 每个目录节点 MUST 能通过 `children` 表达其子树
- **AND** 工作区 MUST NOT 需要再通过逐层 `listTree(parentPath)` 请求来拼装完整目录树

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

#### Scenario: Mark read-only documents explicitly
- **WHEN** Provider 读取一个当前不支持写回的文档，例如首版 PDF
- **THEN** 返回结果 MUST 能让上层识别该文档为只读
- **AND** 系统 MUST NOT 假装该文档支持编辑保存

#### Scenario: Create nodes in the current workspace scope
- **WHEN** 工作区请求在某个父目录或根目录下创建文件或目录
- **THEN** Provider MUST 通过统一的 `createNode` 契约返回新节点的路径、名称、类型与父目录信息
- **AND** 后续目录树刷新 MUST 能看到该新节点

#### Scenario: Delete files or directories from the workspace scope
- **WHEN** 工作区请求删除某个非根节点
- **THEN** Provider MUST 支持删除文件
- **AND** 对目录删除 MUST 支持递归删除其全部子内容
- **AND** Provider MUST 拒绝删除根目录 `/`

#### Scenario: Rename files or directories within the same parent scope
- **WHEN** 工作区请求重命名某个非根节点
- **THEN** Provider MUST 通过统一的 `renameNode` 契约完成同级改名
- **AND** 若目标同名节点已存在，Provider MUST 返回明确错误
- **AND** 若重命名的是目录，后续读取目录树时其子节点路径 MUST 反映新的目录前缀

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
知识文件 Provider MUST 在 `getContext()` 返回的节点结构上同时表达“目录是否直接拥有 Agent”与“节点当前生效 Agent 是谁”。其中 `isAgentOwner` MUST 表示目录是否直接存在 `.agent.json`，`agentKey` MUST 表示节点当前生效 Agent，并且该 key MUST 能在同一次返回的 `agentConfigs` 中找到对应配置。对于挂载目录，`isAgentOwner` 与 `agentKey` MUST 基于挂载后的虚拟目录计算，而不是基于真实目录的物理路径计算。

#### Scenario: Mark an owner directory in the workspace context
- **WHEN** 某个目录自身直接存在 `.agent.json`
- **THEN** Provider MUST 将该目录节点标记为 `isAgentOwner = true`
- **AND** 该节点 MUST 继续携带当前生效的 `agentKey`

#### Scenario: Preserve agent metadata on mounted directories
- **WHEN** 某个挂载目录自身直接存在 `.agent.json`
- **THEN** Provider MUST 仍然把该挂载目录标记为 Agent owner
- **AND** 该节点的 `agentKey` MUST 能在 `agentConfigs` 中找到对应配置

### Requirement: Knowledge context provider MUST support document-scoped conversation queries
知识文件 Provider MUST 提供统一的会话只读查询能力，并支持通过文档路径读取关联会话列表，以支持右侧 `AgentPane` 在选中文档时展示该文档的相关对话。该查询能力 MUST 以 `Conversation.documentPaths` 包含目标路径作为主过滤条件，并保持与当前工作区上下文一致的结果语义。

#### Scenario: Return conversations associated with a document path
- **WHEN** 上层工作区请求读取某个文档路径的关联会话列表
- **THEN** Provider MUST 支持 `getConversations({ documentPath })`
- **AND** 返回所有 `documentPaths` 包含该路径的会话
- **AND** 返回结果 MUST 至少包含会话 `id`、`title`、`agentKey`、`documentPaths`、`messages` 与 `updatedAt`

#### Scenario: Match exact document paths instead of fuzzy prefixes
- **WHEN** 两条会话分别关联 `/docs/a.md` 与 `/docs/a.md.bak`
- **THEN** 对 `/docs/a.md` 的会话查询 MUST 只返回前者
- **AND** Provider MUST NOT 通过前缀或模糊匹配混入其他路径

#### Scenario: Return an empty list when no conversations are associated
- **WHEN** 目标文档当前没有任何关联会话
- **THEN** Provider MUST 返回空数组
- **AND** 系统 MUST NOT 将其视为错误

#### Scenario: Preserve compatibility for providers backed by different storage implementations
- **WHEN** 某个具体 Provider 通过本地文件、数据库或其他后端维护知识工作区上下文
- **THEN** 它 MUST 在不改变 `IContextProvider` 统一契约的前提下实现该会话查询能力
- **AND** 上层 UI MUST 无需感知其底层会话存储来源
