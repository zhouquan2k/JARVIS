## Context

当前仓库已经具备以下基础：

- [packages/core/src/interfaces/IContextProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IContextProvider.ts) 定义了知识文件树的最小访问接口，支持初始化访问、列目录、读写文档和创建节点。
- [packages/ui/src/store/knowledgeWorkspace.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/knowledgeWorkspace.ts) 负责知识工作区的目录树、激活文档、自动保存和三栏尺寸，但尚未维护“当前作用域 Agent”状态。
- [packages/ui/src/components/KnowledgeAssistantPane.vue](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeAssistantPane.vue) 当前只是直接复用 `NormalChatView`，没有任何与当前文件树节点绑定的 Agent 上下文。
- 三端宿主 [apps/web/src/App.vue](/Users/quanzhou/Workspace/ChatPrism/apps/web/src/App.vue)、[apps/desktop/src/App.vue](/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/App.vue)、[apps/extension/src/App.vue](/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/App.vue) 已经将 `KnowledgeWorkspaceView` 装配到 `/` 路由，说明作用域 Agent 的接入点应优先放在共享层，而不是三端各自分叉实现。

根据 [p2.2-agent-binding](/Users/quanzhou/Workspace/ChatPrism/docs/p2.2-agent-binding)，本次变化的核心不是新增一个普通配置页，而是建立“目录树作用域 -> 生效 Agent -> LLM 执行上下文”这一条完整链路，并保持 Local-First 与 Config-as-Code。

约束：

- `.agent.json` 必须作为知识目录中的隐藏文件存在，而不是额外引入数据库配置表。
- 现有 `IContextProvider` 和 host bridge 已经在三端跑通，但本次需要在其上补充“按节点解析 Agent”的标准入口，把 Agent 解析职责完全下沉到 context provider。
- 当前 `NormalChatView` / `useChatStore` 是全局共享聊天工作区，设计上要避免把 agent-binding 变成一次性重写聊天架构。
- 文档已明确“路径缓存树”属于延期优化，因此本次只实现正确性优先的按需解析。
- `merge` 本轮先不实现，当前阶段只要求最近父级命中、`override` 截断和默认兜底。

## Goals / Non-Goals

**Goals:**

- 定义标准化的 `.agent.json` 数据结构与解析结果结构，使共享层可以表达 Agent 名称、描述、指令、工具、技能、`modelProviderName`、`modelName` 与最终作用域路径。
- 通过 `IContextProvider` 提供一个按节点解析生效 Agent 的统一入口，由 provider 负责最近父级查找、`override` 截断与默认 Agent 回退。
- 让知识工作区在切换激活文件或目录节点时同步刷新“当前生效 Agent”，并把它传递给右侧 AI pane。
- 在不改写现有 provider contract 的前提下，把生效 Agent 的身份与模型选择编织进模型调用链，形成可演进的 adapter 边界。

**Non-Goals:**

- 本次不实现基于文件监听的路径缓存树，也不做增量失效优化。
- 本次不实现完整的“原生 function calling”工具执行框架；先以统一的 Agent 上下文封装和 prompt 适配为第一阶段。
- 本次不为每个目录创建独立聊天存储空间，也不重构 `useChatStore` 为多实例 store。
- 本次不提供 `.agent.json` 的图形化编辑器，配置文件仍通过文件系统直接维护。
- 本次不实现 `merge` 继承；若配置声明 `merge`，应在设计和实现上明确视为未支持能力。

## Decisions

### 1. 新增共享 Agent 配置模型，但把按节点解析能力下沉到 `IContextProvider`

原因：

- 文档要求“定义 (Context) 与执行 (LLM Adapter) 分离”，所以 Agent 配置、继承算法和执行适配不能埋在某个 Vue store 内部。
- 共享层仍然需要稳定的数据结构，但“如何读取节点并解析最终 Agent”应该归属于 provider，而不是由 UI 层或独立 resolver 越过 provider 去拼装。
- Web / Desktop / Extension 都已经各自持有 context provider，实现差异化文件系统访问；把 Agent 解析职责下沉到 provider，更符合边界和宿主职责划分。

新增文件：

- [packages/core/src/interfaces/IAgentConfig.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IAgentConfig.ts)
- [packages/core/src/agents/buildAgentPromptEnvelope.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/buildAgentPromptEnvelope.ts)
- [packages/core/src/index.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/index.ts)

核心类型与签名：

```ts
export type AgentInheritanceMode = 'override';

export interface AgentToolBinding {
  id: string;
  description?: string;
}

export interface AgentSkillBinding {
  id: string;
  description?: string;
}

export interface AgentConfig {
  name: string;
  description?: string;
  instructions?: string;
  modelProviderName?: string;
  modelName?: string;
  tools?: AgentToolBinding[];
  skills?: AgentSkillBinding[];
  inheritance?: AgentInheritanceMode;
}

export interface ResolvedAgentConfig extends AgentConfig {
  scopePath: string;
  sourcePaths: string[];
  effectiveInstructions: string;
}

export async function resolveScopedAgentConfig(
  targetPath: string
): Promise<ResolvedAgentConfig>;

export function buildAgentPromptEnvelope(
  agent: ResolvedAgentConfig,
  prompt: string
): string;
```

变更说明：

- `.agent.json` 仍由共享层统一定义结构，但最终解析入口是 provider 暴露的 `resolveScopedAgentConfig(targetPath)`。
- provider 内部以“当前文件所在目录”或“当前目录本身”为起点，逐层尝试读取 `${dir}/.agent.json`。
- 当前阶段不实现 `merge`；最近父级命中即成为默认生效配置，若显式声明 `override`，则作为“停止继续向上回溯”的明确语义保留。
- 如果整条链都没有 `.agent.json`，provider 自身负责返回默认 Agent，而不是由调用方额外传入 fallback。

备选方案：

- 方案 A：保留当前独立 resolver，对上层暴露 `resolveScopedAgentConfig(provider, targetPath, fallback)`。
  放弃原因：这会让 UI / runtime 继续知道 provider 的底层读取细节，职责边界仍然分散。
- 方案 B：把解析逻辑直接写进 [packages/ui/src/store/knowledgeWorkspace.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/knowledgeWorkspace.ts)。
  放弃原因：算法会与 UI 层耦合，未来无法复用到 CLI、服务端或非 Vue 宿主。

### 2. 扩展 `IContextProvider` contract，由 provider 直接返回节点的生效 Agent

原因：

- 用户要求“按节点获取 AgentConfig 的机制”，并且希望相关职责完全放在 provider。
- Agent 解析最终需要返回的不只是提示词，还包括模型选择和作用域路径；这本身就是 context provider 的扩展语义。
- 三端 provider 已经承担不同宿主的上下文访问职责，继续让它们直接负责 Agent 解析更自然。

涉及文件：

- [packages/core/src/interfaces/IContextProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IContextProvider.ts)
- [apps/server/src/providers/localFileContextProvider.ts](/Users/quanzhou/Workspace/ChatPrism/apps/server/src/providers/localFileContextProvider.ts)
- [apps/web/src/context/HttpContextProvider.ts](/Users/quanzhou/Workspace/ChatPrism/apps/web/src/context/HttpContextProvider.ts)
- [apps/extension/src/context/createExtensionContextProvider.ts](/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/context/createExtensionContextProvider.ts)
- [packages/core/src/testing/createMockContextProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/testing/createMockContextProvider.ts)

方法签名：

- `IContextProvider` 新增：

```ts
resolveScopedAgentConfig(targetPath: string): Promise<ResolvedAgentConfig>;
```

- provider 内部负责“读取不存在的 `.agent.json` 时继续向上查找”的容错；非法 JSON 或缺字段则作为真正的 Agent 配置错误返回给上层。

变更说明：

- `StorageBackedContextProvider`、本地文件 provider、HTTP provider 和测试 mock 都需要对外提供统一的 `resolveScopedAgentConfig()`。
- `createMockContextProvider()` 需要允许测试快照中包含隐藏路径，以便为 provider 级解析与知识工作区测试构造 `.agent.json`。
- Web server / IPC bridge 需要补齐对应 RPC 或 HTTP 接口，以保证 UI 不需要再自己读隐藏文件。

备选方案：

- 方案 A：只新增 `readDocumentIfExists(path): Promise<ContextDocument | null>`，由上层自行组织回溯逻辑。
  放弃原因：虽然调用更舒服，但职责仍没有完全收拢到 provider。

### 3. 在知识工作区中区分“当前选中节点”和“当前打开文档”，目录选中也必须刷新 Agent

原因：

- Agent 解析应由“当前选中节点”驱动，而不是仅由“当前打开文档”驱动，否则目录节点无法切换右栏身份。
- 右栏当前直接复用 `NormalChatView`，短期内不适合拆成新的聊天子系统；更现实的方案是把“当前 Agent 上下文”作为一种 view-scoped override 注入现有聊天发送链。

需要修改的文件：

- [packages/ui/src/store/knowledgeWorkspace.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/knowledgeWorkspace.ts)
- [packages/ui/src/views/KnowledgeWorkspaceView.vue](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/KnowledgeWorkspaceView.vue)
- [packages/ui/src/components/KnowledgeAssistantPane.vue](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeAssistantPane.vue)
- [packages/ui/src/store/chat.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts)

新增/修改状态与方法签名：

```ts
// packages/ui/src/store/knowledgeWorkspace.ts
selectedNodePath: string | null;
activeAgent: ResolvedAgentConfig | null;
agentResolutionError: string | null;
isResolvingAgent: boolean;

async selectNode(path: string): Promise<void>;
async resolveActiveAgent(path: string): Promise<void>;

// packages/ui/src/store/chat.ts
activeAgentContext: ResolvedAgentConfig | null;
setActiveAgentContext(agent: ResolvedAgentConfig | null): void;
```

变更说明：

- 点击目录节点时，knowledge store 需要更新 `selectedNodePath` 并立刻调用 `contextProvider.resolveScopedAgentConfig(path)`，即使中间编辑区没有切换到新文件。
- 点击文件节点时，knowledge store 同时刷新 `selectedNodePath`、`activeDocument` 与 `activeAgent`。
- `KnowledgeWorkspaceView` 将 `knowledgeStore.activeAgent` 传给 `KnowledgeAssistantPane`。
- `KnowledgeAssistantPane` 在 `NormalChatView` 上方增加固定的顶部 Agent 信息区，至少展示 Agent 名称、模型 Provider / 模型名称、最近命中的 `.agent.json` 所在目录；若没有命中任何 `.agent.json`，则默认 Agent 的展示路径固定为根作用域 `/`；解析错误仍需单独提示。
- `KnowledgeAssistantPane` 在 `onMounted / watch / onBeforeUnmount` 中调用 `chatStore.setActiveAgentContext(agent)` / `setActiveAgentContext(null)`，保证离开知识工作区后不会把 Agent 上下文泄露到普通聊天工作区。

备选方案：

- 方案 A：为知识工作区创建独立的聊天 store 与独立会话持久化。
  放弃原因：这会牵涉会话模型、持久化和 provider 初始化全链路重构，超出本次范围。

### 4. 第一阶段仍以“Agent prompt envelope”接入运行时，但模型选择优先遵循 AgentConfig

原因：

- 现有 [packages/core/src/interfaces/IModelProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IModelProvider.ts) 只暴露 `sendMessage(prompt, options, onUpdate)`，没有系统 prompt、tool schema 或 function-calling 抽象。
- 直接扩展所有 provider contract 会同时影响 ChatGPT Web、Gemini API、Desktop Proxy、Extension Proxy 与测试桩，改动面过大。
- 文档虽然区分“原生 API 接入”与“Soft Function Calling”，但当前仓库并没有统一的工具调度框架；第一阶段先把 Agent 身份、规则、模型选择、可用工具/技能列表稳定注入上下文即可。

需要修改的文件：

- [packages/ui/src/store/chat.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts)
- [packages/core/src/interfaces/IModelProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IModelProvider.ts) 不改签名
- [packages/core/src/providers/ChatGPTWebProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/ChatGPTWebProvider.ts) 无需立即改动
- [packages/core/src/providers/GeminiApiProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/GeminiApiProvider.ts) 无需立即改动

方法签名：

```ts
// 保持现有 provider contract
sendMessage(
  prompt: string,
  options: SendMessageOptions,
  onUpdate: (update: ProviderStreamUpdate) => void
): Promise<ProviderSendResult>;
```

变更说明：

- `chatStore.sendMessage(prompt)` 在真正调用 provider 之前，如果 `activeAgentContext` 存在，则先读取其中的 `modelProviderName` / `modelName`。
- 若 Agent 指定了模型 Provider / 模型，则发送链优先切换到对应 provider/model；若未指定，则继续沿用当前 UI 选择。
- 在选择好目标 provider/model 后，再通过 `buildAgentPromptEnvelope()` 生成包裹后的 prompt 并发送给现有 provider。
- envelope 中会包含：
  - Agent 名称与职责描述
  - Agent 指定的模型 Provider / 模型
  - 继承后得到的 `effectiveInstructions`
  - 允许使用的工具和技能清单
  - 当前作用域路径
- 这样可以在不改变 provider API 的情况下，让所有现有 provider 先获得一致的 Agent 语义。
- 后续若某些 provider 需要升级到原生 tools/functions，可在 `agent-runtime-adapter` capability 下进一步演进，而不破坏本次的数据模型。

备选方案：

- 方案 A：修改 `SendMessageOptions`，新增 `agentContext` 字段并要求所有 provider 识别。
  放弃原因：正确但过重，会把一次架构设计直接膨胀成一次 provider 全量迁移。

### 5. 测试优先覆盖 provider-owned 解析、目录选择切换与顶部 Agent 信息，不把缓存和复杂调度纳入验收面

原因：

- 这次风险最大的部分是继承解析和上下文泄漏，不是性能。
- 当前仓库已经对 store / view / provider 有比较齐的单测模式，可以低成本补到位。

需要新增或修改的测试文件：

- [packages/core/src/agents/resolveScopedAgentConfig.test.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/resolveScopedAgentConfig.test.ts)
- [packages/ui/src/store/knowledgeWorkspace.test.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/knowledgeWorkspace.test.ts)
- [packages/ui/src/components/KnowledgeAssistantPane.test.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeAssistantPane.test.ts)
- [packages/ui/src/store/chat.test.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.test.ts)

覆盖重点：

- 最近父级命中、`override` 截断、无配置时 fallback，以及 `merge` 未支持时的行为约束。
- `.agent.json` 非法 JSON 时 UI 能看到明确错误，但不会破坏文件树浏览。
- 在知识工作区中切换不同文件和目录时，`chatStore.activeAgentContext` 会同步更新；卸载右栏后会清空。
- 右栏顶部必须展示 Agent 名称、模型信息和最近命中的 `.agent.json` 所在目录；若不存在命中的配置文件，则默认 Agent 固定展示根作用域 `/`。
- `sendMessage()` 在有 Agent 上下文时会同时使用 Agent 指定的 provider/model，并发送包裹后的 prompt。

## Risks / Trade-offs

- [共享 chat store 仍被知识工作区复用] → 通过 `KnowledgeAssistantPane` 的挂载/卸载显式设置和清理 `activeAgentContext`，并在测试中覆盖“离开知识工作区后上下文被清空”。
- [`.agent.json` 解析失败会影响用户理解] → 将解析错误单独落在 `agentResolutionError`，只影响 Agent 状态展示，不阻断文件打开和文档编辑。
- [第一阶段只做 prompt envelope，工具/技能不是真正可执行] → 在文档和 spec 中明确这是 runtime adapter 的 phase 1；工具/技能先作为能力边界声明，而不是立刻变成自动执行引擎。
- [`merge` 暂不实现] → 在 spec 与 UI 中明确当前阶段不支持；必要时通过配置错误或设计约束提示用户，而不是静默做出含糊行为。
- [按路径逐层读取可能引入额外 I/O] → 当前先接受 O(depth) 读取成本，后续通过路径缓存树和文件变更失效优化。
- [隐藏文件不可见可能导致用户难以发现配置来源] → 右栏展示最近命中的 `.agent.json` 所在目录，并在内部保留 `scopePath` / `sourcePaths` 供运行时与调试使用，帮助用户确认当前 Agent 是从哪一层目录解析得到的。

## Migration Plan

1. 先扩展共享层类型与 `IContextProvider` contract，并让三端 provider 暴露 `resolveScopedAgentConfig()`。
2. 再把 knowledge workspace store / view 接入 provider-owned Agent 解析，并补齐目录节点选择行为。
3. 最后把 chat store 的发送链接入 Agent 指定模型与 `buildAgentPromptEnvelope()`。
4. 回滚策略：
   - 若 Agent 解析逻辑出现问题，可先移除 `KnowledgeAssistantPane` 对 `chatStore.setActiveAgentContext()` 的调用，恢复成纯通用聊天。
   - `.agent.json` 是附加配置，不会破坏现有知识文件数据；删除该文件即可退回默认 Agent。

## Open Questions

- Agent 指定的 `modelProviderName` / `modelName` 若与当前宿主实际可用目录不一致，UI 应该如何降级提示？
- `tools` / `skills` 的 `id` 是否要直接复用 Codex/插件体系里的真实标识，还是允许知识库自定义别名后再做映射？
- 当前右栏复用全局聊天会话是否足够，还是后续需要为知识工作区引入独立会话流以避免与普通聊天历史混用？
