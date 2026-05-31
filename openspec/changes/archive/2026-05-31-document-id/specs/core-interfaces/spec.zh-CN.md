中文 | [English](spec.md)

## 新增需求

### 需求：核心接口必须为 IContextProvider 扩展文档 ID 解析方法
`IContextProvider` 必须暴露两个新方法：`resolveDocumentIds`（用于批量 ID 到节点的解析）和 `getDocumentId`（用于路径到 ID 的查找）。这些方法必须作为基础接口的一部分，以便所有 provider 实现（FileSystem、HTTP、mock）都必须实现它们。

#### 场景：批量将文档 ID 解析为上下文节点
- **当** 调用方在上下文 provider 上调用 `resolveDocumentIds(ids: string[])`
- **则** provider 必须返回覆盖所有请求 ID 的 `Map<string, ContextNode | null>`
- **且** 映射到现有文档的 ID 必须解析为其当前 `ContextNode`
- **且** 已删除或未知文档的 ID 必须映射到 `null`

#### 场景：将文档路径解析为其稳定 ID
- **当** 调用方在上下文 provider 上调用 `getDocumentId(path: string)`
- **且** 该路径的文档在 frontmatter 中有 `jarvis_id`
- **则** provider 必须返回该 `jarvis_id` 字符串
- **且** 若文档尚无 ID，provider 必须分配一个并返回

---

### 需求：核心接口必须向 Conversation 和 Task 模型添加 documentIds
`Conversation` 类型必须添加 `documentIds?: string[]` 字段，作为现有 `documentPaths` 的稳定 ID 对应字段。`Task` 类型必须在现有 `documentPath` 旁边添加 `documentId?: string | null` 字段。在迁移窗口期间，两个旧版路径字段必须保留为废弃状态以保证向后兼容。

#### 场景：对话通过稳定 ID 存储文档关联
- **当** 对话被链接到一个或多个文档
- **则** `Conversation` 对象必须在 `documentIds` 中携带关联信息
- **且** `documentIds` 中的每个条目必须是某 `.md` 文档的有效 `jarvis_id`

#### 场景：任务通过稳定 ID 存储文档关联
- **当** 创建或更新带有文档关联的任务
- **则** `Task` 对象必须在 `documentId` 中携带关联信息
- **且** `documentId` 必须是关联 `.md` 文档的 `jarvis_id`，项目级任务为 `null`

#### 场景：迁移期间旧版路径字段保持可读
- **当** 某对话或任务记录在 ID 迁移之前创建
- **且** 仅填充了 `documentPaths` / `documentPath`
- **则** 系统必须继续读取并显示基于路径的关联信息
- **且** 系统必须在首次访问时将记录迁移到 `documentIds` / `documentId`
