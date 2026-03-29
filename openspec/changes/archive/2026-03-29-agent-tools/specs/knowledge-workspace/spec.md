## MODIFIED Requirements

### Requirement: Knowledge workspace MUST provide a default assistant pane that is bound to the active scope agent
知识工作区的右栏 MUST 默认渲染真实的 AI 对话 pane，并将其绑定到当前激活文件或目录解析得到的生效 Agent 上下文，而不是始终以全局固定的通用聊天身份运行。该 pane MUST 继续复用现有聊天视图，但其发送链路 MUST 感知当前作用域 Agent 的名称、目标模型、指令和能力边界，并在第一阶段通过 `AgentRuntime` 驱动 Gemini 原生 Agent 或普通聊天 fallback。

#### Scenario: Render the default assistant pane with the active scope agent
- **WHEN** 宿主进入知识工作区且当前激活节点已经解析出一个生效 Agent
- **THEN** 系统 MUST 在右栏渲染默认的 `KnowledgeAssistantPane`
- **AND** 该 pane MUST 继续复用现有聊天视图并通过 `AgentRuntime` 发送当前 Agent 上下文请求，而不是忽略文件树作用域

#### Scenario: Pass workspace context with assistant requests
- **WHEN** 知识工作区右栏 Agent 发送一次请求
- **THEN** 系统 MUST 将当前 `activePath`、`contextProvider` 以及可用的 `activeDocument` 一并传给 `AgentRuntime`
- **AND** 后续文件工具执行 MUST 能使用这组工作区上下文

#### Scenario: Treat the active file as the primary context for the request
- **WHEN** 当前选中的知识工作区节点是文件且右栏 Agent 发送请求
- **THEN** 系统 MUST 将该文件内容作为本次请求的 primary context 注入模型输入
- **AND** 模型仍然 MAY 按需使用作用域内工具补充相关信息

#### Scenario: Fall back to the default agent in the assistant pane
- **WHEN** 当前激活节点及其父目录都不存在 `.agent.json`
- **THEN** 右栏 AI pane MUST 退回到全局默认 Agent
- **AND** 用户仍然 MUST 可以继续以普通聊天方式使用该 pane

#### Scenario: Selecting a directory updates the effective assistant agent immediately
- **WHEN** 用户在知识工作区左侧点击一个目录节点，但未打开新文件
- **THEN** 系统 MUST 立即以该目录路径重新解析并切换右栏生效 Agent
- **AND** 系统 MUST NOT 要求用户必须先打开该目录下的文件才更新右栏身份

## ADDED Requirements

### Requirement: Knowledge workspace MUST surface file changes with line-level undo and redo
知识工作区 MUST 为文件修订结果提供 diff 展示与行级 undo/redo 入口，以支持用户理解和回退 Agent 写盘后的变更。

#### Scenario: Show the latest file change as a line diff
- **WHEN** 某个文件修订工具成功修改当前工作区文件
- **THEN** UI MUST 能根据修改前后文本展示 line diff
- **AND** 该 diff MUST 不依赖 LLM 预先生成补丁数据

#### Scenario: Trigger undo or redo from the workspace UI
- **WHEN** 用户在工作区中触发文件 undo 或 redo
- **THEN** 系统 MUST 通过程序侧文件变更服务写回对应内容
- **AND** 写回后再次读取该文件时 MUST 能得到更新后的文本
