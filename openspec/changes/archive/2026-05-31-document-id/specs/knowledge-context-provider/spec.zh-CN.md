中文 | [English](spec.md)

## 新增需求

### 需求：知识上下文 provider 必须阻止跨 agent 移动
`IContextProvider.moveNode` 必须拒绝任何源文档所属 agent 与目标父目录所属 agent 不同的移动操作。节点的 agent 定义为在当前 `WorkspaceContext` 中携带 `agentKey` 的最近祖先目录。此拦截必须在 provider 层执行，不能仅依赖 UI 层。

#### 场景：允许 agent 内移动
- **当** 用户将文档移动到同一 agent 内的不同目录
- **且** 源和目标父目录共享相同的 `agentKey`
- **则** provider 必须完成移动并更新 `DocumentIdentityIndex`
- **且** frontmatter 中文档的 `jarvis_id` 必须保持不变

#### 场景：拒绝跨 agent 移动
- **当** 用户尝试将文档移动到属于不同 agent 的目录
- **且** 源 `agentKey` 与目标父目录的 `agentKey` 不同
- **则** provider 必须抛出包含清晰说明的错误，表明不支持跨 agent 移动
- **且** 文档必须保留在其原始位置

#### 场景：允许 agent 内目录改名
- **当** 用户重命名其 agent 内的目录
- **则** provider 必须完成改名
- **且** 必须为改名目录下所有 `.md` 文档更新 `DocumentIdentityIndex`

---

### 需求：知识上下文 provider 必须在改名和移动时更新 DocumentIdentityIndex
作为每次成功的 `renameNode` 和 `moveNode` 操作的一部分，provider 必须在返回结果前调用 `DocumentIdentityIndex.remap(fromPath, toPath)`。索引更新必须与文件系统操作同步——不允许最终一致性。

#### 场景：索引与文件系统改名原子更新
- **当** `renameNode` 成功完成文件系统改名
- **则** provider 必须在返回前更新被改名节点（以及目录情况下所有后代）的 `DocumentIdentityIndex`
- **且** 改名后任何并发的 `resolveDocumentIds` 调用必须返回新路径

#### 场景：改名失败时不更新索引
- **当** `renameNode` 在文件系统层失败
- **则** provider 不得更新 `DocumentIdentityIndex`
- **且** 后续 ID 解析必须仍返回原始路径
