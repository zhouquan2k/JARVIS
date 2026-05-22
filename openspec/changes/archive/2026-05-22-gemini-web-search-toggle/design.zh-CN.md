## Context

当前架构其实已经具备了落地这项能力所需的大部分积木，不需要再新增一层横切抽象：

- `packages/core/config.ts` 定义 provider 的模型目录和用户可见模型选项。ChatGPT Web 已经在这里暴露了 `web_search`，而 Gemini 目前只有 `deep_research`。
- `packages/ui/src/store/chat.ts` 负责对普通聊天和 Agent 请求统一归一化、持久化并透传 `modelOptions`。
- `packages/core/src/agents/runtime/createAgentRuntime.ts` 会把运行时解析后的 `modelOptions` 继续传给 `provider.runAgent(...)`，因此 Gemini Agent 请求天然与普通聊天共用同一条选项链路。
- `packages/core/src/providers/model/GeminiApiProvider.ts` 已经有 provider 本地的请求工具组装逻辑，用于把 Gemini 内建 request tools 与 native Agent 模式下的应用侧 function declarations 组合起来。

当前缺的只是 provider 侧的请求翻译：Gemini 需要接受现有共享 `web_search` 选项，并把它映射为原生 Google Search tool（`tools: [{ google_search: {} }]`），同时不能破坏现有 Deep Research 或 Agent tool-loop 行为。

## Goals / Non-Goals

**Goals:**
- 通过与 ChatGPT Web 相同的共享选项契约，为 Gemini 模型暴露 `web_search`。
- 让这个选项同时作用于普通 Gemini 聊天和 Gemini native Agent 请求。
- 将该选项映射到 Gemini 原生 Google Search request capability，而不是新增一套应用侧搜索层。
- 保持与现有 Gemini function declarations 在 Agent 模式下兼容。
- 用 provider 级测试锁定请求形态，避免后续重构时静默丢失这个 tool。

**Non-Goals:**
- 不新增 `search_web`、`fetch_webpage` 之类的新 Agent 工具。
- 不修改 ChatGPT Web 的请求行为。
- 不新增新的 provider 专属 UI 开关或命名变体；继续复用 `web_search` 这个现有选项 key。
- 本次不设计新的 Gemini grounding metadata 展示 UI。

## Decisions

### 1. 复用现有共享 `web_search` 选项契约来覆盖 Gemini

Files to change:
- `/Users/quanzhou/Workspace/JARVIS/packages/core/config.ts`

Function / type signatures:
```ts
export const APP_CONFIG: { providers: ProviderConfig[]; analyzer: AnalyzerConfig };
```

Change description:
- 给 Gemini 模型选项补上 `web_search`，并沿用 ChatGPT Web 已有的 key、label、description 和冲突关系。
- 保持 `deep_research` 与它互斥，这样上层归一化逻辑仍然可以保证“研究模式”和“搜索模式”不会同时打开。

Rationale:
- 产品已经有统一的模型选项链路。复用同一个 key 可以保持 UI、持久化和 Agent 透传的一致性，而不需要新增状态分支。

Alternatives considered:
- 新增一个 Gemini 专属的 `google_search` 选项 key。拒绝，因为这会打碎共享 UI 契约，并要求用户学习 provider 专属心智模型。

### 2. 将 `modelOptions.web_search` 翻译为 Gemini 内建 `google_search`

Files to change:
- `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/GeminiApiProvider.ts`

Function / method signatures:
```ts
function buildGeminiRequestTools(options: {
  modelOptions?: Record<string, boolean>;
  tools?: AgentToolDeclaration[];
}): Record<string, unknown>[];
```

Change description:
- 扩展 Gemini 请求工具组装逻辑，让 `modelOptions.web_search === true` 时自动加入 Gemini 原生 Google Search tool。
- 确保最终生成的请求结构符合当前 Gemini content API 的期望。
- 普通聊天和 native Agent 执行都统一经过这一个 helper，避免后续行为漂移。

Rationale:
- provider 已经负责 Gemini 专属请求翻译。把映射放在 provider 内部，能避免把供应商 payload 细节泄露到共享 runtime 层。

Alternatives considered:
- 只靠 prompt 文案暗示模型去搜索。拒绝，因为这不能保证真正拿到最新网页信息，也不等价于 provider 原生能力。

### 3. 保持内建 Google Search 与 Agent function declarations 共存

Files to change:
- `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/GeminiApiProvider.ts`
- `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/GeminiApiProvider.test.ts`

Function / method signatures:
```ts
function buildGeminiFunctionDeclarations(
  tools?: AgentToolDeclaration[]
): Record<string, unknown>[];

async runAgent(
  request: AgentRunRequest,
  onUpdate: (update: ProviderStreamUpdate) => void
): Promise<ProviderSendResult>;
```

Change description:
- 保持 Gemini 内建 tools 和应用侧 function declarations 走同一条请求组装路径。
- 确保 Agent 请求在开启 `web_search` 时，仍然可以继续带上 `toolConfig.functionCallingConfig` 和 function declarations。
- 明确禁止因为加入 Google Search 就禁用 Agent tools 的回退策略。

Rationale:
- 用户要的是 Agent 可用的同一套网络搜索开关，而不是一个只在普通聊天里生效的特例。
- 这一点最大的回归风险，就是 Agent 模式下 function calling 意外失效，所以设计上要求用测试把两类 tool 的共存关系锁死。

Alternatives considered:
- 在 Agent 模式下禁用 `web_search`。拒绝，因为这会破坏“共享选项”预期，形成隐藏的模式差异。

### 4. 通过 provider 和状态测试验证，而不是新增 UI 机制

Files to change:
- `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/GeminiApiProvider.test.ts`
- `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/store/chat.test.ts`

Function / method signatures:
```ts
setCurrentModelOption(key: string, enabled: boolean): void;
```

Change description:
- 增加 provider 测试，验证在开启 `web_search` 时 Gemini 请求 payload 包含 `google_search`，关闭时则不包含。
- 增加或调整状态测试，验证切换到 Gemini 后，归一化模型选项状态仍能保留共享 `web_search` 选项。
- 优先在请求 payload 这一层做断言，而不是只加渲染层测试。

Rationale:
- 这次本质上是“请求翻译 + 选项透传”问题，不是发明新的 UI 控件。

## Risks / Trade-offs

- Gemini API 内建 Google Search 的请求结构必须与现有 function calling payload 共存，测试需要把这点锁住。
- Gemini 响应里可能已经带有 grounding metadata，但当前 UI 还没有专门展示它。本次接受这个限制，因为用户当前需求只是“暴露开关并使用 API 能力”。
- 不同 Gemini 模型对内建 tool 的支持范围未来可能变化。第一版设计假设当前配置的 Gemini 聊天模型在支持范围内，并依赖 provider 测试尽早发现本地回归。
