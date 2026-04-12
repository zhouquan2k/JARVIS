English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Workspace edit tools MUST expose explicit file-editing actions to agents
系统 MUST 为知识工作区 Agent 提供明确命名的文件修订工具，包括 `replace_text_in_file`、`replace_range_in_file`、`insert_text_in_file`、`delete_range_in_file` 与 `write_file`，而不是只提供单一的万能编辑入口。

#### Scenario: Resolve declared edit tools for a scoped agent
- **WHEN** `AgentRuntime` 为当前 `ResolvedAgentConfig` 解析可用工具声明
- **THEN** 系统 MUST 只暴露该 Agent `tools` 中声明过的文件修订工具
- **AND** 模型 MUST 能通过明确工具名区分替换、插入、删除与整文件写入语义

### Requirement: Workspace edit tools MUST apply changes by writing the real file content
系统 MUST 在执行文件修订工具时直接修改真实文件内容，而不是要求模型先生成待确认补丁。

#### Scenario: Apply a range or text replacement
- **WHEN** Agent 调用 `replace_text_in_file`、`replace_range_in_file`、`insert_text_in_file` 或 `delete_range_in_file`
- **THEN** 系统 MUST 先读取当前文件内容，再在程序侧生成修改后的文本，并写回知识文件 Provider
- **AND** 工具执行结果 MUST 反映实际写盘后的状态

#### Scenario: Write a whole file
- **WHEN** Agent 调用 `write_file`
- **THEN** 系统 MUST 按输入模式创建文件或覆盖文件内容
- **AND** 系统 MUST 不要求额外的补丁预览阶段才能落盘

### Requirement: Workspace edit tools MUST record file changes for diff and line-level undo/redo
系统 MUST 在每次文件修订成功后记录 `beforeContent` 与 `afterContent`，以支持 UI 侧 diff 展示以及行级 undo/redo。

#### Scenario: Record a file change after an edit tool succeeds
- **WHEN** 任一文件修订工具成功写回文件
- **THEN** 系统 MUST 生成对应的 `FileChangeRecord`
- **AND** 该记录 MUST 至少包含文件路径、修改前文本和修改后文本

#### Scenario: Undo or redo a file change
- **WHEN** 用户在 UI 中触发某个文件的 undo 或 redo
- **THEN** 系统 MUST 通过程序侧变更服务写回 `beforeContent` 或 `afterContent`
- **AND** `IContextProvider` MUST NOT 被要求直接提供 `undo()` 或 `redo()` 方法
