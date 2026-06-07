// English primary: docs/workspace.dsl | Chinese mirror: docs/zh/workspace.zh-CN.dsl
workspace "ChatPrism" "Context and container views for the current codebase" {

    model {
        user = person "Power AI user" "Starts multi-model chats, compares results, searches history, and curates knowledge."

        chatgptWeb = softwareSystem "ChatGPT Web" "chatgpt.com; login-backed model access and conversation history retrieval."
        geminiApi = softwareSystem "Google Gemini API" "generativelanguage.googleapis.com; model execution, catalog lookup, and comparison analysis."
        geminiWeb = softwareSystem "Gemini Web" "gemini.google.com; browser-controlled history bridging and retrieval."
        knowledgeRepo = softwareSystem "Knowledge Repository" "Local knowledge directories, extension-hosted documents, and imported external files."

        chatprism = softwareSystem "ChatPrism" "A multi-host AI workspace spanning Web, browser extension, Desktop, and sync services." {
            extensionApp = container "Browser Extension App" "Browser-extension host for chat, comparison, history import, and the knowledge workspace; extension mechanisms also carry agent capabilities." "TypeScript, Vue, WXT"
            webApp = container "Web App" "Browser host for chat, comparison, and the knowledge workspace." "TypeScript, Vue, Vite"
            desktopApp = container "Desktop App" "Electron desktop host for chat, comparison, history import, and the knowledge workspace; also carries desktop-only agent and file capabilities." "TypeScript, Vue, Electron"
            syncServer = container "Sync Server" "Provides conversation sync APIs, knowledge context APIs, and provider configuration APIs." "TypeScript, Hono, Node.js"
            sharedPackages = container "Shared Packages" "Runtime-bounded workspace packages: core owns cross-host contracts, ui owns shared interface layers, and node owns Node-only adapters and infrastructure." "TypeScript workspace packages" {
                corePackage = component "packages/core" "Cross-host contracts, domain models, runtime abstractions, and reusable provider/client implementations shared by Web, Extension, Desktop, and Server." "Workspace package"
                uiPackage = component "packages/ui" "Shared UI components, views, and stores reused mainly by Web, Extension, and Desktop renderers." "Workspace package"
                nodePackage = component "packages/node" "Node-only adapters and infrastructure implementations. Currently includes FileSystemContextProvider for Desktop main and the Sync Server." "Workspace package"
            }
            uiMarkdownEditing = container "UI: Markdown Editing" "One-semantic-command, two-native-backends architecture for viewer/edit-mode formatting in the knowledge workspace. Each insert/format feature dispatches to the backend native to the active mode: ProseMirror live commands in viewer mode, source-string ops in edit mode." "Vue, TypeScript, Milkdown/Crepe, ProseMirror" {
                documentEditorPane = component "DocumentEditorPane" "Orchestrates markdown document insert/format commands; dispatches to the active surface (viewer or edit mode). File: packages/ui/src/components/DocumentEditorPane.vue" "Vue component"
                markdownDocumentViewer = component "MarkdownDocumentViewer" "Renders the live Crepe/ProseMirror editor in viewer mode; exposes toggleHighlightInViewer / applyLinkInViewer / insertMarkdownSnippet; dispatches by markdownViewerMode. File: packages/ui/src/document-viewers/MarkdownDocumentViewer.vue" "Vue component"
                markdownViewerCommands = component "MarkdownViewerCommands" "Pure ProseMirror command utilities for viewer-mode formatting: toggleMarkdownHighlightAtViewerSelection, applyMarkdownLinkAtViewerSelection. File: packages/ui/src/utils/markdownDocument.ts" "Utility module"
                sourceTextBackend = component "SourceTextBackend" "Raw Markdown textarea backend for edit mode; performs source-string offset insertions unchanged from before this refactor." "textarea / string ops"
                crepeEditor = component "CrepeEditor" "Milkdown Crepe / ProseMirror live editor instance; viewer-mode commands act directly on EditorView state and dispatch transactions." "@milkdown/crepe, ProseMirror"
            }
            coreAbstractions = container "Core Abstractions" "Relationships among shared interfaces, runtime contracts, and domain objects." "TypeScript interfaces and domain abstractions" {
                modelProviderRuntime = component "ModelProviderRuntime" "Resolves and exposes available model providers and model catalogs. Typical factories: createProviderRuntime, createDesktopHostRuntime." "Interface"
                modelProvider = component "IModelProvider" "Unified contract for model execution. Typical implementations: ChatGPTWebProvider, GeminiApiProvider, DesktopProxyProvider." "Interface"
                agentCapableProvider = component "IAgentCapableProvider" "Extension contract for model providers with native agent execution. Typical current implementation: GeminiApiProvider." "Interface"
                externalConversationProvider = component "IExternalConversationProvider" "Contract for importing external conversations. Typical implementations: ChatGPTWebProvider, GeminiDomHistoryProvider, DesktopHistoryProxy." "Interface"
                conversationPersistProvider = component "IConversationPersistProvider" "Conversation persistence contract. Typical implementations: IndexedDBStorageProvider, SyncStorageProvider." "Interface"
                contextProvider = component "IContextProvider" "Contract for knowledge scope lookup, document I/O, scoped search, and agent configuration resolution. Typical implementations: HttpContextProvider, LocalFileContextProvider, desktop-context bridge." "Interface"
                agentRuntime = component "AgentRuntime" "Entry point for agent request orchestration. Typical factory: createAgentRuntime." "Interface"
                conversationWorkflowController = component "ConversationWorkflowController" "Controller for normal chat workflows. The main current implementation path is useChatStore.sendDraft." "Core service"
                conversationModel = component "Conversation" "Core conversation data model shared by chat, import, and sync flows." "Domain model"
                resolvedAgentConfig = component "ResolvedAgentConfig" "Agent configuration after workspace scope resolution." "Domain model"
                compareWorkflowController = component "CompareWorkflowController" "Controller for dual-model comparison workflows. Typical implementation: CompareWorkflowController." "Core service"
            }
        }

        user -> chatprism "uses" "UI"

        chatprism -> chatgptWeb "sends messages, checks login state, reads conversation history" "HTTPS / Browser Session"
        chatprism -> geminiApi "sends messages, loads model catalogs, runs comparison analysis" "HTTPS"
        chatprism -> geminiWeb "bridges the page and reads Gemini history" "Controlled Page / Content Script"
        chatprism -> knowledgeRepo "reads, writes, and searches knowledge documents and imported files" "Filesystem / HTTP Context / Extension Storage"

        user -> extensionApp "uses" "Browser Extension"
        user -> webApp "uses" "Browser"
        user -> desktopApp "uses" "Desktop UI"

        webApp -> sharedPackages "reuses shared UI, contracts, and workflows" "Workspace Package Imports"
        extensionApp -> sharedPackages "reuses shared UI, contracts, and workflows" "Workspace Package Imports"
        desktopApp -> sharedPackages "reuses shared UI and contracts, and also reuses Node adapters in the main process" "Workspace Package Imports"
        syncServer -> sharedPackages "reuses shared contracts and Node adapters" "Workspace Package Imports"

        webApp -> syncServer "syncs conversations, reads knowledge context through the server, loads provider configuration" "HTTP"
        webApp -> geminiApi "sends messages, loads model catalogs, runs comparison analysis" "HTTPS"

        extensionApp -> syncServer "syncs conversations, reads knowledge context through the server, loads provider configuration" "HTTP"
        extensionApp -> chatgptWeb "sends messages, checks login state, reads history" "HTTPS / Browser Cookies"
        extensionApp -> geminiApi "sends messages, loads model catalogs, runs comparison analysis" "HTTPS"
        extensionApp -> geminiWeb "reads Gemini history" "Content Script / DOM Bridge"

        desktopApp -> syncServer "syncs conversations" "HTTP"
        desktopApp -> chatgptWeb "sends messages, checks login state, reads history" "HTTPS / Session / Cookies"
        desktopApp -> geminiApi "sends messages, loads model catalogs, runs comparison analysis" "HTTPS"
        desktopApp -> geminiWeb "reads Gemini history" "Controlled Page"
        desktopApp -> knowledgeRepo "reads, writes, and searches knowledge documents" "Filesystem"

        syncServer -> knowledgeRepo "reads, writes, and searches knowledge documents" "Filesystem / Database"

        nodePackage -> corePackage "reuses core contracts and provides Node-only implementations"
        uiPackage -> corePackage "reuses shared domain models and interfaces"

        documentEditorPane -> markdownDocumentViewer "calls exposed commands (viewer mode)"
        markdownDocumentViewer -> markdownViewerCommands "delegates formatting in viewer mode"
        markdownDocumentViewer -> sourceTextBackend "delegates formatting in edit mode"
        markdownViewerCommands -> crepeEditor "applies toggleMark / addMark on live selection"

        modelProviderRuntime -> modelProvider "resolves and provides"
        agentCapableProvider -> modelProvider "extends"
        externalConversationProvider -> conversationModel "returns external conversations"
        conversationPersistProvider -> conversationModel "persists and reads"
        contextProvider -> resolvedAgentConfig "resolves and returns"
        agentRuntime -> modelProviderRuntime "gets execution providers"
        agentRuntime -> contextProvider "uses knowledge workspace context"
        agentRuntime -> resolvedAgentConfig "consumes the active agent configuration"
        conversationWorkflowController -> modelProviderRuntime "gets normal chat providers"
        conversationWorkflowController -> agentRuntime "delegates when agent mode is active"
        conversationWorkflowController -> conversationPersistProvider "persists conversations"
        conversationWorkflowController -> conversationModel "creates and updates active conversations"
        modelProvider -> conversationModel "consumes message context and produces results"
        compareWorkflowController -> modelProviderRuntime "gets comparison execution providers"
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
