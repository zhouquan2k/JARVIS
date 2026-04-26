## ADDED Requirements

### Requirement: Knowledge workspace MUST merge an eligible agent conversation into the active Q/A document
知识工作区 MUST 支持将当前满足条件的 agent 对话的全部可见消息历史归档到当前活动的可写 Markdown 文档中。归档时，系统 MUST 将该文档视为单个 Q/A 文件：用户消息只合并进 `Q`，助手消息只合并进 `A`，并在旧段落已被新内容覆盖时保留最新有效内容。

#### Scenario: Archive the full visible conversation into the active document
- **WHEN** 用户对绑定到当前活动可写 Markdown 文档的满足条件 agent 对话触发归档
- **THEN** 系统 MUST 使用该对话的全部可见消息作为归档输入
- **AND** 系统 MUST 仅将用户消息合并到 `Q`
- **AND** 系统 MUST 仅将助手消息合并到 `A`

#### Scenario: Ignore deleted messages during archive
- **WHEN** 当前对话中包含软删除消息
- **THEN** 系统 MUST 在归档输入中排除这些已删除消息

### Requirement: Knowledge workspace MUST split Q and A by the first standard markdown divider
知识工作区的归档流程 MUST 仅使用当前文档中的首个 Markdown 标准水平分割线来识别顶层 `Q` / `A` 边界。如果文档中不存在这样的分割线，系统 MUST 先在文档末尾补一个 `---`，再生成合并结果。`***` MUST NOT 被视为归档分割线。

#### Scenario: Split Q and A by the first valid divider
- **WHEN** 当前 Markdown 文档中包含一个或多个合法的 Markdown 标准分割线
- **THEN** 系统 MUST 只使用首个合法分割线作为顶层 `Q` / `A` 边界
- **AND** 后续分割线 MUST 继续作为普通文档内容的一部分

#### Scenario: Insert divider when the document has no archive boundary
- **WHEN** 当前 Markdown 文档中不存在合法的归档分割线
- **THEN** 系统 MUST 先在文档末尾追加 `---` 来建立 `Q` / `A` 边界，然后再合并归档内容

#### Scenario: Ignore triple-asterisk divider for archive boundary detection
- **WHEN** 当前 Markdown 文档包含 `***` 但不存在其他合法归档分割线
- **THEN** 系统 MUST NOT 将 `***` 识别为归档边界
- **AND** 系统 MUST 仍然在合并归档内容前补充 `---`

### Requirement: Knowledge workspace MUST preserve diff and undo semantics for archive writes
知识工作区中的归档写回 MUST 通过现有文件变更历史链路执行，而不是直接覆盖文档。归档结果 MUST 成为一条标准工作区文件变更，以便用户查看 diff，并通过 undo/redo 恢复归档前后状态。

#### Scenario: Archive write appears as a normal file change
- **WHEN** 一次归档操作生成了有改动的新文档
- **THEN** 系统 MUST 通过现有工作区文件变更服务记录该归档结果
- **AND** 最新文件变更 diff MUST 能反映本次归档结果

#### Scenario: Undo and redo an archive result
- **WHEN** 用户在一次成功归档写回后触发 undo 或 redo
- **THEN** 系统 MUST 通过现有工作区 undo/redo 流程恢复归档前或归档后的文档内容

#### Scenario: Skip write when archive produces no new content
- **WHEN** 一次归档操作生成的合并结果与当前活动文档完全一致
- **THEN** 系统 MUST NOT 写回文档
- **AND** 系统 MUST 反馈本次归档没有新增内容

### Requirement: Knowledge workspace MUST persist archive state on the local conversation
当一次满足条件的归档成功后，知识工作区 MUST 在当前本地对话上持久化归档元数据，使归档状态在重载页面或重新选择该对话后仍然保留。

#### Scenario: Persist archive metadata after a successful archive
- **WHEN** 一次归档操作为当前本地对话成功写入了有改动或无改动的合并结果
- **THEN** 系统 MUST 在该对话上持久化归档元数据
- **AND** 该元数据 MUST 至少包含归档文档路径，以及能够检测后续对话增长的快照标记

#### Scenario: Mark a conversation stale after new turns are added
- **WHEN** 一个对话已经持久化了归档元数据，且之后又新增了可见消息
- **THEN** 系统 MUST 将该对话的归档状态标记为过期
- **AND** 先前持久化的归档元数据 MUST 继续可用于 UI 展示
