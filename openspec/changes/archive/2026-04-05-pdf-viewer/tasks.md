## 1. 核心契约与命名收敛

- [x] 1.1 修改 `packages/core/src/interfaces/IContextProvider.ts`，将 `ContextDocument` 升级为 `mimeType + dataBase64` 的通用文档载荷，并调整 `writeDocument` 输入签名
- [x] 1.2 修改 `packages/core/src/interfaces/IModelProvider.ts`，为 provider 增加可选的文档能力声明接口，用于返回可接受的 `mimeType`
- [x] 1.3 重命名共享 UI 中的 `KnowledgeWorkspaceView`、`KnowledgeEditorPane`、`KnowledgeFileTree`、`KnowledgeAssistantPane`、`knowledgeWorkspace.ts` 及对应测试为 `DocumentWorkspaceView`、`DocumentEditorPane`、`DocumentFileTree`、`AgentPane`、`documentWorkspace.ts`

## 2. Provider 与宿主链路

- [x] 2.1 修改 `packages/core/src/providers/context/HttpContextProvider.ts`、`packages/core/src/testing/createMockContextProvider.ts` 与相关类型，使其兼容新的 `ContextDocument` 读写语义
- [x] 2.2 修改 `apps/server/src/routes/context.ts`、`apps/server/src/services/httpContextService.ts`、`apps/server/src/providers/localFileContextProvider.ts`、`apps/server/src/types/context.ts`，让 `/api/context/readDocument` / `writeDocument` 支持统一的 MIME-aware 文档载荷
- [x] 2.3 修改 `apps/desktop/main/contextIpc.ts`、`apps/desktop/main/preload.ts`、`apps/desktop/src/context/createDesktopContextProvider.ts`、`apps/desktop/src/env.d.ts`，让桌面链路支持统一 `ContextDocument`
- [x] 2.4 修改扩展侧 context provider，实现 `text/markdown`、`text/plain` 与 `application/pdf` 的统一 `readDocument` / `writeDocument` 行为，并保持 PDF 只读
- [x] 2.5 修改 `apps/web/src/App.vue`、`apps/web/src/App.test.ts`、`apps/desktop/src/App.vue`、`apps/desktop/src/App.test.ts`、`apps/extension/src/App.vue`，把宿主入口切换到 `DocumentWorkspaceView`

## 3. Document Viewer 与工作区状态机

- [x] 3.1 新增 `packages/ui/src/document-viewers/types.ts`、`registry.ts`、`markdownViewer.ts`、`pdfViewer.ts`，实现 `DocumentViewerDefinition` 与 viewer registry
- [x] 3.2 修改 `packages/ui/src/store/documentWorkspace.ts`，让 `openNode()` 统一走 `readDocument()`，并根据 `mimeType` 解析 viewer、维护 `activeDocument` 与主面板模式
- [x] 3.3 修改 `packages/ui/src/components/DocumentEditorPane.vue`，实现文本 viewer、PDF viewer 和 unsupported 状态，并管理 Blob URL 生命周期
- [x] 3.4 在文本 viewer 中让 `text/plain` 与 `text/markdown` 复用同一套编辑、自动保存、diff、undo/redo 链路

## 4. AgentPane 与模型文档能力协商

- [x] 4.1 修改 `packages/ui/src/components/AgentPane.vue` 与相关工作区接线，替换原 `KnowledgeAssistantPane` 命名和引用
- [x] 4.2 在工作区请求组装链路中查询当前 provider 的文档能力声明，按 `mimeType` 决定当前文档是作为 primary context、标准附件，还是完全不传内容
- [x] 4.3 确保模型不接受当前文档 `mimeType` 时，系统仅传递 `activePath`、`contextProvider` 和作用域 Agent 上下文，不把 `dataBase64` 直接注入请求
- [x] 4.4 收敛 `chat.ts` 与 `AgentRuntime` 的职责边界：由运行时产出“最终真实请求快照”，由会话层基于该快照持久化当前 user message，而不是由 UI 状态推断历史
- [x] 4.5 调整自动上下文注入策略：仅在会话首轮根据当前 `activeDocument` 和 provider MIME 能力决定是否自动采纳文档；后续 follow-up 默认不再根据当前工作区节点自动附加旧文档
- [x] 4.6 若首轮真实采纳了当前文本文件或 PDF，则将其作为真实请求的一部分写回首条 user message 的 `attachments` / 持久化上下文，以便后续 history 能完整回放当时情况

## 5. 单元测试、集成测试与构建验证

- [x] 5.1 补充 `packages/ui/src/store/documentWorkspace.test.ts`，覆盖 viewer 解析、`text/plain` 复用文本 viewer、PDF 只读和不支持类型兜底
- [x] 5.2 补充 `packages/ui/src/components/DocumentEditorPane.test.ts` 与 `packages/ui/src/components/AgentPane.test.ts`，覆盖文本/PDF 切换、Blob URL 释放和基于 provider MIME 能力的请求上下文过滤
- [x] 5.3 补充 `apps/server`、`apps/web`、`apps/desktop` 与扩展 provider 相关测试，验证新的 `readDocument` / `writeDocument` 契约和 PDF 读取路径
- [x] 5.4 依次执行 `pnpm lint`、`pnpm exec tsc --noEmit`、相关测试命令与目标宿主构建，确认重命名和 MIME-aware 文档契约未破坏编译与打包
- [x] 5.5 补充 `chat.ts` / `AgentRuntime` 相关测试，验证首轮自动采纳的文档会写回历史，后续 follow-up 只依赖 history 重放且不会重复附加同一 PDF
- [x] 5.6 补充 provider/history 相关测试，验证真实请求中的 prompt 与 attachments 能被完整持久化并在后续请求中原样回放

## 6. E2E 回归

- [x] 6.1 补充 Web Playwright 用例，覆盖打开 `text/plain`、`text/markdown`、`application/pdf`、切换 viewer、PDF 只读以及模型不接受 MIME 时的请求过滤行为
- [x] 6.2 补充扩展 Playwright 用例，使用 `channel: 'chromium'` 覆盖 PDF 打开、内嵌预览或兜底入口，并验证扩展侧统一 `readDocument` 链路
- [x] 6.3 扩展 E2E 通过后执行 `pnpm --filter extension build`，确认扩展产物可正常构建
- [x] 6.4 补充真实会话 E2E，验证首轮自动采纳 PDF 后该附件会写入首条 user message 历史，后续 follow-up 不会因当前仍选中该文件而再次自动附加同一 PDF
