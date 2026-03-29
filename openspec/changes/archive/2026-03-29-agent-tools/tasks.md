## 1. 接口与运行时契约

- [x] 1.1 扩展 `packages/core/src/interfaces/IAgentCapableProvider.ts`，为 `AgentRunRequest` 增加运行时已解析的工具声明字段
- [x] 1.2 扩展 `packages/core/src/runtime/types.ts`，为 `AgentRuntimeRequest` 增加 `workspace.activePath` 与 `workspace.contextProvider`
- [x] 1.3 扩展 `packages/core/src/interfaces/IContextProvider.ts` 及对应宿主类型，新增 `ContextSearchRequest`、`ContextSearchMatch` 与 `searchInScope()`

## 2. 共享工具执行层

- [x] 2.1 新增 `packages/core/src/agent-tools/types.ts`，定义 `AgentToolDefinition`、`AgentToolExecutionContext` 与 `AgentToolExecutor`
- [x] 2.2 新增 `packages/core/src/agent-tools/createAgentToolExecutor.ts`，实现工具声明解析与工具调用执行
- [x] 2.3 新增 `packages/core/src/agent-tools/builtinWorkspaceTools.ts`，实现 `read_current_file`、`list_directory`、`read_file`、`search_in_scope`

## 3. 文件修订工具

- [x] 3.1 在 `packages/core/src/agent-tools/builtinWorkspaceTools.ts` 中实现 `replace_text_in_file`、`replace_range_in_file`、`insert_text_in_file`、`delete_range_in_file`、`write_file`
- [x] 3.2 让文件修订工具通过 `readDocument` + 程序侧文本改写 + `writeDocument` 完成真实写盘，而不是引入补丁预览流程
- [x] 3.3 为文件修订工具补充输入校验与明确错误，覆盖无激活文件、路径无效、匹配失败等场景

## 4. Runtime 与 Gemini 接入

- [x] 4.1 调整 `packages/core/src/runtime/createAgentRuntime.ts`，接入 `AgentToolExecutor` 并在 tool loop 中执行真实工具
- [x] 4.2 调整 `packages/core/src/runtime/createAgentRuntime.ts`，把 `activePath` 与 `contextProvider` 透传到工具执行上下文
- [x] 4.3 调整 `packages/core/src/providers/GeminiApiProvider.ts`，改为消费运行时已解析的工具声明生成 function declarations

## 5. 宿主与工作区接入

- [x] 5.1 在 Web、Desktop、Extension、Server 的知识文件 Provider 实现中补充 `searchInScope()`，未支持时显式报错
- [x] 5.2 调整 `packages/ui/src/store/chat.ts`，发送 Agent 请求时透传当前工作区上下文
- [x] 5.3 调整 `packages/ui/src/components/KnowledgeAssistantPane.vue` 与 `packages/ui/src/views/KnowledgeWorkspaceView.vue`，注入并传递 `activePath` 与 `contextProvider`

## 6. 文件变更与 undo/redo

- [x] 6.1 新增程序侧 `FileChangeService`，记录 `beforeContent` / `afterContent`
- [x] 6.2 在文件修订成功后接入 `FileChangeService`，为 UI 提供最近一次文件变更数据
- [x] 6.3 在知识工作区中实现基于 `beforeContent` / `afterContent` 的 line diff 展示与内存态 undo/redo

## 7. 测试与验证

- [x] 7.1 为 `AgentToolExecutor` 与内置只读/修订工具补充单元测试
- [x] 7.2 为 `createAgentRuntime` 与 `GeminiApiProvider` 补充工具声明透传、工具执行与原生 Agent tool loop 测试
- [x] 7.3 为 `IContextProvider.searchInScope()` 的宿主实现补充单元或集成测试
- [x] 7.4 为知识工作区补充 UI/E2E 用例，覆盖文件修订、diff 展示与 undo/redo；如涉及 extension E2E，使用 Playwright 并按 `channel: 'chromium'` 执行，完成后运行 `pnpm --filter extension build`

## 8. Prompt 上下文增强与当前文件主上下文

- [x] 8.1 调整默认 `DEFAULT_SCOPED_AGENT_CONFIG`，将 description、instructions 与工具描述统一改为英文，并将 instruction 收敛为行为规则而非程序实现细节
- [x] 8.2 扩展 `packages/core/src/runtime/types.ts` 与 `packages/ui/src/store/chat.ts`，让工作区请求链路除 `activePath`、`contextProvider` 外还能透传 `activeDocument`
- [x] 8.3 将 `packages/core/src/agents/buildAgentPromptEnvelope.ts` 重命名为 `packages/core/src/agents/augmentPromptWithAgentContext.ts`，并将其职责收敛为只追加结构化的当前文件上下文
- [x] 8.4 调整 `packages/core/src/runtime/createAgentRuntime.ts`，让 native agent 与 fallback 聊天两条链路都只消费同一份当前文件上下文增强结果，而不再额外组织 Agent/Tools 文本 prompt
- [x] 8.5 补充运行时、聊天 store 与知识工作区相关测试，覆盖“当前节点为文件时自动将文件作为 primary context 注入请求”的行为
