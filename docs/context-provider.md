[English](context-provider.md) | [中文](zh/context-provider.zh-CN.md)

# Context Provider

This document summarizes the `IContextProvider` architecture used by the knowledge workspace. It focuses on how `AgentPane`, conversation lists, persistence, and scoped context queries work together.

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
      +getProjectDocuments(curNode)
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
      +toggleProjectDocumentPicker()
      +archiveConversationFromToolbar()
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
      +getProjectDocuments(curNode: string) Promise~ProjectDocumentEntry[]~
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

* `IContextProvider.getProjectDocuments(curNode)` is the scoped source of bindable project documents for the active agent or folder.

* `AgentConversationPanel` remains responsible for list/detail state and top-toolbar actions, while `IContextProvider` owns the data query.

* The right-hand panel toolbar is the single place for conversation-level actions in agent mode. It carries expand, create, rebind-document, and archive actions instead of placing archive controls in the input area.

* Rebind-document and archive actions are only shown when there is a current conversation.

* Rebind-document candidates come from `getProjectDocuments(curNode)` and are chosen within the current agent scope instead of reusing the middle pane's current document implicitly.

* The archive action reflects persisted archive state: unarchived or stale conversations appear highlighted and actionable, while already-archived conversations appear disabled.

