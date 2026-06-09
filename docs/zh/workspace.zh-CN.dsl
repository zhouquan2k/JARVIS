// English primary: docs/workspace.dsl | Chinese mirror: docs/zh/workspace.zh-CN.dsl
workspace "ChatPrism" "当前代码库的上下文与容器视图" {

    model {
        user = person "重度 AI 对话用户" "发起多模型聊天、结果对比、历史检索和知识整理。"

        chatgptWeb = softwareSystem "ChatGPT Web" "chatgpt.com；基于网页登录态的模型访问与会话历史读取。"
        geminiApi = softwareSystem "Google Gemini API" "generativelanguage.googleapis.com；模型推理、模型目录获取与对比分析。"
        geminiWeb = softwareSystem "Gemini Web" "gemini.google.com；基于浏览器受控页面的历史桥接与读取。"
        knowledgeRepo = softwareSystem "知识资料库" "本地知识目录、扩展托管文档和外部导入文件。"

        chatprism = softwareSystem "ChatPrism" "一个覆盖 Web、浏览器扩展、Desktop 和同步服务的多宿主 AI 工作台。" {
            extensionApp = container "Browser Extension App" "浏览器扩展宿主，提供聊天、对比、历史导入和知识工作区；并通过扩展机制承载 Agent 能力。" "TypeScript, Vue, WXT"
            webApp = container "Web App" "浏览器宿主，提供聊天、对比和知识工作区。" "TypeScript, Vue, Vite"
            desktopApp = container "Desktop App" "Electron 桌面宿主，提供聊天、对比、历史导入和知识工作区；并承载桌面侧 Agent 与文件能力。" "TypeScript, Vue, Electron"
            syncServer = container "Sync Server" "提供会话同步 API、知识上下文 API 和 provider 配置 API。" "TypeScript, Hono, Node.js"
            sharedPackages = container "Shared Packages" "按运行时边界拆分的工作区共享包：core 负责跨宿主契约，ui 负责共享界面层，node 负责 Node-only 适配与基础设施。" "TypeScript workspace packages" {
                corePackage = component "packages/core" "跨宿主共享契约、领域模型、运行时抽象和可复用的 provider/client 实现，供 Web、Extension、Desktop、Server 复用。" "Workspace package"
                uiPackage = component "packages/ui" "跨宿主共享 UI 组件、视图与 store，主要供 Web、Extension、Desktop renderer 复用。" "Workspace package"
                nodePackage = component "packages/node" "Node-only 适配层与基础设施实现，当前包含 FileSystemContextProvider，供 Desktop main 与 Sync Server 复用。" "Workspace package"
            }
            uiMarkdownEditing = container "UI: Markdown 编辑" "知识工作区 Markdown 编辑的「一语义命令 + 两原生后端 + 按模式分发」架构。每个插入/格式化操作统一以语义命令表达，在 viewer 模式下调用 ProseMirror live 命令，在 edit 模式下使用源字符串偏移插入。" "Vue, TypeScript, Milkdown/Crepe, ProseMirror" {
                documentEditorPane = component "DocumentEditorPane" "Markdown 文档插入/格式化命令的调度入口，根据当前活跃模式（viewer / edit）分发到对应的执行面。文件：packages/ui/src/components/DocumentEditorPane.vue" "Vue component"
                markdownDocumentViewer = component "MarkdownDocumentViewer" "在 viewer 模式下渲染 Crepe/ProseMirror live 编辑器；对外暴露 toggleHighlightInViewer / applyLinkInViewer / insertMarkdownSnippet；按 markdownViewerMode 进行模式分发。文件：packages/ui/src/document-viewers/MarkdownDocumentViewer.vue" "Vue component"
                markdownViewerCommands = component "MarkdownViewerCommands" "viewer 模式格式化的纯 ProseMirror 命令工具函数：toggleMarkdownHighlightAtViewerSelection、applyMarkdownLinkAtViewerSelection。文件：packages/ui/src/utils/markdownDocument.ts" "Utility module"
                sourceTextBackend = component "SourceTextBackend" "edit 模式的原始 Markdown textarea 后端，执行源字符串偏移插入，行为与重构前保持不变。" "textarea / string ops"
                crepeEditor = component "CrepeEditor" "Milkdown Crepe / ProseMirror live 编辑器实例；viewer 模式命令直接作用于 EditorView state 并 dispatch 事务。" "@milkdown/crepe, ProseMirror"
            }
            coreAbstractions = container "Core Abstractions" "用于表达共享接口、运行时契约与领域对象之间关系的核心抽象层。" "TypeScript interfaces and domain abstractions" {
                modelProviderRuntime = component "ModelProviderRuntime" "统一解析并提供可用的模型 provider 与模型目录。典型工厂：createProviderRuntime、createDesktopHostRuntime。" "Interface"
                modelProvider = component "IModelProvider" "统一模型调用契约。典型实现：ChatGPTWebProvider、GeminiApiProvider、DesktopProxyProvider。" "Interface"
                agentCapableProvider = component "IAgentCapableProvider" "具备原生 Agent 执行能力的模型 provider 扩展契约。当前典型实现：GeminiApiProvider。" "Interface"
                externalConversationProvider = component "IExternalConversationProvider" "外部会话导入契约。典型实现：ChatGPTWebProvider、GeminiDomHistoryProvider、DesktopHistoryProxy。" "Interface"
                conversationPersistProvider = component "IConversationPersistProvider" "会话持久化契约。典型实现：IndexedDBStorageProvider、SyncStorageProvider。" "Interface"
                contextProvider = component "IContextProvider" "知识作用域搜索、文档读写与 Agent 配置解析契约。典型实现：HttpContextProvider、LocalFileContextProvider、desktop-context bridge。" "Interface"
                agentRuntime = component "AgentRuntime" "Agent 请求编排入口。典型工厂：createAgentRuntime。" "Interface"
                conversationWorkflowController = component "ConversationWorkflowController" "普通对话工作流编排器。当前主要实现路径：useChatStore.sendDraft。" "Core service"
                conversationModel = component "Conversation" "聊天、导入和同步流程共用的核心会话数据模型。" "Domain model"
                resolvedAgentConfig = component "ResolvedAgentConfig" "经过工作区作用域解析后的 Agent 配置。" "Domain model"
                compareWorkflowController = component "CompareWorkflowController" "双模型对比工作流编排器。典型实现：CompareWorkflowController。" "Core service"
                multiModelGroupProvider = component "MultiModelGroupProvider" "Group provider（id='group'），把 prompt 并发分发到固定预设中的多个 IModelProvider 成员（广播或 @mention 定向），将流式输出按分段 transcript 合并，并向所有成员透传 abort。成员解析经 resolveMemberProvider → runtime.getProvider。文件：plugins/ai-agent/src/providers/model/MultiModelGroupProvider.ts" "IModelProvider 实现"
                domAutomationProvider = component "DomAutomationProvider" "仅 desktop 的 IModelProvider（chatgpt-dom / gemini-dom），通过隐藏 BrowserWindow 驱动真实 ChatGPT/Gemini 页面：打开受控页、设置联网开关、注入 prompt、经 MutationObserver push 事件观察 DOM 流式回复，并在 done 或 timeout-fallback 时收尾。文件：plugins/ai-agent/src/providers/model/dom/DomAutomationProvider.ts" "IModelProvider 实现（仅 desktop）"
                domTransport = component "DomTransport" "基于 ControlledPageCapability 的薄传输层：open/setWebSearch/readFinalText/injectAndSubmit/subscribe。封装所有 controlled-page 调用，不包含站点特有知识。文件：plugins/ai-agent/src/providers/model/dom/domTransport.ts" "Transport abstraction"
                controlledPageCapability = component "ControlledPageCapability" "宿主能力接口，用于管理按 provider 隔离的隐藏 BrowserWindow：openControlledPage、evaluateInPage、subscribeControlledPageEvent。Desktop 实现通过 Electron IPC 接线；订阅方法启用 push 式 DOM 事件转发（page→main→renderer）。文件：packages/core/src/interfaces/ControlledPageCapability.ts" "Host capability interface"
            }
        }

        user -> chatprism "使用" "UI"

        chatprism -> chatgptWeb "发送消息、检查登录态、读取会话历史" "HTTPS / Browser Session"
        chatprism -> geminiApi "发送消息、获取模型目录、执行对比分析" "HTTPS"
        chatprism -> geminiWeb "桥接页面并读取 Gemini 历史" "Controlled Page / Content Script"
        chatprism -> knowledgeRepo "读取、写入并搜索知识文档与导入文件" "Filesystem / HTTP Context / Extension Storage"

        user -> extensionApp "使用" "Browser Extension"
        user -> webApp "使用" "Browser"
        user -> desktopApp "使用" "Desktop UI"

        webApp -> sharedPackages "复用共享 UI、契约与工作流" "Workspace Package Imports"
        extensionApp -> sharedPackages "复用共享 UI、契约与工作流" "Workspace Package Imports"
        desktopApp -> sharedPackages "复用共享 UI、契约，并在 main 进程复用 Node 适配" "Workspace Package Imports"
        syncServer -> sharedPackages "复用共享契约与 Node 适配" "Workspace Package Imports"

        webApp -> syncServer "同步会话、经服务端读取知识上下文并获取 provider 配置" "HTTP"
        webApp -> geminiApi "发送消息、获取模型目录、执行对比分析" "HTTPS"

        extensionApp -> syncServer "同步会话、经服务端读取知识上下文并获取 provider 配置" "HTTP"
        extensionApp -> chatgptWeb "发送消息、检查登录态、读取历史" "HTTPS / Browser Cookies"
        extensionApp -> geminiApi "发送消息、获取模型目录、执行对比分析" "HTTPS"
        extensionApp -> geminiWeb "读取 Gemini 历史" "Content Script / DOM Bridge"

        desktopApp -> syncServer "同步会话" "HTTP"
        desktopApp -> chatgptWeb "发送消息、检查登录态、读取历史" "HTTPS / Session / Cookies"
        desktopApp -> geminiApi "发送消息、获取模型目录、执行对比分析" "HTTPS"
        desktopApp -> geminiWeb "读取 Gemini 历史" "Controlled Page"
        desktopApp -> knowledgeRepo "读取、写入并搜索知识文档" "Filesystem"

        syncServer -> knowledgeRepo "读取、写入并搜索知识文档" "Filesystem / Database"

        nodePackage -> corePackage "复用 core 契约并提供 Node-only 实现"
        uiPackage -> corePackage "复用共享领域模型与接口"

        documentEditorPane -> markdownDocumentViewer "调用对外暴露的命令（viewer 模式）"
        markdownDocumentViewer -> markdownViewerCommands "在 viewer 模式下委托格式化"
        markdownDocumentViewer -> sourceTextBackend "在 edit 模式下委托格式化"
        markdownViewerCommands -> crepeEditor "在 live selection 上执行 toggleMark / addMark"

        modelProviderRuntime -> modelProvider "解析并提供"
        agentCapableProvider -> modelProvider "扩展"
        externalConversationProvider -> conversationModel "返回外部会话"
        conversationPersistProvider -> conversationModel "持久化与读取"
        contextProvider -> resolvedAgentConfig "解析并返回"
        agentRuntime -> modelProviderRuntime "获取执行 provider"
        agentRuntime -> contextProvider "使用知识工作区上下文"
        agentRuntime -> resolvedAgentConfig "消费当前 Agent 配置"
        conversationWorkflowController -> modelProviderRuntime "获取普通对话 provider"
        conversationWorkflowController -> agentRuntime "在 Agent 模式下委托执行"
        conversationWorkflowController -> conversationPersistProvider "持久化会话"
        conversationWorkflowController -> conversationModel "创建并更新当前会话"
        modelProvider -> conversationModel "消费消息上下文并产出结果"
        compareWorkflowController -> modelProviderRuntime "获取对比执行 provider"
        multiModelGroupProvider -> modelProvider "实现"
        multiModelGroupProvider -> modelProviderRuntime "通过其解析成员 provider"
        domAutomationProvider -> modelProvider "实现"
        domAutomationProvider -> domTransport "将页面操作委托给"
        domTransport -> controlledPageCapability "使用 open/evaluate/subscribe"
    }

    views {
        systemContext chatprism "context" {
            include *
        }

        container chatprism "containers" {
            include extensionApp
            include webApp
            include desktopApp
            include syncServer
            include sharedPackages
            include user
            include chatgptWeb
            include geminiApi
            include geminiWeb
            include knowledgeRepo
        }

        component sharedPackages "shared-packages" {
            include *
        }

        component coreAbstractions "core-abstractions" {
            include *
        }

        component uiMarkdownEditing "ui-markdown-editing" {
            include *
        }

        theme default
    }
}
