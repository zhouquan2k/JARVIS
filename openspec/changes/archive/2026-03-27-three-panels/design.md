## Context

当前仓库已经有一套共享聊天工作区，核心由 [ConversationWorkspaceView.vue](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/ConversationWorkspaceView.vue)、`useChatStore` 与宿主侧 runtime 注入组成；Web、Desktop、Extension 三个入口目前都把它作为聊天主视图使用。需求文档 [p2.1-3_panels](/Users/quanzhou/Workspace/ChatPrism/docs/p2.1-3_panels) 描述的是一个更完整的知识工作台，但这次变更不再尝试把“知识文件浏览、类似 Obsidian 的所见即所得 Markdown 编辑、AI 读写与检索”一次性全部做完。

本次设计收敛为两个核心目标：
- 新增独立的 `KnowledgeWorkspaceView`，建立稳定的三栏壳层。
- 首阶段实现左侧文件浏览和中间单栏所见即所得 Markdown 编辑，并将右侧从纯占位升级为真实的 AI pane。

此外，为了验证编辑器与知识文件工作流在真实环境中的表现，Web 宿主需要通过 web server 暴露的 `/api/context` 接入一个可配置根路径下的知识文件后端，而不是继续只依赖内存快照或演示数据。browser 端只依赖 `IContextProvider` 契约；server 内部当前先以本地文件系统作为临时实现，后续可切换到数据库映射。当前根路径来源明确为环境变量 `CHATPRISM_KNOWLEDGE_ROOT`。

同时，当前核心接口中的 `IStorageProvider` 实际只负责聊天会话持久化。随着知识文件读写接口加入，`StorageProvider` 这一命名会变得过于宽泛，因此本次设计一并讨论将其收敛为 `IConversationStorageProvider` 的方向。

## Goals / Non-Goals

**Goals:**
- 提供新的三栏 `KnowledgeWorkspaceView`，布局为左侧文件树、中间单栏所见即所得 Markdown 编辑器、右侧 AI pane。
- 首阶段真正落地左侧文件浏览与中间所见即所得 Markdown 编辑闭环，包括文件树展开、文件打开、内容编辑、脏状态与保存。
- 将知识工作区右栏从 `KnowledgeAssistantPlaceholder` 升级为真实的 `KnowledgeAssistantPane`，并直接复用现有 `NormalChatView`。
- 在 `AppTopBar` 中增加默认工作区切换菜单，使宿主可以在知识工作区与聊天工作区之间直接切换。
- 为知识文件访问定义独立接口，不与聊天会话存储职责混合。
- Web 宿主通过 HTTP `ContextProvider` 访问由 web server 暴露的 `/api/context`，而 server 内部当前通过 `LocalFileContextProvider` 将文件访问边界限制在 `CHATPRISM_KNOWLEDGE_ROOT` 指定的根路径内。
- 在设计层明确 `IStorageProvider` 更适合演进为 `IConversationStorageProvider`，减少后续命名歧义。
- 编辑器技术选型明确为 `Milkdown`，以 Markdown-first 的方式提供接近 Obsidian 的单栏编辑体验，而不是源码输入框或分栏预览。
- 保持现有 `conversation-workspace` 完整不动，让知识工作区以新视图独立演进。

**Non-Goals:**
- 本次不实现右侧 AI 聊天面板读取当前激活文件、跨文件搜索结果注入或受控文件写入。
- 本次不修改 `NormalChatView` 的 props、空态文案、输入区和发送交互，只通过外层 pane 直接复用。
- 本次不把 `conversation-workspace` 改造成三栏视图，也不修改其内部布局、store 或聊天行为。
- 本次不改造 `IModelProvider`、消息发送链路或工具调用机制。
- 本次不实现完整 Obsidian 式高级能力，例如标签、双向链接、块级 AI 操作或复杂协同编辑。
- 本次不实现分栏预览模式，也不以 Markdown 源码编辑器作为最终交付形态。
- 本次不要求 browser 端直接接入 File System Access API 或其他本地文件系统能力；真实文件访问当前只存在于 server 内部的临时 provider 实现中。
- 本次不把 `/compare` 提升为顶部一级工作区菜单项；compare 继续使用现有入口。

## Decisions

### 1. 将“会话存储”和“知识文件访问”明确拆分，并把 `IStorageProvider` 收敛为 `IConversationStorageProvider`

当前 [IStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts) 的语义其实是 conversation-oriented，只负责聊天会话的 CRUD。知识工作区需要的则是目录树读取、文档加载、文档写回、节点创建和权限初始化。这两类职责不应再共用一个泛化的 `StorageProvider` 命名空间。

本次设计采用以下方向：
- 会话持久化接口在语义上收敛为 `IConversationStorageProvider`。
- 知识文件访问继续使用独立接口，例如 `IContextProvider`。
- 为了降低迁移成本，实际实现阶段可以保留 `IStorageProvider = IConversationStorageProvider` 的兼容别名，逐步迁移调用方。

新增/修改文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IConversationStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/index.ts`
- `/Users/quanzhou/Workspace/ChatPrism/openspec/specs/core-interfaces/spec.md`

核心签名：
```ts
export interface IConversationStorageProvider {
  id: string;
  saveConversation(chat: Conversation): Promise<void>;
  getConversation(id: string): Promise<Conversation | null>;
  getAllConversations(): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;
}

export type IStorageProvider = IConversationStorageProvider;

export interface ContextNode {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  parentPath?: string;
  hasChildren?: boolean;
  updatedAt?: number;
}

export interface ContextDocument {
  path: string;
  content: string;
  updatedAt?: number;
  version?: string;
}

export interface IContextProvider {
  id: string;
  initializeAccess(): Promise<void>;
  listTree(parentPath?: string): Promise<ContextNode[]>;
  readDocument(path: string): Promise<ContextDocument>;
  writeDocument(path: string, content: string): Promise<void>;
  createNode(input: { parentPath?: string; name: string; kind: 'file' | 'directory' }): Promise<ContextNode>;
}
```

变更说明：
- `IConversationStorageProvider` 明确表示“聊天会话存储”，不再与知识文件读写概念混淆。
- `IContextProvider` 只覆盖本阶段真正需要的知识文件能力，不提前把全文检索、AI 工具调用等能力塞进去。
- 这组命名边界能让后续右侧 AI 面板接入时有清晰的依赖关系，而不会继续扩大 `IStorageProvider` 的职责。

备选方案：
- 继续保留 `IStorageProvider` 原名不动。放弃原因是随着知识文件能力加入，`storage` 会同时指向“聊天会话”和“知识文档”，语义会越来越模糊。

### 1.1 Web server 通过 `/api/context` 暴露 `IContextProvider` 语义，内部使用 `HttpContextService + provider` 分层

本次设计不把 browser 端建模成“直接访问文件系统”，而是建模成“通过 HTTP 调用一个远端 `IContextProvider`”。这样 browser 侧只需要实现一个 `HttpContextProvider` 适配器，调用的仍然是 `initializeAccess / listTree / readDocument / writeDocument / createNode` 这组稳定语义；server 内部则由 `HttpContextService` 承接 HTTP 协议，再把调用转发给具体 provider。

当前 provider 分层为：
- `HttpContextService`：对齐 `IContextProvider` 方法语义，面向 `/api/context/*` 路由。
- `LocalFileContextProvider`：当前临时实现，把虚拟路径映射到 `CHATPRISM_KNOWLEDGE_ROOT` 下的本地文件系统。
- `DatabaseContextProvider`：未来替代本地文件实现，用于不同用户的 context 映射。

新增/修改文件：
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/routes/context.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/services/httpContextService.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/providers/localFileContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/providers/databaseContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/app.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/config.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/context/createWebContextProvider.ts`

核心签名：
```ts
export class HttpContextService {
  constructor(private readonly provider: IContextProvider) {}

  initializeAccess(): Promise<void>;
  listTree(parentPath?: string): Promise<ContextNode[]>;
  readDocument(path: string): Promise<ContextDocument>;
  writeDocument(path: string, content: string): Promise<void>;
  createNode(input: CreateContextNodeInput): Promise<ContextNode>;
}

export class LocalFileContextProvider implements IContextProvider {}

export class DatabaseContextProvider implements IContextProvider {}
```

对应的 endpoint 保持和接口语义一一映射：
- `POST /api/context/initialize-access`
- `POST /api/context/list-tree`
- `POST /api/context/read-document`
- `POST /api/context/write-document`
- `POST /api/context/create-node`

变更说明：
- 这里优先保证“命名一致”和“contract 稳定”，而不是把 HTTP 层设计成另一套 REST 资源模型。
- `createNode` 和 `readDocument` 的命名差异来自领域模型本身：前者操作 `ContextNode` 树结构，后者操作 `ContextDocument` 内容视图，并不是 HTTP 命名风格不一致。
- 当底层从 `LocalFileContextProvider` 切换到 `DatabaseContextProvider` 时，browser 端和 `/api/context` contract 都不需要变化。

备选方案：
- 让 browser 端直接访问 File System Access API。放弃原因是会把环境差异和权限细节直接泄露到 Web 宿主，不利于后续切换到数据库 context 映射。
- 把 `/api/context` 设计成另一套资源型 REST API。放弃原因是会把 `IContextProvider` 再翻译一遍，增加命名和语义偏差。

### 2. 新增 `KnowledgeWorkspaceView` 作为新的三栏知识工作区，不改造现有 `ConversationWorkspaceView`

现有 [ConversationWorkspaceView.vue](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/ConversationWorkspaceView.vue) 已经承担聊天侧边栏、普通聊天、对比聊天和问题索引等复杂逻辑。把文件树和 Markdown 编辑器继续塞进它，会直接把知识工作区和聊天工作区耦合在一起，也会迫使本次变更顺带重写现有聊天布局。

本次设计选择新增独立的 `KnowledgeWorkspaceView`：
- 它是知识工作区主视图，不是 `conversation-workspace` 的变体。
- 布局上仍然是三栏，但右栏默认挂载真实的 `KnowledgeAssistantPane`，而不再停留在静态占位。
- 现有 `ConversationWorkspaceView` 保持原状，不承担本次变更的布局职责。

新增/修改文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/KnowledgeWorkspaceView.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeFileTree.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeEditorPane.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeAssistantPane.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/index.ts`
- `/Users/quanzhou/Workspace/ChatPrism/openspec/specs/knowledge-workspace/spec.md`

核心签名：
```ts
// KnowledgeWorkspaceView.vue
defineProps<{
  panelSizes?: [number, number, number];
}>();

// optional slot contract
// <template #assistant-pane />
```

变更说明：
- `KnowledgeWorkspaceView` 默认使用三栏布局，例如 22 / 48 / 30。
- 左栏挂载文件树，中栏挂载单栏所见即所得 Markdown 编辑器，右栏默认显示 `KnowledgeAssistantPane`。
- `KnowledgeWorkspaceView` 继续保留右栏插槽；宿主如果后续要替换默认 AI pane，仍通过右栏插槽或组合式扩展接入，而不是回头改写 `ConversationWorkspaceView`。

备选方案：
- 直接把 `ConversationWorkspaceView` 改造成三栏。放弃原因是风险过大，而且与“现有 conversation-workspace 先不动”的边界冲突。

### 2.1 右栏新增 `KnowledgeAssistantPane`，并直接复用现有 `NormalChatView`

当前仓库已经有完整的 [NormalChatView.vue](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue)，包含消息线程、输入区、Provider/Model 选择器、附件与鉴权提示等完整行为。当前目标是让知识工作区右栏变成真实 AI 区，而不是重构聊天视图。

本次设计选择：
- 删除 `KnowledgeAssistantPlaceholder.vue`。
- 新增 `KnowledgeAssistantPane.vue` 作为知识工作区右栏默认实现。
- `KnowledgeAssistantPane` 内部直接渲染 `NormalChatView`。
- 不给 `NormalChatView` 增加新的 knowledge-specific props，也不调整其空态与交互。

新增/修改文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeAssistantPane.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/index.ts`

核心形态：
```vue
<template>
  <aside class="knowledge-assistant-pane" data-testid="knowledge-assistant-pane">
    <NormalChatView class="knowledge-assistant-chat" />
  </aside>
</template>
```

变更说明：
- 这样可以最快把右栏接成真实可交互的 AI 区，同时避免在本轮引入 `NormalChatView` 的行为回归风险。
- 知识工作区右栏与聊天工作区共享同一套 `chatStore` 运行时；知识工作区自身状态仍然由 `useKnowledgeWorkspaceStore` 管理。
- 若后续需要让右栏感知当前文档、定制空态或裁剪控件，再通过独立变更处理。

备选方案：
- 继续保留 `KnowledgeAssistantPlaceholder`。放弃原因是右栏会继续停留在演示层，无法验证真实三栏工作流。
- 先修改 `NormalChatView` 再接入知识工作区。放弃原因是当前收益不足，而且会扩大回归面。

### 3. 使用独立 Pinia store 管理知识工作区状态，不复用 `useChatStore`

当前 `useChatStore` 已经承担聊天消息、历史来源切换、外部历史预览、模型选择、附件和问题索引等大量状态。知识文件浏览和 Markdown 编辑是另一个状态域，不应该通过“继续给 chat store 加字段”的方式接入。

新增/修改文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/knowledgeWorkspace.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/knowledgeWorkspace.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/index.ts`

核心签名：
```ts
export interface KnowledgeWorkspaceState {
  contextProvider: IContextProvider | null;
  nodes: ContextNode[];
  expandedPaths: string[];
  activePath: string | null;
  activeDocument: ContextDocument | null;
  draftContent: string;
  dirtyPaths: Record<string, boolean>;
  panelSizes: [number, number, number];
  isHydrating: boolean;
  isSaving: boolean;
}

setContextProvider(provider: IContextProvider | null): void;
hydrateWorkspace(): Promise<void>;
toggleExpanded(path: string): void;
openNode(path: string): Promise<void>;
updateActiveDocument(content: string): void;
flushActiveDocument(): Promise<void>;
createNode(input: { parentPath?: string; name: string; kind: 'file' | 'directory' }): Promise<void>;
setPanelSizes(sizes: [number, number, number]): void;
```

变更说明：
- store 负责目录树、激活文件、草稿内容、脏状态和三栏尺寸，不承载聊天状态。
- 文件切换时先处理当前草稿保存，再切换到新文件，保证编辑器内容一致。
- 右栏即使改为真实聊天 pane，其尺寸状态仍由知识工作区统一管理，以保证三栏壳层稳定。

备选方案：
- 直接把知识工作区状态塞进 `useChatStore`。放弃原因是职责边界混乱，而且会把“还没接入的右栏 AI 面板”提前耦合到聊天域状态。

### 4. 中间编辑器采用 `Milkdown`，提供单栏所见即所得 Markdown 编辑，而不是源码输入框或分栏预览

这次的目标是“文件浏览 + 类似 Obsidian 的所见即所得 Markdown 编辑”，不是富文本 AI 协作。编辑器的首要要求是：
- 能以排版态直接编辑标题、列表、引用、代码块等常见 Markdown 结构，而不是显示 Markdown 源码。
- 能稳定载入当前文件内容，并在初始化时把 Markdown 文本解析为编辑器文档。
- 能在用户编辑后维护脏状态并防抖保存，并在保存时把编辑器内容序列化回 Markdown。
- 能在切换文件时受控替换内容。

新增/修改文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/KnowledgeEditorPane.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/utils/markdownDocument.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/package.json`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/package.json`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/package.json`
- `/Users/quanzhou/Workspace/ChatPrism/openspec/specs/knowledge-workspace/spec.md`

核心签名：
```ts
export function createMarkdownEditor(options: {
  root: HTMLElement;
  content: string;
  onChange: (markdown: string) => void;
}): Editor;

export function replaceMarkdownDocument(editor: Editor, content: string): void;
export function readMarkdownDocument(editor: Editor): string;
```

变更说明：
- 这次明确选用 `Milkdown` 作为编辑器底座，因为它比 `Tiptap` 更贴近 Markdown-first 的所见即所得编辑场景，也更符合“类似 Obsidian、单栏、不分栏预览”的目标。
- 中间编辑区是单栏所见即所得编辑，不额外提供左右分栏预览。
- 设计上只要求常见 Markdown 结构的所见即所得编辑与可控存储，不要求这次就支持 AI 片段插入、块级替换或跨文件上下文增强。
- 右栏未来接入 AI 后，如需对编辑器执行受控写入，应作为后续独立变更追加。

备选方案：
- 使用 `Tiptap`。放弃原因是它更适合作为通用富文本编辑底座，Markdown 支持需要额外桥接，和本次“Markdown-first 的所见即所得编辑”目标相比不如 `Milkdown` 贴合。
- 继续使用 `textarea` 或 Markdown 源码编辑模式。放弃原因是无法满足类似 Obsidian 的单栏所见即所得体验。

### 5. 宿主入口保留知识工作区与聊天工作区双路由，并由顶栏负责切换

多平台差异不应泄露到共享 UI。宿主入口的职责是创建对应的 `IContextProvider` 并挂载 `KnowledgeWorkspaceView`。与此同时，现有 `ConversationWorkspaceView` 保持独立存在，以便聊天工作区继续运行，也便于知识工作区出现问题时快速回退。

新增/修改文件：
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/context/createWebContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/App.vue`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/routes/context.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/services/httpContextService.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/providers/localFileContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/providers/databaseContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/app.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/config.ts`
- `/Users/quanzhou/Workspace/ChatPrism/openspec/specs/web-host-app/spec.md`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/AppTopBar.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/routes.ts`

核心签名：
```ts
export function createWebContextProvider(options?: {
  baseUrl?: string;
}): IContextProvider;
```

变更说明：
- Web 宿主注入 `HttpContextProvider`，通过 `/api/context` 使用远端 `IContextProvider`。
- 宿主入口继续保留知识工作区与聊天工作区两个默认路由，并通过 `AppTopBar` 新增的一级菜单在 `KnowledgeWorkspaceView (/)` 与 `ConversationWorkspaceView (/chat)` 之间切换。
- 现有聊天工作区继续保留为独立视图，不作为这次变更的嵌入右栏实现。
- server 端当前通过 `LocalFileContextProvider` 访问由 `CHATPRISM_KNOWLEDGE_ROOT` 指定的真实本地文件系统根路径，但这只是临时实现。

备选方案：
- 仍让宿主直接渲染 `ConversationWorkspaceView`，再在里面拼接知识文件功能。放弃原因是与新旧工作区边界不清，也不利于分阶段落地。

### 5.1 顶部工作区切换菜单放在 `AppTopBar`，导航权保留给宿主

三个宿主当前都在 `App.vue` 中组合 `AppTopBar` 与主视图，并使用各自路由模块的 `navigateTo()` 处理 `/#/`、`/#/chat`、`/#/compare`。工作区切换属于壳层导航，不应该由共享 UI 自己直接修改宿主路由状态。

本次设计选择：
- 在 `AppTopBar` 增加工作区切换菜单 UI。
- `AppTopBar` 通过事件把目标路径抛给宿主。
- Web、Desktop、Extension 各自在 `App.vue` 中监听该事件并调用本地 `navigateTo(path)`。
- 顶部菜单只覆盖 `KnowledgeWorkspaceView (/)` 与 `ConversationWorkspaceView (/chat)`；`/compare` 继续沿用现有入口。

核心签名：
```ts
defineProps<{
  title?: string;
  isCompareMode: boolean;
  compareStage: Stage;
  activeWorkspacePath: ChatRoutePath;
  workspaceOptions: ReadonlyArray<Pick<ChatRoute, 'path' | 'label'>>;
}>()

defineEmits<{
  (event: 'navigate-workspace', path: ChatRoutePath): void;
}>()
```

建议新增常量：
```ts
export const PRIMARY_WORKSPACE_ROUTES: ChatRoute[] = [
  {
    path: '/',
    name: 'knowledge-workspace',
    label: '知识工作区'
  },
  {
    path: '/chat',
    name: 'normal-chat',
    label: '普通聊天'
  }
];
```

变更说明：
- 宿主继续掌控路由，`AppTopBar` 只负责展示和发出导航意图。
- 这样不会把 Web hash 路由、桌面宿主路由、扩展宿主路由细节耦合进 UI package。

### 6. server 通过配置根路径接入本地文件系统，但不把“根路径配置”塞进通用 `IContextProvider`

这次新增的需求是：为了验证 Markdown 编辑器的真实能力，server 端需要暂时以本地 `.md` 文件作为 context 后端，而 browser 端仍然只消费统一的 `IContextProvider` 语义。这里的关键不是“让 `IContextProvider` 理解根路径”，而是“让 `LocalFileContextProvider` 拥有一个明确的文件系统根目录边界，并且这个根路径由 server 配置控制”。

本次设计选择：
- 保持通用 `IContextProvider` 仍聚焦在 `initializeAccess / listTree / readDocument / writeDocument / createNode` 这些跨端共用能力，不额外增加 `rootPath` 之类部署专属字段。
- server 侧通过配置注入根路径，例如 `new LocalFileContextProvider({ rootPath })`；该根路径由环境变量 `CHATPRISM_KNOWLEDGE_ROOT` 解析得到。
- 所有目录树读取、文档读写和节点创建都必须约束在该根路径下，browser 不直接接触任意文件系统路径。
- 根路径的来源由 server 配置负责解析；本阶段不实现浏览器侧目录选择或设置页。

新增/修改文件：
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/config.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/routes/context.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/services/httpContextService.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/providers/localFileContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/providers/databaseContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/context/createWebContextProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/openspec/specs/web-host-app/spec.md`

核心签名：
```ts
export interface LocalFileContextProviderOptions {
  rootPath?: string;
}

export class LocalFileContextProvider implements IContextProvider {
  constructor(options?: LocalFileContextProviderOptions);
}
```

变更说明：
- `LocalFileContextProvider` 需要把 `listTree/readDocument/writeDocument/createNode` 映射到真实文件系统。
- 根路径是 server 端配置，不是共享 UI 或通用 `IContextProvider` 的职责。
- 这种设计能保证 browser 端始终消费统一的 context contract，同时让 server 后端可以从本地文件平滑演进到数据库实现。

备选方案：
- 在 `IContextProvider` 上直接增加 `rootPath` 或“选择目录”方法。放弃原因是会把部署/存储细节上推到通用接口，导致 browser 端也被迫理解不需要的能力边界。

## Risks / Trade-offs

- [Risk] `IStorageProvider` 更名会影响现有导入路径和类型引用。
  Mitigation：通过 `IConversationStorageProvider` 新名字加 `IStorageProvider` 兼容别名分阶段迁移。

- [Risk] 宿主主视图加入知识工作区右栏真实聊天 pane 后，用户可能预期它已经具备 knowledge-aware 能力。
  Mitigation：本次直接接入 `KnowledgeAssistantPane`，避免右栏继续停留在演示占位；后续如需知识上下文增强，再通过独立变更补入。

- [Risk] 由于本次不修改 `NormalChatView`，知识工作区右栏会沿用现有普通聊天的空态文案和控件布局，看起来仍偏“聊天工作台”而不是“知识助手”。
  Mitigation：本轮接受该折中，以控制回归风险；后续若需要知识语境定制，再独立重构聊天视图或抽取更细组件。

- [Risk] `/api/context` 如果偏离 `IContextProvider` 原始语义，会在 browser adapter 和 server 实现之间形成双重抽象。
  Mitigation：保持 endpoint 命名与 `initializeAccess / listTree / readDocument / writeDocument / createNode` 一一对应。

- [Risk] server 根路径配置不当，可能导致用户误以为工作区会扫描任意系统目录。
  Mitigation：明确将文件访问限制在 `CHATPRISM_KNOWLEDGE_ROOT` 指定的根路径内，并在文档或日志中显式说明当前根目录来源。

- [Risk] 真实文件系统接入后，文件创建、覆盖和路径规范化会比内存快照更容易暴露边界问题。
  Mitigation：在 `LocalFileContextProvider` 内集中处理路径归一化、越界校验和目录存在性检查。

- [Risk] 当前以本地文件作为 server 后端实现，后续切到数据库映射时如果 contract 掺入了文件系统细节，会放大迁移成本。
  Mitigation：把本地文件实现限制在 `LocalFileContextProvider` 内，browser 端和 `HttpContextService` 只依赖 `IContextProvider`。

- [Risk] `Milkdown` 的 Markdown round-trip 和扩展语法能力仍需要结合实际文档样本验证。
  Mitigation：先以常见 Markdown 结构为验收范围，并补充解析/序列化测试保护标题、列表、引用、代码块等主路径。

## Migration Plan

1. 在 `packages/core` 中引入 `IConversationStorageProvider` 命名，并为旧 `IStorageProvider` 保留兼容出口。
2. 新增 `IContextProvider`，仅覆盖文件树、文档读取、写入和节点创建等左中两栏需要的基础能力。
3. 在 `packages/ui` 中实现 `KnowledgeWorkspaceView`、文件树组件、基于 `Milkdown` 的 Markdown 编辑组件和独立 store。
4. 在 `apps/server` 中新增 `/api/context`，由 `HttpContextService` 暴露 `IContextProvider` 语义，并先接入 `LocalFileContextProvider`。
5. 让 Web 宿主继续保留 `KnowledgeWorkspaceView` 与 `ConversationWorkspaceView` 两个默认路由，并注入通过 HTTP 调用 `/api/context` 的知识文件 Provider / 聊天运行时。
6. 在 `AppTopBar` 中接入一级工作区切换菜单，在知识工作区与聊天工作区之间切换，同时保持 `ConversationWorkspaceView` 内部工作流不变。
7. 底层 context 后端后续从 `LocalFileContextProvider` 演进到 `DatabaseContextProvider`，不改变 browser contract。
8. 右栏 AI 面板接入、跨文件搜索和 AI 文件写入能力留作后续独立变更。

## Open Questions

- `IConversationStorageProvider` 的重命名是一次性落地，还是先通过类型别名和 re-export 逐步迁移？
- 宿主在保留知识工作区与聊天工作区双路由后，旧聊天工作区是继续作为稳定默认入口之一，还是后续收敛为 feature flag / 回退实现？
- 右栏后续是否需要针对知识工作区单独定制空态、控件裁剪或当前文档上下文提示，而不是继续完全沿用 `NormalChatView` 的默认表现？
- 当 `CHATPRISM_KNOWLEDGE_ROOT` 未设置、为空或指向不存在目录时，server 应如何定义回退策略与错误提示。
- 不同用户的 context 映射在切到 `DatabaseContextProvider` 后应由认证态、显式 workspace 还是其他租户键驱动。
