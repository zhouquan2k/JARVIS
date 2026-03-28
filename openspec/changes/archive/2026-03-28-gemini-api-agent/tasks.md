## 1. 核心接口与运行时

- [x] 1.1 新增 `IAgentCapableProvider`、`AgentRunRequest`、`AgentRuntime` 等共享接口与类型，并更新核心导出
- [x] 1.2 实现 `createAgentRuntime()`，基于现有 `ProviderRuntime` 完成 provider 能力检测、执行路由与 fallback
- [x] 1.3 让 `AgentRuntime` 第一阶段继续复用现有 `ProviderStreamUpdate` / `ProviderSendResult` 契约

## 2. Gemini Agent Provider

- [x] 2.1 扩展 `GeminiApiProvider`，实现 `IAgentCapableProvider` 与 `getAgentCapabilities()`
- [x] 2.2 为 `GeminiApiProvider` 增加 `runAgent()`，并优先复用现有 `streamGenerateContent` 路径
- [x] 2.3 在 Gemini 原生 Agent 请求中接入 tools / function calling 配置，并明确由应用侧维护第一阶段 tool loop

## 3. UI 与宿主接入

- [x] 3.1 在 Web、Desktop、Extension 的现有 provider 装配链路上创建并注入 `AgentRuntime`
- [x] 3.2 调整 `chatStore`，发送时将当前 `ResolvedAgentConfig` 传递给 `AgentRuntime`
- [x] 3.3 继续复用 `NormalChatView` 与 `KnowledgeAssistantPane`，完成 Gemini Agent 最小可运行闭环而不新增独立 Agent 工作区

## 4. 测试与验证

- [x] 4.1 为核心接口、`AgentRuntime` 与 `chatStore` 增加单元测试，覆盖原生 Agent 路径与普通聊天 fallback
- [x] 4.2 为 `GeminiApiProvider` 增加单元测试，覆盖 `streamGenerateContent` 路径下的 Agent 请求、工具配置与流式输出
- [x] 4.3 补充知识工作区或宿主级 Playwright 用例，验证当前 Agent 上下文能驱动 Gemini Agent 发送链路
- [x] 4.4 若新增或调整 extension e2e，用 Playwright 在 `channel: 'chromium'` 下执行测试，并在通过后运行 `pnpm --filter extension build`
