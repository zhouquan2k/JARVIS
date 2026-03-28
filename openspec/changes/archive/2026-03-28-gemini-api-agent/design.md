## Context

当前仓库已经具备以下基础：

- `ResolvedAgentConfig` 已可由作用域 `.agent.json` 解析得到，并在知识工作区右栏注入到聊天 store。
- `chatStore.sendMessage()` 当前会根据 `activeAgentContext` 选择 provider / model，并通过 `buildAgentPromptEnvelope()` 走 phase-one 发送链路。
- `ProviderRuntime` 与 `createProviderRuntime()` 已负责多宿主环境下的 provider 装配、缓存与模型目录查询。
- `GeminiApiProvider` 当前仅提供普通聊天能力，还没有独立的 Agent 执行入口。

本次变更的重点不是重做聊天架构，也不是一次性完成完整文件工具工作区，而是在现有结构上补齐 Gemini Agent 的最小闭环：让现有 Agent 配置能够沿 `UI / Store -> AgentRuntime -> AgentProvider` 向下传递，并让 Gemini 成为首个支持原生 Agent 路径的 provider。

## Goals / Non-Goals

**Goals:**

- 保持 `IModelProvider` 的基础契约稳定。
- 新增可选的 Agent-capable provider 契约，并让 `GeminiApiProvider` 实现它。
- 在 `ProviderRuntime` 之上新增 `AgentRuntime`，统一处理能力检测、执行路由和 fallback。
- 将现有 `ResolvedAgentConfig` 直接作为运行态 Agent 配置传递给 `AgentRuntime` 和 `AgentProvider`。
- `AgentRuntime` 第一阶段继续复用现有 `ProviderStreamUpdate` / `ProviderSendResult` 契约。
- Gemini 原生 Agent 请求第一阶段优先沿用现有 `streamGenerateContent` 路径，由应用侧维护 Gemini function calling / tool loop。
- 在知识工作区中继续复用 `NormalChatView`，先跑通 Gemini Agent 的最小发送与结果展示链路。

**Non-Goals:**

- 本阶段不引入独立的 Agent 专用聊天组件或工作区。
- 本阶段不实现完整的文件搜索结果面板、diff 面板或变更确认面板。
- 本阶段不要求 ChatGPT Web、Desktop Proxy、Extension Proxy 一起实现原生 Agent 能力。
- 本阶段不构建完整的跨 provider 通用工具执行框架。

## Decisions

### 1. 保持 `IModelProvider` 不变，新增可选 Agent 扩展接口

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IModelProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IAgentCapableProvider.ts`（新增）
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/index.ts`

关键签名：

- `export interface IAgentCapableProvider extends IModelProvider`
- `getAgentCapabilities(): AgentCapabilities`
- `runAgent(request: AgentRunRequest, onUpdate: (update: ProviderStreamUpdate) => void): Promise<ProviderSendResult>`

变更说明：

- `IModelProvider` 继续只表达基础模型调用能力，不新增 Agent 特有字段和方法。
- 新增 `IAgentCapableProvider` 作为可选增强契约，仅由支持原生 Agent 的 provider 实现。
- `AgentRunRequest` 直接接收当前运行态 `ResolvedAgentConfig`，避免再定义第二套并行的 Agent 配置模型。

选择该方案的原因：

- 改动面最小，不会强迫所有 provider、mock 和 proxy 同步迁移。
- 能把“是否支持 Agent”表达成 capability，而不是所有 provider 的必选能力。
- 能与当前 phase-one prompt-envelope 路径共存，便于后续逐步演进。

未采用的方案：

- 直接修改 `IModelProvider.sendMessage()` 签名，加入 `agentContext` / `tools` / `maxSteps` 等参数。
  放弃原因：会把 Agent 编排逻辑污染到所有 provider 的基础契约中。

### 2. 在现有 `ProviderRuntime` 之上新增 `AgentRuntime`

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/types.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createProviderRuntime.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createAgentRuntime.ts`（新增）
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/index.ts`

关键签名：

- `export interface AgentRuntime`
- `run(request: AgentRuntimeRequest, onUpdate: (update: ProviderStreamUpdate) => void): Promise<ProviderSendResult>`
- `type AgentRuntimeRequest = { prompt: string; agent: ResolvedAgentConfig | null; modelId?: string; attachments?: MessageAttachment[]; history?: ProviderContextMessage[]; modelOptions?: Record<string, boolean>; context?: { parentMessageId?: string; conversationId?: string } }`

变更说明：

- 保留现有 `ProviderRuntime` 的职责边界，只负责 provider 装配、缓存和模型目录读取。
- 新增 `AgentRuntime`，作为建立在 `ProviderRuntime` 之上的一层调度器。
- `AgentRuntime` 接收当前活动的 `ResolvedAgentConfig`，选择目标 provider / model，并判断该 provider 是否实现 `IAgentCapableProvider`。
- 若支持原生 Agent，则把 `ResolvedAgentConfig` 和请求上下文继续传递给 `runAgent()`。
- 若不支持，则回退到现有 `sendMessage() + prompt envelope` 路径。
- `AgentRuntime` 第一阶段继续复用现有 `ProviderStreamUpdate` / `ProviderSendResult` 契约，不新增独立的 Agent 事件流模型。

选择该方案的原因：

- Agent 的本质是运行时编排，不是基础 provider 接口本身。
- 运行时层天然更适合处理 capability 检测、执行路由和 fallback。
- `ResolvedAgentConfig` 的传递链路能在这一层集中收敛，避免 UI 或 provider 各自维护平行逻辑。
- 复用现有流式文本更新契约可以让 `NormalChatView` 和 `chatStore` 在第一阶段保持基本不变。

未采用的方案：

- 直接把 Agent 路由逻辑写进 `chatStore`。
  放弃原因：会让 UI 状态层承担过多 provider 和能力协商职责。

### 3. 由 `GeminiApiProvider` 实现首个原生 Agent 执行入口

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/GeminiApiProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/GeminiApiProvider.test.ts`

关键签名：

- `export class GeminiApiProvider implements IAgentCapableProvider`
- `getAgentCapabilities(): AgentCapabilities`
- `runAgent(request: AgentRunRequest, onUpdate: (update: ProviderStreamUpdate) => void): Promise<ProviderSendResult>`

变更说明：

- `GeminiApiProvider` 保留现有 `sendMessage()` 普通聊天能力。
- 新增 `runAgent()` 作为 Gemini 原生 Agent 执行入口。
- `runAgent()` 直接消费 `ResolvedAgentConfig`，以 Agent 指定的模型、指令和能力边界构造 Gemini 侧 Agent 请求。
- `runAgent()` 第一阶段优先复用现有 `streamGenerateContent` 路径，并在请求中加入 Gemini 的 tools / function calling 配置。
- Gemini 的多步 tool loop 由应用侧 `AgentRuntime` 维护，而不是在第一阶段切换到 Live API 或新的实时 session 协议。
- `getAgentCapabilities()` 用于向 `AgentRuntime` 声明该 provider 支持原生 Agent 路径。

选择该方案的原因：

- Gemini 是当前最明确需要原生 Agent 能力的 provider，适合作为首个实现点。
- 保留普通聊天能力可以确保现有聊天与 fallback 路径不受影响。
- 沿用 `streamGenerateContent` 可以复用现有 SSE 解析、流式快照与 UI 更新链路，避免同时引入新的传输协议与事件模型。

未采用的方案：

- 新建独立的 Gemini Agent provider，与现有 `GeminiApiProvider` 平行。
  放弃原因：会拆散相同 provider 的鉴权、模型目录和生命周期管理。
- 第一阶段直接切换到 Gemini Live API 或独立的实时 Agent session 形态。
  放弃原因：会额外引入 WebSocket session、实时事件协议和新的宿主装配复杂度，超出当前阶段范围。

### 4. 本阶段 UI 继续复用 `NormalChatView`

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeAssistantPane.vue`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/App.vue`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/App.vue`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/App.vue`

关键签名：

- `setAgentRuntime(agentRuntime: AgentRuntime): void`
- `sendMessage(prompt: string): Promise<void>`（内部改为优先调用 `AgentRuntime`）

变更说明：

- 三端宿主继续创建现有 `providerRuntime`，并在其基础上再创建 `agentRuntime` 注入 `chatStore`。
- `chatStore` 在发送时把当前 `activeAgentContext` 作为 `ResolvedAgentConfig` 传递给 `AgentRuntime`。
- 知识工作区右栏继续复用 `NormalChatView` 作为输入与结果展示界面，不新增专用 Agent 工作区。

选择该方案的原因：

- 当前目标是先验证 Gemini Agent 运行链路，而不是同时进行 UI 大改造。
- 复用现有聊天视图可以把本阶段范围控制在运行时和 provider 层。

未采用的方案：

- 立即新建 `AgentChatView` 或完整 Agent 工作区。
  放弃原因：会把本阶段从“打通 Agent 链路”扩展成“重构聊天 UI”。

## Risks / Trade-offs

- [`ResolvedAgentConfig` 直接进入运行时会让类型边界更靠近知识工作区] → 通过新增明确的 `AgentRunRequest` / `AgentRuntimeRequest` 契约，保持调用边界稳定。
- [只有 Gemini 支持原生 Agent，其他 provider 仍走 fallback，行为会暂时不一致] → 在 `AgentRuntime` 中统一封装 capability 检测和降级路径，保持 UI 调用方式一致。
- [`chatStore` 仍需要知道当前活动 Agent，上层状态与执行层存在耦合] → 将耦合收敛为“只传递当前 `ResolvedAgentConfig`”，不把 provider 选择与执行细节继续堆进 store。
- [复用 `NormalChatView` 会限制本阶段的 Agent 可视化能力] → 明确本阶段只验证最小执行闭环，文件结果面板和 diff 交互放到后续迭代。
- [沿用 `streamGenerateContent` 需要应用侧自行维护 tool loop] → 将 Gemini function calling 循环明确收敛到 `AgentRuntime`，并在测试中覆盖多轮工具调用与结果回填。
- [第一阶段不切 Live API，未来可能需要再迁移] → 保持 `IAgentCapableProvider` 与 `AgentRuntime` 的边界稳定，后续仅替换 Gemini Provider 内部实现形态。

## Migration Plan

1. 先新增 `IAgentCapableProvider`、`AgentRunRequest`、`AgentRuntime` 等共享接口与运行时类型。
2. 再实现 `createAgentRuntime()`，让它基于现有 `ProviderRuntime` 完成 provider 能力检测和路由。
3. 扩展 `GeminiApiProvider`，实现 `IAgentCapableProvider` 和 `runAgent()`，并优先复用现有 `streamGenerateContent` 路径。
4. 在三端宿主初始化链路中创建 `agentRuntime`，并注入 `chatStore`。
5. 调整 `chatStore.sendMessage()`，让其优先通过 `AgentRuntime` 发送当前 Agent 上下文请求。
6. 为核心接口、AgentRuntime、Gemini Provider 和聊天 store 补齐测试。

回滚策略：

- 若原生 Agent 路径不稳定，可先在 `AgentRuntime` 中关闭 `IAgentCapableProvider` 分支，统一回退到现有 prompt-envelope 链路。
- `ProviderRuntime` 与 `NormalChatView` 的现有装配方式保持不变，因此回滚不会影响普通聊天主路径。

## Open Questions

- `AgentRunRequest` 中是否需要在第一阶段就保留显式的 `toolResults` / `stepLimit` 字段，还是先只传递最小上下文与 `ResolvedAgentConfig`。
