中文 | [English](proposal.md)

## 为什么

当前，对话和任务通过文件路径（`documentPaths`、`documentPath`）引用文档。当文档在 agent 内改名或移动时，所有关联的对话和任务会静默失联。通过在 Markdown frontmatter 中存储稳定文档 ID，可以将文档身份与存储位置解耦，使 agent 内的改名和移动操作对关系数据零成本。

## 变更内容

- 每个 Markdown 文档（`.md`）在首次访问时，在 YAML frontmatter 中分配唯一且不可变的 `id` 字段。
- `Conversation.documentPaths` 和 `Task.documentPath` 替换为引用稳定 ID 的 `documentIds` / `documentId`。
- 启动时通过扫描 frontmatter 构建内存中的 `DocumentIdentityIndex`（`id → 当前路径`）；所有查询通过该索引进行。
- `IContextProvider.renameNode` 和 `moveNode` 原地更新索引——无需重写任何关系数据。
- 文档内部引用（图片、其他文档链接）从相对路径改为**agent 绝对路径**（以最近的 agent/project 文件夹为根），使引用方文档可在 agent 内自由移动而不断链。
- 本次变更**不支持跨 agent 移动**；尝试跨 agent 操作将在 UI 层报硬错误。
- 范围：仅 `.md` 文件。非 markdown 文件、目录和二进制资源不在稳定 ID 的范围内。

## 能力

### 新增能力

- `document-identity`：稳定 ID 分配、frontmatter 读写、内存索引生命周期，以及 `IContextProvider` 扩展，用于基于 ID 的文档解析。

### 修改能力

- `core-interfaces`：`IContextProvider` 新增 `resolveDocumentIds(ids)` 并发出 `DocumentIdentityChanged` 事件；`Conversation` 和 `Task` 模型将路径字段替换为 ID 字段。
- `knowledge-workspace`：改名/移动操作在跨 agent 边界时进行拦截；编辑器为新插入的图片/文档链接使用 agent 绝对路径（而非相对路径）。
- `knowledge-context-provider`：`FileSystemContextProvider.renameNode` / `moveNode` 作为操作的一部分更新 `DocumentIdentityIndex`。

## 影响范围

- **packages/core**：`Conversation`、`Task` 接口；`IContextProvider`
- **packages/node**：`FileSystemContextProvider`、`FileSystemTaskProvider`
- **packages/ui**：`documentWorkspace` store、`chat` store、编辑器链接插入逻辑
- **apps/server**：`syncRepository`（对话/任务持久化）、同步协议
- **apps/desktop**：新增 `resolveDocumentIds` 调用的 IPC bridge
- **数据迁移**：现有 `documentPaths` / `documentPath` 值需在工作区打开时回填为 ID；需要带回滚窗口的单向迁移。
