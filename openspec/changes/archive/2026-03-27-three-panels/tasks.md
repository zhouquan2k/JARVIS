## 1. 核心接口与 Provider 契约

- [x] 1.1 在 `packages/core` 中引入 `IConversationStorageProvider` 规范命名，并为现有 `IStorageProvider` 保留兼容别名与导出路径
- [x] 1.2 新增 `IContextProvider`、`ContextNode`、`ContextDocument` 等知识文件访问类型，并补齐 `packages/core/src/index.ts` 导出
- [x] 1.3 为核心接口边界补充测试或 mock 支撑，验证会话存储命名迁移与知识文件 Provider 契约可被上层消费

## 2. 共享知识工作区与单栏 WYSIWYG Markdown 编辑

- [x] 2.1 新增 `useKnowledgeWorkspaceStore`，管理目录树、激活文档、草稿内容、脏状态和三栏尺寸
- [x] 2.2 实现 `KnowledgeWorkspaceView` 三栏壳层，包含左侧文件树、中间编辑区和右侧 AI 面板承载位
- [x] 2.3 实现 `KnowledgeFileTree`，支持目录展开、文件打开与文件/目录节点创建
- [x] 2.4 将 `KnowledgeEditorPane` 升级为基于 `Milkdown` 的单栏所见即所得 Markdown 编辑器，并补齐 Markdown 载入、编辑态同步与保存序列化逻辑
- [x] 2.5 为知识工作区补充共享导出与单元测试，验证文件切换、所见即所得编辑、草稿更新和 Markdown 保存行为
- [x] 2.6 删除 `KnowledgeAssistantPlaceholder`，新增 `KnowledgeAssistantPane` 作为知识工作区右栏默认实现，并直接复用现有 `NormalChatView`
- [x] 2.7 为知识工作区右栏补充单元测试，验证默认 AI pane 挂载与右栏 slot 覆盖行为

## 3. Web / Desktop / Extension 宿主装配

- [x] 3.1 实现 Web 侧 `createWebContextProvider`，并在 Web 宿主入口挂载 `KnowledgeWorkspaceView`
- [x] 3.2 实现 Desktop 侧 `createDesktopContextProvider` 以及 main / preload 文件桥接，并支持从环境变量 `CHATPRISM_KNOWLEDGE_ROOT` 解析知识工作区根路径后访问该根路径下的本地文件系统
- [x] 3.5 为 Desktop 宿主补充环境变量根路径解析与越界保护测试，验证 `CHATPRISM_KNOWLEDGE_ROOT` 缺失、非法和有效路径下的行为
- [x] 3.3 实现 Extension 侧 `createExtensionContextProvider`，并在扩展宿主入口挂载 `KnowledgeWorkspaceView`
- [x] 3.4 保持现有 `conversation-workspace` 可独立运行，不在本次变更中改写其布局、store 或聊天流程
- [x] 3.6 在 `AppTopBar` 中增加默认工作区切换菜单，并由 Web / Desktop / Extension 宿主统一接线 `KnowledgeWorkspaceView (/)` 与 `ConversationWorkspaceView (/chat)` 的顶层切换

## 4. 服务端 Context HTTP 适配

- [x] 4.1 在 `apps/server` 中新增 `/api/context` 路由，并让 endpoint 与 `IContextProvider` 的 `initializeAccess`、`listTree`、`readDocument`、`writeDocument`、`createNode` 语义一一对应
- [x] 4.2 实现 `HttpContextService`，通过依赖注入承接服务端 context 调用，并保持底层 provider 可替换
- [x] 4.3 实现 `LocalFileContextProvider`，支持从环境变量 `CHATPRISM_KNOWLEDGE_ROOT` 解析根路径、进行越界保护，并作为当前临时 context 后端
- [x] 4.4 预留 `DatabaseContextProvider` 这一服务端实现边界，确保未来切换到不同用户的 context 映射时不改变 `/api/context` contract
- [x] 4.5 实现 Web 侧 `createWebContextProvider` 的 HTTP context adapter，使 browser 端通过 `/api/context` 使用远端 `IContextProvider`

## 5. 端到端验证与交付检查

- [x] 5.1 为知识工作区补充 Playwright e2e，用例覆盖文件树浏览、单栏所见即所得 Markdown 编辑和右侧面板承载位的基础流程
- [x] 5.2 为 extension 宿主补充 Playwright e2e，并按 MV3 约束使用 `chromium` 通道执行
- [x] 5.3 运行相关测试与校验命令，确认三端知识工作区可用且 Desktop 可通过 `CHATPRISM_KNOWLEDGE_ROOT` 访问真实工作区；extension e2e 通过后执行 `pnpm --filter extension build`
- [x] 5.4 更新 Web / Extension 的 e2e 断言，验证默认 `KnowledgeAssistantPane` 可见，并覆盖顶部工作区切换菜单的基础流程
- [x] 5.5 为 `/api/context` 与 `HttpContextService` 补充服务端测试，覆盖接口语义映射、越界保护与 provider 可替换边界
- [x] 5.6 运行 Web 宿主与服务端联调验证，确认 browser 端可通过 `/api/context` 访问真实工作区，且 `LocalFileContextProvider` 对 `CHATPRISM_KNOWLEDGE_ROOT` 的路径约束生效
