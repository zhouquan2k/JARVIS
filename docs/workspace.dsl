workspace "ChatPrism" "Context and Container views for current codebase" {

    model {
        user = person "重度 AI 对话用户" "发起多模型聊天、结果对比、历史检索、知识整理"

        chatgptWeb = softwareSystem "ChatGPT Web" "chatgpt.com；网页登录型模型调用与历史读取"
        geminiApi = softwareSystem "Google Gemini API" "generativelanguage.googleapis.com；模型推理、模型目录获取、对比分析"
        geminiWeb = softwareSystem "Gemini Web" "gemini.google.com；历史会话页面桥接与读取"
        knowledgeRepo = softwareSystem "用户知识资料库" "本地知识目录、扩展托管文档与外部导入文件"

        chatprism = softwareSystem "ChatPrism" "多宿主 AI 工作台，支持 Web、浏览器扩展、Desktop 与同步服务" {
            extensionApp = container "Browser Extension App" "浏览器扩展宿主；提供聊天、对比、历史导入、知识工作区，并通过扩展机制承载代理能力" "TypeScript, Vue, WXT"
            webApp = container "Web App" "Web 宿主；提供聊天、对比、知识工作区" "TypeScript, Vue, Vite"
            desktopApp = container "Desktop App" "Electron 桌面宿主；提供聊天、对比、历史导入、知识工作区，并通过桌面宿主承载代理与文件能力" "TypeScript, Vue, Electron"
            syncServer = container "Sync Server" "提供会话同步、知识上下文 API 与 provider 配置 API" "TypeScript, Hono, Node.js"
            coreAbstractions = container "Core Abstractions" "用于表达共享核心接口、运行时契约与领域对象之间的关系" "TypeScript interfaces and domain abstractions" {
                modelProviderRuntime = component "ModelProviderRuntime" "统一解析并提供可用的模型 provider 与模型目录。典型实现/工厂：createProviderRuntime, createDesktopHostRuntime" "Interface"
                modelProvider = component "IModelProvider" "统一模型调用契约。典型实现：ChatGPTWebProvider, GeminiApiProvider, DesktopProxyProvider" "Interface"
                agentCapableProvider = component "IAgentCapableProvider" "具备原生 Agent 执行能力的模型 provider 扩展契约。当前典型实现：GeminiApiProvider" "Interface"
                externalConversationProvider = component "IExternalConversationProvider" "外部会话来源契约。典型实现：ChatGPTWebProvider, GeminiDomHistoryProvider, DesktopHistoryProxy" "Interface"
                conversationPersistProvider = component "IConversationPersistProvider" "会话持久化契约。典型实现：IndexedDBStorageProvider, SyncStorageProvider" "Interface"
                contextProvider = component "IContextProvider" "知识目录、文档读写、作用域搜索与 Agent 解析契约。典型实现：HttpContextProvider, LocalFileContextProvider, desktop-context bridge" "Interface"
                agentRuntime = component "AgentRuntime" "Agent 请求编排入口。典型实现/工厂：createAgentRuntime" "Interface"
                conversationWorkflowController = component "ConversationWorkflowController" "普通对话工作流编排器。当前主要实现位置：useChatStore.sendDraft" "Core service"
                conversationModel = component "Conversation" "聊天、导入、同步共用的核心会话数据模型" "Domain model"
                resolvedAgentConfig = component "ResolvedAgentConfig" "作用域解析后的 Agent 配置" "Domain model"
                compareWorkflowController = component "CompareWorkflowController" "双模型对比工作流编排器。典型实现：CompareWorkflowController" "Core service"
            }
        }

        user -> chatprism "使用" "UI"

        chatprism -> chatgptWeb "发送消息、检查登录态、读取会话历史" "HTTPS / Browser Session"
        chatprism -> geminiApi "发送消息、获取模型列表、执行对比分析" "HTTPS"
        chatprism -> geminiWeb "桥接页面并读取 Gemini 历史" "Controlled Page / Content Script"
        chatprism -> knowledgeRepo "读取、写入、搜索知识文档与导入文件" "Filesystem / HTTP Context / Extension Storage"

        user -> extensionApp "使用" "Browser Extension"
        user -> webApp "使用" "Browser"
        user -> desktopApp "使用" "Desktop UI"

        webApp -> syncServer "同步会话、通过服务端读取知识上下文、获取 provider 配置" "HTTP"
        webApp -> geminiApi "发送消息、获取模型列表、执行对比分析" "HTTPS"

        extensionApp -> syncServer "同步会话、通过服务端读取知识上下文、获取 provider 配置" "HTTP"
        extensionApp -> chatgptWeb "发送消息、检查登录态、读取历史" "HTTPS / Browser Cookies"
        extensionApp -> geminiApi "发送消息、获取模型列表、执行对比分析" "HTTPS"
        extensionApp -> geminiWeb "读取 Gemini 历史" "Content Script / DOM Bridge"

        desktopApp -> syncServer "同步会话" "HTTP"
        desktopApp -> chatgptWeb "发送消息、检查登录态、读取历史" "HTTPS / Session / Cookies"
        desktopApp -> geminiApi "发送消息、获取模型列表、执行对比分析" "HTTPS"
        desktopApp -> geminiWeb "读取 Gemini 历史" "Controlled Page"
        desktopApp -> knowledgeRepo "读取、写入、搜索知识文档" "Filesystem"

        syncServer -> knowledgeRepo "读取、写入、搜索知识文档" "Filesystem / Database"

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
            include user
            include chatgptWeb
            include geminiApi
            include geminiWeb
            include knowledgeRepo
        }

        component coreAbstractions "core-abstractions" {
            include *
        }

        theme default
    }
}
