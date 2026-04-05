## Context

当前知识工作区的主显示区是围绕 Markdown 编辑器搭建的。`packages/ui/src/views/KnowledgeWorkspaceView.vue`、`packages/ui/src/components/KnowledgeEditorPane.vue`、`packages/ui/src/store/knowledgeWorkspace.ts` 和 `packages/core/src/interfaces/IContextProvider.ts` 共同建立了一个强假设：当前激活内容一定是 UTF-8 文本，并且可以直接作为 `content: string` 驱动编辑器、自动保存和 diff。

这套模型已经无法承载首版 PDF 预览，更不适合后续更多文档类型。`docs/p2.7-pdf-viewer.md` 已经把方向收敛为：

- 树层继续保留 `file | directory`
- 内容层统一抽象为通用 `Document`
- 主显示区升级为 `DocumentViewer` 驱动
- viewer 用 `mimeType` 声明支持范围和 `view/edit` 能力
- 首版只实现 Markdown viewer 与 PDF viewer
- `KnowledgeXXX` 命名整体收敛为 `DocumentXXX`

这意味着变更不是单个组件里加一个 `.pdf` 分支，而是一次跨 `packages/core`、`packages/ui`、`apps/server`、`apps/web`、`apps/desktop`、`apps/extension` 的接口、状态机、宿主接线和命名升级。

## Goals / Non-Goals

**Goals:**

- 将 `IContextProvider.readDocument()` / `writeDocument()` 升级为通用用户文档契约，而不是继续区分文本文档与二进制特例
- 在 UI 层建立 `DocumentViewerDefinition` 与统一 registry，让 viewer 成为按 `mimeType` 扩展的稳定入口
- 让工作区状态机先读取 `ContextDocument`，再解析 viewer，而不是按扩展名写死 `.md` / `.pdf`
- 首版交付 Markdown viewer 与 PDF viewer，其中 PDF 只读预览、无需 `pdf.js`
- 将 `KnowledgeWorkspaceView`、`KnowledgeEditorPane`、`KnowledgeFileTree`、`knowledgeWorkspace.ts` 等命名收敛为 `DocumentXXX`，并将右栏进一步统一为 `AgentPane`
- 扩展 `IModelProvider` 能力声明，让当前文档是否进入模型请求由 provider 可接受的 `mimeType` 决定
- 打通 Web / Desktop / Extension 的通用 document 读取链路，并补齐 PDF 预览及兜底验证

**Non-Goals:**

- 不在本次变更中提供 PDF 编辑、批注、搜索、高亮、缩略图或页码导航
- 不把所有 agent 文件工具一并升级为二进制文档读取工具；本次只约束工作区主显示区、`AgentPane` 和主上下文注入方式
- 不引入 `pdf.js` 或其他新的重型 PDF 渲染依赖
- 不在本次变更中重构聊天工作区或 compare 工作区

## Decisions

### 1. 统一把工作区命名收敛为 `DocumentXXX`，并把右栏进一步简化为 `AgentPane`

涉及文件：

- `packages/ui/src/views/KnowledgeWorkspaceView.vue` -> `packages/ui/src/views/DocumentWorkspaceView.vue`
- `packages/ui/src/views/KnowledgeWorkspaceView.test.ts` -> `packages/ui/src/views/DocumentWorkspaceView.test.ts`
- `packages/ui/src/components/KnowledgeEditorPane.vue` -> `packages/ui/src/components/DocumentEditorPane.vue`
- `packages/ui/src/components/KnowledgeEditorPane.test.ts` -> `packages/ui/src/components/DocumentEditorPane.test.ts`
- `packages/ui/src/components/KnowledgeAssistantPane.vue` -> `packages/ui/src/components/AgentPane.vue`
- `packages/ui/src/components/KnowledgeAssistantPane.test.ts` -> `packages/ui/src/components/AgentPane.test.ts`
- `packages/ui/src/components/KnowledgeFileTree.vue` -> `packages/ui/src/components/DocumentFileTree.vue`
- `packages/ui/src/components/KnowledgeFileTree.test.ts` -> `packages/ui/src/components/DocumentFileTree.test.ts`
- `packages/ui/src/store/knowledgeWorkspace.ts` -> `packages/ui/src/store/documentWorkspace.ts`
- `packages/ui/src/store/knowledgeWorkspace.test.ts` -> `packages/ui/src/store/documentWorkspace.test.ts`
- `apps/web/src/App.vue`
- `apps/web/src/App.test.ts`
- `apps/desktop/src/App.vue`
- `apps/desktop/src/App.test.ts`
- `apps/extension/src/App.vue`

关键变更：

- 视图、组件、store、测试文件和宿主入口统一改名为 `DocumentXXX`
- 共享 UI 对外导出、宿主 import、测试 stub 和 data-testid 文案同步调整
- 右栏 AI pane 直接改为 `AgentPane`，避免在通用文档工作区里继续引入不必要的领域前缀

选择原因：

- 这次能力升级的核心不是“知识场景增强”，而是“通用文档工作区”建立
- `AgentPane` 的职责是承载当前作用域 Agent，而不是表达它属于某一个特定工作区
- 如果只改底层抽象，不改命名，后续 viewer 注册体系和宿主装配会长期混杂两套心智模型

备选方案：

- 保留 `KnowledgeXXX` 命名，只升级接口与 viewer
  - 放弃原因：抽象层已经统一到 `Document`，继续保留 `Knowledge` 会让设计文档、规格和实现命名持续分裂

### 2. 在 UI 层引入 `DocumentViewerDefinition` 与统一 registry

涉及文件：

- `packages/ui/src/document-viewers/types.ts`（新增）
- `packages/ui/src/document-viewers/registry.ts`（新增）
- `packages/ui/src/document-viewers/markdownViewer.ts`（新增）
- `packages/ui/src/document-viewers/pdfViewer.ts`（新增）
- `packages/ui/src/components/DocumentEditorPane.vue`

关键签名：

```ts
export interface DocumentViewerDefinition {
    id: string;
    supportedMimeTypes: string[];
    capabilities: {
        view: boolean;
        edit: boolean;
    };
}

export function resolveDocumentViewer(document: ContextDocument): DocumentViewerDefinition | null;
```

变更说明：

- viewer 通过 `supportedMimeTypes` 声明支持范围
- viewer 通过 `capabilities.view/edit` 声明自身能力
- registry 是唯一的 viewer 解析入口
- `DocumentEditorPane` 不再自行按扩展名分支，而是消费 store 解析后的 viewer 结果
- `text/plain` 首版直接复用 Markdown viewer，而不是额外再引入一个纯文本 viewer

选择原因：

- 未来继续增加图片、HTML、CSV、Office 等 viewer 时，不需要继续改 store 和主面板分支
- 文档是否可编辑不再由单一文件名或宿主隐式决定，而是显式能力模型
- `text/plain` 与 Markdown 在当前工作区里都可以复用同一套文本编辑和保存链路，没有必要首版拆成两个 viewer

备选方案：

- 在 `DocumentEditorPane` 或 store 中继续按 `.md` / `.pdf` 写分支
  - 放弃原因：这只能解决当前 PDF，不能形成可扩展的 viewer 机制

### 3. 保留 `readDocument` / `writeDocument` 方法名，但把 `ContextDocument` 升级为通用用户文档

涉及文件：

- `packages/core/src/interfaces/IContextProvider.ts`
- `packages/core/src/providers/context/HttpContextProvider.ts`
- `packages/core/src/testing/createMockContextProvider.ts`
- `apps/server/src/routes/context.ts`
- `apps/server/src/services/httpContextService.ts`
- `apps/server/src/providers/localFileContextProvider.ts`
- `apps/server/src/types/context.ts`
- `apps/desktop/main/contextIpc.ts`
- `apps/desktop/main/preload.ts`
- `apps/desktop/src/context/createDesktopContextProvider.ts`
- `apps/desktop/src/env.d.ts`
- `packages/core/src/interfaces/IModelProvider.ts`

关键签名：

```ts
export interface ContextDocument {
    path: string;
    mimeType: string;
    dataBase64: string;
    updatedAt?: number;
    version?: string;
    canWrite?: boolean;
}

export interface WriteContextDocumentInput {
    path: string;
    mimeType: string;
    dataBase64: string;
    expectedVersion?: string;
}

readDocument(path: string): Promise<ContextDocument>;
writeDocument(input: WriteContextDocumentInput): Promise<void>;
```

```ts
export interface ProviderDocumentCapability {
    acceptedMimeTypes: string[];
}

export interface IModelProvider {
    // ...
    getDocumentCapability?(): Promise<ProviderDocumentCapability>;
}
```

变更说明：

- 树节点层仍保留 `ContextNode.kind: 'file' | 'directory'`
- 内容层统一用 `ContextDocument`
- `mimeType` 负责 viewer 决策
- `dataBase64` 作为统一载荷，文本 document 由 editor 侧负责 decode/encode，二进制 document 由 viewer 直接消费
- `canWrite` 用于表达文档是否允许写回，避免 UI 误显示编辑能力
- `IModelProvider` 新增可选文档能力声明，用于告诉工作区该模型是否接受当前 `mimeType`

选择原因：

- `readBinaryDocument()` 这类接口只是在为 PDF 打补丁，不能支撑后续更多文档类型
- 统一载荷之后，UI 和宿主协议只维护一套读写模型
- 当前文档是否应进入模型请求不应该由 workspace 硬编码，而应由 provider 能力声明决定

备选方案：

- 新增 `readBinaryDocument()` 与 `ContextBinaryDocument`
  - 放弃原因：接口模型会继续分裂成“文本主路径 + 二进制旁路”
- 使用 `contentKind: 'text' | 'binary'`
  - 放弃原因：viewer 解析已经依赖 `mimeType`，再额外引入内容类型二分会让协议多一层重复抽象

### 4. 工作区状态机改为“先读 document，再解 viewer”，并只在可编辑 viewer 下开放编辑链路

涉及文件：

- `packages/ui/src/store/documentWorkspace.ts`
- `packages/ui/src/views/DocumentWorkspaceView.vue`
- `packages/ui/src/components/DocumentEditorPane.vue`
- `packages/ui/src/components/AgentPane.vue`

关键签名：

```ts
activeDocument: ContextDocument | null;
activeViewerId: string | null;
activeViewerCapabilities: {
    view: boolean;
    edit: boolean;
} | null;
activePaneMode: 'empty' | 'viewer' | 'unsupported';

openNode(path: string): Promise<void>;
updateActiveDocument(content: string): void;
flushActiveDocument(): Promise<void>;
```

变更说明：

- `openNode()` 统一调用 `contextProvider.readDocument(path)`，然后交给 registry 解析 viewer
- Markdown viewer 下：
  - 将 `dataBase64` decode 成文本
  - 继续复用现有 Milkdown、自动保存、diff、undo/redo
- PDF viewer 下：
  - 不进入文本编辑链路
  - 不参与自动保存、diff、undo/redo
- unsupported 状态下展示明确的类型不支持提示

同时调整右栏上下文：

- `AgentPane` 在会话首轮发送时查询当前 `IModelProvider.getDocumentCapability()` 结果
- 文本 document 仅在模型接受对应 `mimeType` 时，才可作为首轮请求的 primary context 传入；`text/plain` 与 `text/markdown` 共用 Markdown viewer 和文本注入链路
- PDF 等二进制 document 仅在模型声明接受该 `mimeType` 时，才允许作为首轮请求的标准附件进入请求
- 若模型不接受当前 `mimeType`，则不传文档内容，只保留 `activePath`、`contextProvider` 和文档元信息供后续工具使用
- 首轮真正进入请求的文档内容，无论来自手动附件还是自动采纳的 `activeDocument`，都必须写回该轮 user message，作为后续 follow-up 唯一可信的 history 重放来源
- 后续 follow-up 默认不再根据“当前工作区又选中了什么文件”自动替换或重复附加既有文档

选择原因：

- 文件模式属于 store 状态机，而不是组件内部 if/else
- 只有 store 统一裁决，才能避免 PDF 分支意外触发保存和 diff
- “当前文档是否传给模型”属于 provider 能力协商，不应写死在工作区逻辑里
- 会话上下文应由“首轮真实发送了什么”定义，而不是由每轮发送时的当前 UI 状态定义

### 4.1 会话历史必须保存真实请求快照，`chat.ts` 与 `AgentRuntime` 各司其职

涉及文件：

- `packages/ui/src/store/chat.ts`
- `packages/core/src/agents/runtime/createAgentRuntime.ts`
- `packages/core/src/agents/runtime/types.ts`
- `packages/core/src/interfaces/IModelProvider.ts`

关键约束：

```ts
interface PreparedRequestSnapshot {
    prompt: string;
    attachments: MessageAttachment[];
    persistedPrimaryContext?: {
        mimeType: string;
        source: 'active-document';
    };
}
```

变更说明：

- `AgentRuntime` 负责根据 provider 能力、当前 `activeDocument`、历史消息与模型路径，组装本轮最终真实请求
- `chat.ts` 作为会话管理器，必须拿到这份最终请求快照，并据此更新当前 user message 的 `content` / `attachments` / 持久化上下文
- history 的保存依据必须是“真实进入请求的内容”，而不是“发送前 UI 上有什么候选状态”
- provider 只负责协议适配、网络发送和响应解析，不直接决定本地历史如何落盘
- follow-up 构造 provider history 时，必须以已持久化的 user messages 为唯一来源，而不是再次读取当前工作区节点做隐式补发

选择原因：

- 当前会话层和执行层若不共享同一份请求事实，history 会退化成 UI 状态快照，无法真实回放
- `chat.ts` 已经是 `currentConversation.messages` 的 owner，历史写入职责集中在此最稳定
- `AgentRuntime` 更接近 provider 执行边界，适合成为“最终请求事实”的 owner

备选方案：

- 在 `DocumentEditorPane` 内部自行判断当前 MIME 并切 UI
  - 放弃原因：组件层分支无法阻止 store 继续走文本更新和写盘逻辑

### 5. PDF viewer 使用 Blob URL + 原生预览，并在扩展宿主提供明确兜底

涉及文件：

- `packages/ui/src/document-viewers/pdfViewer.ts`
- `packages/ui/src/components/DocumentEditorPane.vue`
- `apps/extension/tests/e2e/extension-host.spec.ts`
- `apps/web/tests/e2e/knowledge-workspace.spec.ts`（后续需同步命名）

关键行为：

- 从 `ContextDocument.dataBase64` 构建 `Blob`
- 生成 `blob:` URL
- 使用 `iframe` 或 `object` 进行只读嵌入展示
- 切换文件或卸载时释放旧 Blob URL
- 扩展宿主若无法内嵌 PDF，展示“当前环境不支持内嵌 PDF 预览”以及新标签打开入口

选择原因：

- 当前目标只是首版只读预览
- 使用宿主原生 viewer 可以把依赖、渲染复杂度和测试成本控制在最低

备选方案：

- 引入 `pdf.js`
  - 放弃原因：需求只需要只读预览，引入新依赖会把实现、打包和测试成本抬高

### 6. 三端宿主继续共用同一套 `/api/context` / IPC 语义，但升级成通用 document 读写

涉及文件：

- `apps/web/src/App.vue`
- `apps/web/src/App.test.ts`
- `apps/desktop/src/App.vue`
- `apps/desktop/src/App.test.ts`
- `apps/extension/src/App.vue`
- `packages/core/src/providers/context/HttpContextProvider.ts`
- `apps/server/src/routes/context.ts`
- `apps/desktop/main/contextIpc.ts`

变更说明：

- Web 宿主继续通过 `/api/context/*` 使用 HTTP-backed provider
- Desktop 宿主继续通过 preload / IPC 使用桌面 provider
- Extension 宿主继续通过扩展侧 provider 提供 document 访问
- 三端都改为装配 `DocumentWorkspaceView`
- 三端都共享 `readDocument()` / `writeDocument()` 的新 payload 语义

选择原因：

- viewer 架构是共享 UI 能力，不能退化为单宿主特判
- 宿主差异只应体现在 provider 实现，不应外泄到共享主面板

## Risks / Trade-offs

- [Risk] 文本文档也统一改为 `dataBase64` 后，现有编辑链路需要新增编解码步骤 → Mitigation：将编码/解码集中在 `DocumentEditorPane` 或独立工具函数中，避免业务逻辑散落
- [Risk] `KnowledgeXXX -> DocumentXXX` rename 会影响导入路径、测试和宿主装配，改动面较大 → Mitigation：将 rename 纳入同一变更一次完成，并通过类型检查和宿主测试兜底
- [Risk] Extension 宿主内嵌 `blob:` PDF 预览可能受限 → Mitigation：提供明确兜底入口，并按仓库要求提权执行扩展 E2E，使用 `channel: 'chromium'`
- [Risk] 右栏若未按 provider 能力过滤文档 MIME，可能把模型不支持的文档直接塞进请求 → Mitigation：在 `AgentPane` 中统一查询 `getDocumentCapability()` 并做 MIME 过滤
- [Risk] 若自动采纳的首轮文档没有写回历史，follow-up 会再次依赖当前 UI 状态推断上下文，导致请求重复或 history 失真 → Mitigation：由 `AgentRuntime` 返回最终请求快照，并由 `chat.ts` 统一写回当前 user message
- [Risk] `/api/context` 和 IPC 协议变更后，旧测试可能只覆盖文本路径 → Mitigation：分别为 Web、Server、Desktop、Extension 补通用 document 和 PDF viewer 相关测试

## Migration Plan

1. 先修改 `packages/core/src/interfaces/IContextProvider.ts`，稳定 `ContextDocument` 和 `writeDocument` 新签名。
2. 同步升级 HTTP provider、server 路由、desktop IPC / preload、extension provider，使三端都能返回 `mimeType + dataBase64`。
3. 在 `packages/ui` 新增 `DocumentViewerDefinition`、registry 和 PDF viewer，同时把 `KnowledgeXXX` 文件统一 rename 为 `DocumentXXX`。
4. 改造 `documentWorkspace` store、`DocumentEditorPane` 与 `AgentPane`，打通“读取 document -> 解析 viewer -> 协商模型 MIME 能力 -> 首轮决定是否自动采纳上下文”链路。
5. 收敛 `chat.ts` 与 `AgentRuntime` 的边界：由运行时产出最终请求快照，由会话层按真实请求更新历史，并让后续 follow-up 仅依赖 history 重放。
6. 最后补单元测试、宿主测试和 E2E。Extension E2E 需申请提权，并在通过后执行 `pnpm --filter extension build`。

若中途发现 PDF viewer 在扩展端稳定性不足，可保守回退到：

- 保持 `DocumentWorkspace` 与通用 document 契约
- PDF 仅展示兜底入口，不提供内嵌预览

这样无需回退整个 viewer 架构。

## Open Questions

- `getDocumentCapability()` 是返回 provider 级静态 MIME 列表，还是允许按 `modelId` 返回更细粒度能力，需要在后续 specs 中定死
- 文本文档作为 primary context 时，最终历史应记录“注入后的 prompt 结果”还是记录一份结构化上下文快照，需要在 `chat.ts` 与 `AgentRuntime` 的契约中定死
- `KnowledgeWorkspace` 相关路由路径是否也一并从语义上调整为 `document workspace`，还是先只改组件/文件命名，后续再收敛 URL 和用户可见文案
