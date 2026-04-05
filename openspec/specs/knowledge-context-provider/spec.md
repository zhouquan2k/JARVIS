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
知识文件 Provider MUST 能列出目录树节点，并支持按父路径创建文件或目录节点，以满足左侧文件浏览与基本文件管理能力。

#### Scenario: List child nodes under a directory
- **WHEN** 工作区请求某个父路径下的子节点列表
- **THEN** Provider MUST 返回该层级下的文件和目录节点集合
- **AND** 每个节点 MUST 至少包含路径、名称和节点类型

#### Scenario: Create a file or directory node
- **WHEN** 用户在知识工作区中新建文件或目录
- **THEN** Provider MUST 按给定父路径和节点类型创建目标节点
- **AND** 返回结果 MUST 能用于刷新左侧文件树

### Requirement: Knowledge context provider MUST support Markdown document read and write
知识文件 Provider MUST 提供面向单文档的读取和写入能力，使知识工作区可以加载并保存当前激活的用户文档。该契约 MUST 升级为 MIME-aware document 语义：读取结果 MUST 返回统一的 `mimeType + dataBase64` 载荷，文本 viewer 负责自行解码；写入入口 MUST 继续允许文本文档保存，同时对只读文档显式表达不可写状态。

#### Scenario: Read a document by path
- **WHEN** 工作区请求读取某个文档路径
- **THEN** Provider MUST 返回该文档的 `path`、`mimeType` 和 `dataBase64`
- **AND** 返回结果 MAY 包含 `updatedAt`、`version` 或 `canWrite` 等附加元数据

#### Scenario: Write a text document by path
- **WHEN** 工作区请求将经由文本 viewer 序列化得到的文档内容写回某个路径
- **THEN** Provider MUST 通过统一的 `writeDocument` 契约持久化该文档的新内容
- **AND** 后续再次读取该路径时 MUST 能得到更新后的 `dataBase64`

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
知识文件 Provider MUST 提供作用域搜索能力，以支持 `search_in_scope` 在当前知识工作区中定位相关文件内容。

#### Scenario: Search content within the current knowledge scope
- **WHEN** 工作区或 Agent 工具请求执行一次作用域搜索
- **THEN** Provider MUST 返回符合查询条件的命中集合
- **AND** 每个结果 MUST 至少包含文件路径、行列位置与预览文本

#### Scenario: Report unsupported search capability explicitly
- **WHEN** 某个具体宿主暂未实现 `searchInScope`
- **THEN** 系统 MUST 明确报告该能力暂不支持
- **AND** MUST NOT 静默回退到隐式递归扫描实现
