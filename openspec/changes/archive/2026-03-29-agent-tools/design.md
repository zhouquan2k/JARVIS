## Context

当前仓库已经完成了 Gemini 原生 Agent 的第一阶段闭环：

- `AgentRuntime` 已能在原生 Agent 路径与普通聊天 fallback 间切换
- `GeminiApiProvider` 已能发送 function declarations 并把 `toolCalls` 暴露给上层
- 知识工作区已有 `IContextProvider` 与 `KnowledgeAssistantPane`

但现状仍有几个明显缺口：

- 工具执行仍停留在“未实现”占位，缺少统一的共享工具层
- 文件类工具没有直接复用知识工作区 Provider 契约
- 文件修订缺少面向大模型的原子编辑工具
- UI 想展示文件 diff 和支持行级 undo/redo，但还没有稳定的程序侧职责分配

本次变更不是重做 Agent 架构，而是在现有 `AgentRuntime + GeminiApiProvider + KnowledgeWorkspace` 基础上补齐共享工具与文件修订能力，并把 runtime 工具接入继续归并到已有的 `agent-runtime-adapter` 能力中。

## Goals / Non-Goals

**Goals:**

- 在 `packages/core` 中新增共享的工具执行层，供不同 Agent 实现复用
- 保持 `AgentRuntime` 为唯一的 Agent 编排层，工具执行通过内部依赖完成
- 让文件类工具直接复用 `IContextProvider`
- 扩展 `IContextProvider` 增加 `searchInScope`
- 在运行时把工具声明作为结构化输入传给 Gemini Provider
- 提供第一批 workspace read tools 与 workspace edit tools，并采用更有利于大模型使用的明确工具名
- 明确 `undo/redo` 的职责分配：程序记录 before/after，程序计算 diff，程序执行回滚
- 在知识工作区中透传 `activePath` 与 `contextProvider`，让 Agent 工具在当前 scope 中工作
- 在知识工作区中把当前活动文件内容作为结构化上下文传给模型，并让该上下文同时适用于 native agent 与 fallback 聊天路径

**Non-Goals:**

- 本阶段不引入 MCP 工具桥接或联网搜索 `search_internet`
- 本阶段不引入 `propose_file_patch` / `preview_patch` 预览式补丁流程
- 本阶段不让 LLM 生成 `FileChangeRecord`、diff 或 hunk 元数据
- 本阶段不要求 `IContextProvider` 一比一暴露所有编辑工具方法
- 本阶段不做 undo/redo 的持久化历史
- 本阶段不在默认 Agent instruction 中描述“程序会自动注入当前文件”这类实现细节

## Decisions

### 1. 保留 `AgentRuntime` 作为唯一编排层，将工具接入继续归并到现有 runtime adapter 能力

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createAgentRuntime.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agent-tools/types.ts`（新增）
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agent-tools/createAgentToolExecutor.ts`（新增）
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/index.ts`

关键签名：

- `export interface AgentToolDefinition<TArgs = Record<string, unknown>, TResult = unknown>`
- `export interface AgentToolExecutionContext`
- `export interface AgentToolExecutor`
- `export function createAgentToolExecutor(definitions?: AgentToolDefinition[]): AgentToolExecutor`

变更说明：

- `AgentRuntime` 继续负责 provider 选择、tool loop 驱动、流式结果回填和 fallback。
- 新增 `AgentToolExecutor` 作为 `AgentRuntime` 的内部依赖，只负责：
  - 根据 `ResolvedAgentConfig.tools` 解析可暴露给模型的工具声明
  - 执行 provider 返回的单次 `toolCall`
- 这部分运行时接入继续视为 `agent-runtime-adapter` 的能力扩展，不再新增独立的 `agent-tool-runtime` capability。

选择该方案的原因：

- 能把“工具如何声明、如何执行”从 `AgentRuntime` 中剥离出来
- 仍然保持单一的 Agent orchestration 入口，不引入第二个 runtime 或第二个 runtime capability
- 便于后续扩展更多工具而不污染 provider 层

未采用的方案：

- 直接把工具 map 写死在 `AgentRuntime`
  - 放弃原因：运行时会同时承担 provider 调度和工具实现，边界过重
- 新增 `agent-tool-runtime`
  - 放弃原因：会与现有 `agent-runtime-adapter` capability 重叠，spec 边界不清晰

### 2. 新 capability 只拆分为 `workspace-read-tools` 与 `workspace-edit-tools`

涉及能力：

- `workspace-read-tools`：只读文件工具与作用域搜索
- `workspace-edit-tools`：文件修订、变更记录与行级 undo/redo

变更说明：

- 只读工具和写入工具分为两个 capability，避免把查询能力与高风险写入能力混在同一份 spec 中。
- runtime 接入、工具声明解析与 tool loop 执行仍落在 `agent-runtime-adapter` 的修改范围内，不再单独定义 runtime capability。

选择该方案的原因：

- 读工具与修订工具的行为边界、风险和 UI 需求明显不同
- 拆成两个 capability 后，spec requirement 更清晰，也更适合分阶段实现
- 避免 capability 粒度过粗，导致单个 spec 同时覆盖 runtime、搜索、写盘和 undo/redo

未采用的方案：

- 只定义一个 `agent-tools`
  - 放弃原因：能力范围过宽，spec 会同时承载基础设施、只读工具和修订工具
- 额外新增 `agent-tool-runtime`
  - 放弃原因：与 `agent-runtime-adapter` capability 重叠

### 3. 文件类工具直接复用 `IContextProvider`，不新增额外 workspace access 抽象

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agent-tools/builtinWorkspaceTools.ts`（新增）
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/context/HttpContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/context/createDesktopContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/contextIpc.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/types/context.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/providers/localFileContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/routes/context.ts`

关键签名：

- `export interface ContextSearchRequest { query: string; maxResults?: number }`
- `export interface ContextSearchMatch { path: string; line: number; column: number; preview: string }`
- `searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]>`

变更说明：

- 文件工具直接调用 `IContextProvider` 的 `listTree`、`readDocument`、`writeDocument`、`searchInScope`。
- `search_in_scope` 不接收 `scope` 参数，作用域边界固定来自 `agent.scopePath`。
- 对于尚未补齐 `searchInScope` 的宿主，保持显式报错“暂不支持”，不做 fallback 扫描。

选择该方案的原因：

- 当前知识工作区已经有稳定的跨宿主 context 抽象
- 避免再新增一层 `AgentWorkspaceAccess` 导致概念重复
- `scope` 已由 `AgentConfig` 定义，不应重复暴露给模型作为工具参数

未采用的方案：

- 新增 `AgentWorkspaceAccess`
  - 放弃原因：与 `IContextProvider` 高度重复
- 为 `searchInScope` 提供递归 fallback
  - 放弃原因：会掩盖宿主能力缺失，且和当前“明确边界、明确报错”的目标不一致

### 4. 运行时向 Gemini Provider 传递结构化工具声明，而不是让 Provider 直接读取 `agent.tools`

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IAgentCapableProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/types.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createAgentRuntime.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/GeminiApiProvider.ts`

关键签名：

- `tools?: Array<{ id: string; description: string; inputSchema: Record<string, unknown> }>`
- `workspace?: { activePath: string | null; activeDocument?: { path: string; content: string } | null; contextProvider: IContextProvider | null }`

变更说明：

- `AgentRunRequest` 新增 `tools` 字段，由运行时传入已解析好的工具声明。
- `AgentRuntimeRequest` 新增 `workspace` 字段，用于透传当前 `activePath`、`activeDocument` 与 `contextProvider`。
- `GeminiApiProvider` 改为消费 `request.tools` 生成 function declarations，而不是直接读取 `agent.tools`。
- 当前活动节点若为文件，则其内容由程序侧作为结构化上下文注入本次请求；Provider 只消费运行时准备好的上下文，不自行决定是否读取或注入当前文件。

选择该方案的原因：

- Provider 只需要声明工具 schema，不应该知道工具在本地如何执行
- 工具边界统一由运行时收敛，便于后续支持非 Gemini 的 Agent 实现
- `workspace` 信息在运行时集中收敛，比在 UI 或 provider 层各自拼装更稳定
- 当前文件主上下文由程序注入，能确保模型在首轮就拥有用户正在编辑/选中的核心文档，而不必先额外调用读取工具

未采用的方案：

- 继续让 `GeminiApiProvider` 从 `agent.tools` 自己拼 function declarations
  - 放弃原因：Provider 会与本地工具模型耦合

### 5. 默认 Agent instruction 只定义行为规则，程序侧 helper 只负责追加当前文件上下文

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/resolveScopedAgentConfig.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/augmentPromptWithAgentContext.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createAgentRuntime.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`

关键签名：

- `DEFAULT_SCOPED_AGENT_CONFIG: AgentConfig`
- `augmentPromptWithAgentContext(prompt: string, options?: { activeDocument?: { path: string; content: string } | null }): string`

变更说明：

- 默认 Agent instruction 只描述模型行为，例如：
  - 将当前活动文件视为本次请求的主要上下文
  - 需要补充信息时，再使用 `search_in_scope`、`read_file`、`list_directory`、`read_current_file`
  - 不应臆测作用域外信息
- instruction 不再包含“程序会自动注入当前文件内容”这类实现细节。
- 当前文件内容由程序侧注入到请求文本中，例如单独的 `[[Active File Context]]` 区块。
- `augmentPromptWithAgentContext()` 只负责在原始用户 prompt 前追加 `Active File Context`；不再负责组织 Agent 身份、工具列表、技能列表或其它文本化能力边界。
- native agent 路径与 fallback 聊天路径都应消费同一份增强后的上下文结构，避免行为分叉。

选择该方案的原因：

- 程序职责与模型行为规则解耦后，请求更稳定，也更容易维护
- 当前文件是用户当前工作焦点，应在首轮就作为 primary context 提供给模型
- 把上下文注入集中到单一 helper，可以避免与 tools API、system instruction 形成重复表达

未采用的方案：

- 在 `DEFAULT_SCOPED_AGENT_CONFIG.instructions` 中直接写明“程序会自动把当前文件注入上下文”
  - 放弃原因：把实现细节写进 instruction 会导致职责混淆，也增加未来调整上下文注入方式时的维护成本
- 只在 fallback prompt-envelope 路径注入当前文件上下文
  - 放弃原因：会导致 native agent 与 fallback 聊天的首轮上下文不一致

### 5. 文件修订工具优先按“大模型最有利”拆分，不做万能 `edit_file(mode=...)`

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agent-tools/builtinWorkspaceTools.ts`（新增）
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agent-tools/types.ts`（新增）

关键签名：

- `replace_text_in_file`
- `replace_range_in_file`
- `insert_text_in_file`
- `delete_range_in_file`
- `write_file`

变更说明：

- 局部修订工具继续使用清晰工具名，而不是合并成一个 `edit_file(mode=...)`。
- `write_file` 用于整文件创建或整文件覆盖，可通过模式字段区分 create / overwrite。
- 局部修订工具内部可通过 `readDocument` + 内存改写 + `writeDocument` 完成，不要求 `IContextProvider` 暴露同名原子方法。

选择该方案的原因：

- 工具是给大模型选择的，工具名本身就是强提示
- 明确的工具名比带 `mode` 的万能工具更能减少错参和漏参
- 当前工具数量仍处于可控范围，优先为模型使用稳定性优化更合理

未采用的方案：

- 合并为单个 `edit_file(mode=...)`
  - 放弃原因：会把复杂度从“选工具”转移到“填参数”，对模型更不利

### 6. `undo/redo` 由程序侧 `FileChangeService` 负责，不进入 `IContextProvider`

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/services/FileChangeService.ts`（新增，名称可等价）
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/KnowledgeWorkspaceView.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeAssistantPane.vue`

关键签名：

- `export interface FileChangeRecord { id: string; path: string; beforeContent: string; afterContent: string }`
- `recordChange(input: { path: string; beforeContent: string; afterContent: string }): FileChangeRecord`
- `undo(path: string): Promise<FileChangeRecord | null>`
- `redo(path: string): Promise<FileChangeRecord | null>`

变更说明：

- 编辑工具执行成功后，程序记录 `beforeContent` / `afterContent`。
- UI 展示 diff 时，由程序基于 before / after 计算 line diff，不要求预先保存 diff 结果。
- `undo` 时写回 `beforeContent`，`redo` 时写回 `afterContent`。
- 当前阶段仅做内存态 undo/redo，不做持久化历史。

选择该方案的原因：

- `IContextProvider` 应只负责当前文件状态，不承担产品语义上的历史管理
- LLM 不适合生成 `FileChangeRecord`、diff 或 hunk 元数据
- 对当前“只需要行级 undo/redo”的目标来说，before/after 模型已经足够

未采用的方案：

- 把 `undo()` / `redo()` 放进 `IContextProvider`
  - 放弃原因：会让底层 Provider 同时承担文件系统与历史系统职责
- 引入 `propose_file_patch` / `preview_patch`
  - 放弃原因：与当前对齐 Codex / Copilot 的“直接写盘 + diff/undo”目标不一致

## Risks / Trade-offs

- [`searchInScope` 需要三端宿主同步补齐] → 通过明确的接口扩展和“未实现即报错”保持边界一致，不使用隐式 fallback
- [编辑工具拆分后工具数量增多] → 当前仍控制在少量明确工具内，换取更高的模型选择稳定性
- [`FileChangeService` 先做内存态，刷新后历史会丢失] → 明确这是本阶段范围，若后续需要跨会话恢复再单独设计持久化
- [before/after 模型只能天然支持整次变更回滚] → 当前目标仅为行级 undo/redo，展示时按 line diff 计算即可满足需求
- [设计跨越 core、ui、宿主三层，改动面较大] → 通过维持 `AgentRuntime`、`IContextProvider`、`GeminiApiProvider` 的职责边界，降低耦合风险

## Migration Plan

1. 先扩展 `IContextProvider`、`AgentRunRequest`、`AgentRuntimeRequest` 等共享接口。
2. 新增 `agent-tools` 模块，实现 `AgentToolDefinition`、`AgentToolExecutor` 与第一批内置工具。
3. 调整 `AgentRuntime`，接入真实工具执行与工作区上下文透传。
4. 调整 `GeminiApiProvider`，改为消费运行时已解析的工具声明。
5. 在 Web、Desktop、Extension 的 context provider 中补充 `searchInScope`。
6. 在 UI 层补充 `FileChangeService` 与行级 undo/redo 所需状态，并将当前工作区上下文与当前文件主上下文注入聊天发送链路。
7. 最后补齐测试，并根据实际需要再创建 spec 与 tasks artifact。

回滚策略：

- 若工具执行链路不稳定，可先在 `AgentRuntime` 中关闭真实工具执行，恢复为当前的占位错误结果
- 若文件修订与 undo/redo 链路不稳定，可先保留只读工具与搜索工具，暂不开放写入类工具

## Open Questions

- `FileChangeService` 最终应放在 `packages/ui` 还是提升到 `packages/core` 作为跨宿主共享服务
- `write_file` 的模式字段是否需要在第一阶段就显式区分 `create`、`overwrite` 与 `create_or_overwrite`
- `searchInScope` 在服务端与 Desktop 端是否需要统一限制最大结果数与预览长度
