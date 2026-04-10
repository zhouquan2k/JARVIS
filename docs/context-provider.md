# Context Provider

这份文档汇总知识工作区 `IContextProvider` 相关的类图，重点说明右侧 `AgentPane`、会话列表、会话持久化和上下文查询之间的关系。

## Workspace / Panel Relationship

```mermaid
classDiagram
    class Conversation {
      +string id
      +string title
      +string? agentKey
      +string[]? documentPaths
      +ConversationMessage[] messages
      +number updatedAt
    }

    class ChatStore {
      +setWorkspaceContext(...)
      +sendDraft()
      +applyConversationDocumentRelation(...)
    }

    class IContextProvider {
      +getContext()
      +readDocument(path)
      +getConversations(query)
    }

    class AgentPane {
      +activeAgent
      +activeAgentKey
      +activePath
      +activeDocument
    }

    class AgentConversationPanel {
      +panelMode
      +openConversationList()
      +openConversationDetail(conversationId)
      +createDocumentConversation()
      +syncPanelStateFromSelection()
    }

    class AgentDocumentConversationList {
      +documentPath
      +documentName
      +conversations
    }

    class NormalChatView {
      +render detail thread
    }

    AgentPane --> AgentConversationPanel : render
    AgentConversationPanel --> IContextProvider : list document conversations
    AgentConversationPanel --> ChatStore : current conversation state
    AgentConversationPanel --> AgentDocumentConversationList : list mode
    AgentConversationPanel --> NormalChatView : detail mode
    ChatStore --> Conversation : persist relation
```

## Context Query Flow

```mermaid
classDiagram
    class Conversation {
      +string id
      +string title
      +string? agentKey
      +string[]? documentPaths
      +number updatedAt
    }

    class ConversationQuery {
      +string? documentPath
    }

    class IConversationQueryProvider {
      <<interface>>
      +getConversations(query: ConversationQuery) Promise~Conversation[]~
    }

    class IContextProvider {
      <<interface>>
      +getContext() Promise~WorkspaceContext~
      +getConversations(query: ConversationQuery) Promise~Conversation[]~
      +readDocument(path: string) Promise~ContextDocument~
    }

    class FileSystemContextProvider {
      -conversationQueryProvider: IConversationQueryProvider
      +getConversations(query: ConversationQuery) Promise~Conversation[]~
    }

    class SyncRepository {
      +getConversations(query: ConversationQuery) Promise~Conversation[]~
    }

    class HttpContextService {
      -provider: ContextProvider
      +getConversations(query: ConversationQuery) Promise~Conversation[]~
    }

    class HttpContextProvider {
      +getConversations(query: ConversationQuery) Promise~Conversation[]~
    }

    class AgentConversationPanel {
      +loadDocumentConversations(path: string) Promise~void~
    }

    class DesktopContextIPC {
      +registerContextIpc(...)
    }

    IConversationQueryProvider <|.. SyncRepository
    IContextProvider <|.. FileSystemContextProvider
    IContextProvider <|.. HttpContextProvider
    FileSystemContextProvider --> IConversationQueryProvider : delegate query
    HttpContextService --> IContextProvider : pure forwarding
    HttpContextProvider ..> HttpContextService : POST /api/context/get-conversations
    AgentConversationPanel --> IContextProvider : getConversations({ documentPath })
    DesktopContextIPC --> FileSystemContextProvider : local fallback
    DesktopContextIPC --> HttpContextProvider : remote context mode
    SyncRepository --> Conversation : hydrate / filter by documentPath
```

## Notes

* `Conversation.documentPaths` is the persisted basis for document-scoped conversation lookup.

* `IContextProvider.getConversations(query)` is the single query entry used by the workspace panel.

* `AgentConversationPanel` stays responsible for list/detail state, while `IContextProvider` owns the data query.

