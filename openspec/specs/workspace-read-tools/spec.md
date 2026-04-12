English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Workspace read tools MUST expose scoped file-reading capabilities to agents
系统 MUST 为知识工作区 Agent 提供第一批只读工具，包括 `read_current_file`、`list_directory`、`read_file` 与 `search_in_scope`，并且这些工具 MUST 只在当前 Agent 显式声明后才能暴露给模型。

#### Scenario: Resolve declared read tools for a scoped agent
- **WHEN** `AgentRuntime` 为当前 `ResolvedAgentConfig` 解析可用工具声明
- **THEN** 系统 MUST 只暴露该 Agent `tools` 中声明过的只读工具
- **AND** 每个工具声明 MUST 至少包含稳定的工具名、描述和输入 schema

### Requirement: Workspace read tools MUST support reading the current file and arbitrary files
系统 MUST 允许 Agent 读取当前激活文件，以及读取知识工作区中任意指定文件的内容，以支持作用域问答、文档总结和后续修订前的上下文分析。

#### Scenario: Read the current active file
- **WHEN** Agent 调用 `read_current_file`
- **THEN** 系统 MUST 使用当前工作区 `activePath` 读取对应文件内容
- **AND** 若当前没有激活文件，系统 MUST 返回明确错误而不是静默降级

#### Scenario: Read a file by explicit path
- **WHEN** Agent 调用 `read_file` 并提供目标路径
- **THEN** 系统 MUST 通过知识文件 Provider 读取该路径对应文档
- **AND** 返回结果 MUST 至少包含文件路径与文本内容

### Requirement: Workspace read tools MUST support directory listing and scope search
系统 MUST 允许 Agent 查看目录下的子节点，并在当前 Agent 作用域内搜索文件内容，以支持面向知识工作区的发现、定位和引用。

#### Scenario: List a directory
- **WHEN** Agent 调用 `list_directory` 并提供目录路径
- **THEN** 系统 MUST 返回该目录下的文件与目录节点集合
- **AND** 每个节点 MUST 至少包含路径、名称与节点类型

#### Scenario: Search within the current agent scope
- **WHEN** Agent 调用 `search_in_scope` 并提供查询字符串
- **THEN** 系统 MUST 基于当前 `agent.scopePath` 限定搜索范围
- **AND** 返回结果 MUST 至少包含命中文件路径、行列位置与预览文本
