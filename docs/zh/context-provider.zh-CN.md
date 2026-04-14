[English](../context-provider.md) | [中文](context-provider.zh-CN.md)

# Context Provider

本文汇总知识工作区中 `IContextProvider` 的架构关系，重点说明 `AgentPane`、会话列表、持久化和作用域上下文查询如何协作。

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
    AgentConversationPanel --> IContextProvider : 列出文档关联会话
    AgentConversationPanel --> ChatStore : 当前会话状态
    AgentConversationPanel --> AgentDocumentConversationList : 列表模式
    AgentConversationPanel --> NormalChatView : 详情模式
    ChatStore --> Conversation : 持久化关联
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
    FileSystemContextProvider --> IConversationQueryProvider : 委托查询
    HttpContextService --> IContextProvider : 纯转发
    HttpContextProvider ..> HttpContextService : POST /api/context/get-conversations
    AgentConversationPanel --> IContextProvider : getConversations({ documentPath })
    DesktopContextIPC --> FileSystemContextProvider : 本地回退
    DesktopContextIPC --> HttpContextProvider : 远程上下文模式
    SyncRepository --> Conversation : 按 documentPath 组装和过滤
```

## 说明

* `Conversation.documentPaths` 是按文档维度查询会话的持久化基础。

* `IContextProvider.getConversations(query)` 是工作区面板使用的统一查询入口。

* `AgentConversationPanel` 负责列表/详情状态，`IContextProvider` 负责数据查询。

