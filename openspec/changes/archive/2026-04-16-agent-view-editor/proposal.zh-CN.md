## Why

当前 Agent owner 目录已经有中间栏 `AgentView`，但它只能查看，不能编辑，并且重复展示了右侧 `AgentPane` 已经存在的 Agent 对话列表。用户需要一个明确的位置来编辑 Agent 的描述、模型、系统提示词、工具选择和继承行为，同时将对话继续保留在专门的右侧面板中。

当前 OpenSpec 也与目标行为存在冲突：`agent-view` 要求中间栏展示 conversation list，而 `agent-binding` 仍描述 phase-one nearest-parent resolution，并声明 `merge` 暂不在范围内。本变更用于将规范和实现统一到可编辑 Agent 配置、默认继承合并和显式 override 的语义上。

## What Changes

- 在 `AgentView` 中增加可编辑 Agent 配置表单，支持描述、模型 Provider、模型、系统提示词、工具和继承模式。
- 在 `AgentView` 中增加 tools 继承开关：开启时只读显示当前 resolved `agent.tools`，关闭时允许显式选择本层工具。
- 移除中间栏 `AgentView` 中的本地对话列表；Agent 作用域对话继续通过右侧 `AgentPane` 提供。
- 将 `.agent.json` 的 `inheritance` 定义为 `merge | override`。
- 将 `merge` 作为默认继承模式：子 Agent 继承父级配置，系统提示词按父到子顺序合并。
- 将 `override` 定义为截断当前 `.agent.json` 的父级和默认继承，只使用该层显式声明的字段。
- 将 Agent 编辑结果持久化回 owner directory 的 `.agent.json`，并刷新已解析的工作区上下文。
- 记住知识库节点访问历史，并在顶部提供前进/后退按钮，用于回到历史访问节点。
- 在异步显示 assistant 对话内容时保持用户滚动位置稳定：如果用户已经上滚，新内容不得强制将消息列表拉到底部；新切换的对话可以默认停留在顶部。
- 更新围绕 AgentView 渲染、配置解析和 `.agent.json` 保存行为的测试与验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-view`：AgentView 从带本地对话列表的只读概览，变为 owner directory 的概览与编辑器；对话不再在中间栏列出。共享工作区 UI 同时增加 tools 编辑与只读继承显示、知识库节点前进/后退导航，并在异步渲染对话时避免打断用户滚动位置。
- `agent-binding`：`.agent.json` 继承语义从 phase-one nearest-parent/override 改为默认 merge，并支持显式 override 截断。

## Impact

- Core contracts：`AgentConfig` 和 `ResolvedAgentConfig` 增加显式继承类型。
- Core resolution：scoped Agent config 解析必须一致支持默认 merge 和 override 截断。
- Shared UI：`AgentView`、`DocumentWorkspaceView`、i18n 文案和相关测试会变化。
- Workspace store：document workspace state 需要增加 patch owner `.agent.json` 的保存路径。
- Agent tools：tools 选择 UI 需要与 resolved `agent.tools` 默认值和显式继承/覆盖保存行为保持一致。
- Agent 元数据：description 编辑需要与现有 `.agent.json` 身份字段保持一致，并保留其它未支持字段。
- 预计不需要新增 runtime 依赖；应复用现有 provider/model catalog 和 context provider write API。
