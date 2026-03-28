## Why

当前知识工作区已经具备基于文件树的文档浏览与编辑能力，但右侧 AI pane 仍然是统一的通用聊天视图，无法根据当前文件或目录的工作语境自动切换 Agent 身份、指令与能力。为了让 ChatPrism 真正承载多 Agent 的本地知识空间，需要把 Agent 配置与目录树绑定，并让知识工作区在用户切换节点时自动解析和应用对应的 Agent 上下文。

## What Changes

- 新增基于目录树作用域的 `.agent.json` 配置机制，支持以 Config-as-Code 方式在本地知识目录内定义 Agent 名称、职责、核心指令、工具、技能和继承策略。
- 将“按节点解析生效 Agent”的职责下沉到 `IContextProvider`，由 provider 统一负责读取 `.agent.json`、解析最近父级配置、确定作用域路径、默认兜底以及返回最终 Agent 配置。
- 扩展 `AgentConfig`，至少表达 `modelProviderName`、`modelName`，并让解析结果稳定携带作用域路径，便于右侧 AI pane 与聊天运行时同时感知身份和模型选择。
- 为知识工作区增加“当前生效 Agent”状态，使左侧文件树与中间编辑区切换节点时，右侧 AI pane 可以同步切换到对应的 Agent 身份、模型边界与配置来源目录信息；目录节点被选中时也必须立即切换 Agent，而不要求先打开文件。
- 定义标准化 `AgentConfig` / resolver 与 LLM adapter 之间的边界，使“上下文定义与继承解析”和“模型执行与工具调用”保持解耦，便于后续接入不同 provider。
- 明确本阶段暂不实现路径缓存树、文件监听驱动的缓存失效以及 `merge` 继承，只在设计中预留后续优化接口。

## Capabilities

### New Capabilities
- `agent-binding`: 定义 `.agent.json` 的存储约定、最近父级解析算法、`override` 截断与默认 Agent 回退策略。
- `agent-runtime-adapter`: 定义标准化 `AgentConfig` 如何被映射到不同 model provider 的执行上下文，包括模型选择、原生工具调用与 Soft Function Calling 两类接入策略。

### Modified Capabilities
- `knowledge-workspace`: 当前激活节点需要驱动作用域 Agent 解析，并让知识工作区右侧默认 AI pane 绑定到当前生效的 Agent 上下文。
- `core-interfaces`: 需要补充标准化的 Agent 配置与解析接口，使共享层可以表达 Agent 定义、继承策略与解析结果。

## Impact

- Affected code:
  `packages/core` 的共享接口与 provider contract、`packages/ui` 的知识工作区 store / 视图、以及承接 AI pane 的运行时装配层。
- Affected storage:
  知识目录内将新增隐藏配置文件 `.agent.json`，并作为本地优先的 Agent 定义来源。
- Affected runtime behavior:
  知识工作区中的 AI 身份将不再是全局固定配置，而是随当前文件树作用域动态切换。
- Deferred work:
  路径缓存树、基于文件变更的缓存失效、`merge` 继承和更复杂的 Agent 调试工具不纳入本次变更。
