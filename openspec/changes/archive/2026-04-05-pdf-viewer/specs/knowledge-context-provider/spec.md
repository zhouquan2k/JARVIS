## MODIFIED Requirements

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
