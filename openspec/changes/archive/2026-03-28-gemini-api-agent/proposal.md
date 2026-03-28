## Why

当前知识工作区中的 Agent 运行链路仍以 prompt envelope 为主，虽然已经能把作用域 Agent 的身份、模型和指令注入普通聊天发送流程，但还不能让 Gemini 以原生 Agent 方式执行多步推理与工具调用。为了支持后续“搜索文件夹内容、修改文件内容”这类真实 Agent 场景，需要先为 Gemini 建立一条最小可运行的 Agent 执行链路，同时保持现有 `IModelProvider` 和普通聊天链路兼容。

## What Changes

- 为模型 provider 增加可选的 Agent 扩展契约，而不是修改所有 provider 共享的基础接口。
- 在现有 `ProviderRuntime` 之上新增 `AgentRuntime`，负责能力检测、执行路由、fallback 和 `AgentConfig` 透传。
- `AgentRuntime` 第一阶段继续复用现有流式文本更新契约，不引入新的 Agent 事件流协议。
- 让 `GeminiApiProvider` 成为首个支持原生 Agent 执行的 provider。
- Gemini 原生 Agent 请求第一阶段优先复用现有 `streamGenerateContent` 路径，并由应用侧维护 tool loop。
- 复用现有 `ResolvedAgentConfig` 作为运行态 Agent 配置，并明确数据流为 `UI / Store -> AgentRuntime -> AgentProvider`。
- 本阶段 UI 继续复用 `NormalChatView`，只接入 Gemini Agent 的最小可运行闭环，不新增独立 Agent 工作区。

## Capabilities

### New Capabilities
<!-- None in this phase. -->

### Modified Capabilities
- `core-interfaces`: 扩展共享核心接口，定义可选的 Agent-capable provider 契约以及 Agent 运行时请求/结果类型。
- `agent-runtime-adapter`: 将当前 phase-one 的 prompt-envelope 适配升级为“原生 Agent 优先、普通聊天 fallback”的运行时路由，并要求传递现有 `AgentConfig`。
- `gemini-api-provider`: 扩展 Gemini Provider，使其在保留普通聊天能力的前提下支持原生 Agent 执行入口。
- `knowledge-workspace`: 右侧 AI pane 继续复用现有聊天视图，但其发送链路需要能够通过 `AgentRuntime` 驱动 Gemini Agent。

## Impact

- 受影响代码主要位于 `packages/core/src/interfaces`、`packages/core/src/runtime`、`packages/core/src/providers/GeminiApiProvider.ts` 与 `packages/ui/src/store/chat.ts`。
- Web、Desktop、Extension 三端宿主需要在现有 provider runtime 装配链路上接入 `AgentRuntime`。
- 需要补充核心接口、运行时路由、Gemini Provider 和聊天 store 的单元测试，并覆盖 `streamGenerateContent` 路径下的 Agent fallback 与 tool loop 行为。
