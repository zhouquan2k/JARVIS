## Why

当前知识工作区仍建立在“当前激活内容一定是 Markdown 文本”的前提上：中间主显示区默认挂载编辑器，`IContextProvider.readDocument()` 只返回文本内容，三端宿主和右栏上下文也都沿用这一假设。这使系统无法自然支持 PDF，也会让后续图片、HTML、Office 等更多文档类型继续走特判路径。

同时，现有 `KnowledgeWorkspace` / `KnowledgeEditorPane` / `knowledgeWorkspace` 等命名已经与新的通用文档 viewer 方向不一致。如果底层抽象升级为通用 `Document`，但 UI 和宿主命名仍保留 `KnowledgeXXX`，后续实现和规格都会持续分裂。

## What Changes

- 将知识工作区升级为通用 `Document Workspace` 架构，由 `mimeType` 驱动 `DocumentViewer` 解析，而不是按扩展名硬编码 `.md` / `.pdf`
- 保留 `readDocument()` / `writeDocument()` 方法名，但把 `ContextDocument` 升级为通用用户文档载荷，统一通过 `mimeType + dataBase64` 表达内容
- 在 UI 中新增 `DocumentViewerDefinition` 和统一 registry，让 viewer 自声明支持的 `mimeType` 与 `view/edit` 能力
- 首版内置两个 viewer：Markdown viewer 继续复用现有编辑链路，PDF viewer 使用 Blob URL + 宿主原生预览实现只读展示
- 将 `KnowledgeWorkspaceView`、`KnowledgeEditorPane`、`KnowledgeFileTree`、`knowledgeWorkspace.ts` 等命名整体收敛为 `DocumentXXX`，并将右栏 `DocumentAssistantPane` 进一步简化为更通用的 `AgentPane`
- 将文件树交互升级为原位文件操作：支持树内新建文件/目录、显式刷新、带二次确认的删除，以及双击节点进入重命名
- 扩展 `IModelProvider` 能力声明，让工作区在发送当前文档时根据模型可接受的 `mimeType` 决定是传正文、传附件还是不传
- 调整右栏工作区上下文：首轮请求才根据当前 `activeDocument` 和模型可接受的 `mimeType` 决定是否自动采纳文档；文本 document 可作为 primary context，二进制 document 仅在模型声明支持时作为附件进入请求，否则仅保留路径和作用域上下文
- 将“真实请求回放”确立为历史保存原则：凡是实际进入某轮请求的附件或自动采纳文档，都必须写回该轮 user message；后续 follow-up 仅依赖 history 重放，不再根据当前工作区节点重复自动附加旧文档
- 明确职责边界：`AgentRuntime` 负责产出最终请求快照，`chat.ts` 作为会话管理器负责基于该快照持久化历史，provider 只负责协议适配和发送
- 为 Web / Desktop / Extension 三端补齐通用文档读取链路、PDF viewer 行为和重命名后的回归验证；Extension E2E 继续按 `channel: 'chromium'` 执行并在通过后构建扩展产物

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `core-interfaces`: 扩展 `IContextProvider` 与 `IModelProvider` 相关契约，使 `readDocument` / `writeDocument` 能表达通用用户文档，并让模型 provider 声明自己可接受的文档 `mimeType`
- `knowledge-context-provider`: 将知识文件 Provider 从 Markdown 专用读写升级为通用 document 读写，同时保持树节点与节点创建语义
- `knowledge-context-provider`: 将知识文件 Provider 从 Markdown 专用读写升级为通用 document 读写，同时保持树节点的创建、删除、重命名与目录树刷新语义
- `knowledge-workspace`: 将主显示区从 Markdown 编辑器升级为 `DocumentViewer` 驱动的工作区，引入 `AgentPane`，并按模型可接受的 `mimeType` 决定首轮当前文档能否进入请求上下文；一旦发送成功，真实请求内容必须写回历史并作为后续 follow-up 的唯一自动重放来源；文件树侧还 MUST 支持原位新建、刷新、删除确认和双击改名
- `sync-server`: 更新 `/api/context` 端点的 `readDocument` / `writeDocument` 契约，使其保持通用 document 语义并支持 MIME-aware payload，同时补齐节点创建、删除与重命名语义
- `web-host-app`: 将 Web 宿主入口从 `KnowledgeWorkspaceView` 收敛到 `DocumentWorkspaceView`，并支持通用 document viewer 与 PDF 预览
- `desktop-host-app`: 将 Desktop 宿主入口从 `KnowledgeWorkspaceView` 收敛到 `DocumentWorkspaceView`，并支持桌面侧通用 document provider 与 PDF 预览
- `extension-host-app`: 将 Extension 宿主入口从 `KnowledgeWorkspaceView` 收敛到 `DocumentWorkspaceView`，并支持扩展侧 PDF 预览或明确兜底入口

## Impact

- 影响 `packages/core` 中的 `IContextProvider`、`IModelProvider`、`ContextDocument` 与相关 mock / HTTP provider 契约
- 影响 `packages/ui` 中的工作区 store、主面板组件、右栏上下文组装、viewer registry，以及 `KnowledgeXXX -> DocumentXXX` / `DocumentAssistantPane -> AgentPane` 的命名收敛
- 影响 `apps/server`、`apps/web`、`apps/desktop`、`apps/extension` 的 document provider 接线与宿主入口装配
- 影响三端知识工作区相关单元测试、集成测试与 E2E 用例
- 不引入 `pdf.js`，不在本次变更中实现 PDF 编辑、批注、搜索、高亮、缩略图或页码导航
