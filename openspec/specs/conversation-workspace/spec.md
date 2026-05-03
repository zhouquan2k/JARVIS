English | [Chinese](spec.zh-CN.md)

## Purpose
Define shared conversation workspace behavior across chat surfaces, including history management, functional detail rendering, preview/import flows, and workspace file reference handling.

## Requirements

## MODIFIED Requirements

### Requirement: Workspace shell MUST provide shared history sidebar for chat workspace
The system MUST provide `NormalChatView`  `CompareChatView` view，left-sideconversationright-sidequestion， Web  Extension host MUST keep“local / ”switch，view provider ；right-side， MUST syncmountquestionpanellocalhistory， MUST provideconversationstarredfilter，the usercurrent workspace switch“”“onlystarred”view `chatStore.workspaceMode === 'active'`  MUST continue Agent view，switch MUST only，currentconversationsave Agent recovery #### Scenario: Render workspace shell in host app
- **WHEN** Web hosthostenter
- **THEN** The system MUST renderright-side workspace 
- **AND**  MUST “local / ”switch provider currentright-sideviewmountquestionpanel #### Scenario: Treat chat mode as an auxiliary view of the active Agent conversation
- **WHEN** the user Agent switch
- **THEN** The system MUST continuecurrent `currentConversation` detailsview
- **AND** The system MUST NOT currentconversation Agent recovery ### Requirement: External workspace MUST provide secondary provider selection
The system MUST “”viewprovide provider ， `ChatGPT``Gemini`  `` supporthistorysearch provider， MUST left-sideexternal historyprovidesearch；search MUST  `chatgpt-web`  `gemini-web` ，switch provider currentload provider resultsupportsearch provider， MUST search #### Scenario: Switch external provider within external workspace
- **WHEN** the userswitch“” `ChatGPT`  `Gemini`
- **THEN** The system MUST current workspace left-sideexternal historylist
- **AND** right-side MUST continueview #### Scenario: Reuse the shared query when switching searchable providers
- **WHEN** the user `chatgpt-web`  `gemini-web` searchswitchsupportsearch provider
- **THEN**  MUST currentsearch
- **AND** The system MUST the same provider loadresultlist #### Scenario: Hide search box for non-searchable external providers
- **WHEN** the user“” ``
- **THEN** The system MUST external historysearch
- **AND** The system MUST historylist ### Requirement: Workspace shell MUST preserve normal and compare views as right-pane content
The system MUST  `NormalChatView`  `CompareChatView` right-sideview，messagerenderview #### Scenario: Switch content view by mode
- **WHEN** the userswitch
- **THEN** workspace  MUST right-sidemount `NormalChatView`  `CompareChatView`
- **AND**  MUST continue workspace ，right-sideview ### Requirement: Normal chat view MUST support external-history preview mode
The system MUST allowenterexternal history，messagerenderhistorymessageattachment #### Scenario: Preview external conversation in normal pane
- **WHEN** the userexternal history
- **THEN** The system MUST load `Conversation`
- **AND**  MUST enter，allowcontinuemessage ### Requirement: Normal chat view MUST inline import action in existing input area
The system MUST  `NormalChatView` renderreturn，input， #### Scenario: Replace input area with inline import action
- **WHEN** external history
- **THEN** The system MUST messageinputattachment
- **AND** The system MUST the samereturn ### Requirement: Importing previewed history MUST activate local conversation for follow-up
The system MUST the userexternal history，messageattachmentsavelocalconversation，automaticallyswitchsupportcontinue #### Scenario: Import previewed conversation and continue chat
- **WHEN** the userexternal historysave
- **THEN** The system MUST  `Conversation` savelocal
- **AND** The system MUST currentconversationswitchlocalconversationrecoveryinput ## ADDED Requirements ### Requirement: Local history sidebar MUST provide manual agent binding for local conversations
The system MUST left-sidelocalhistorylist，localconversationprovide Agent  MUST supportconversationcurrentresolve Agentdefaultscope Agent， #### Scenario: Bind a local conversation to a scoped agent from the sidebar
- **WHEN** the userleft-sidelocalhistory“ Agent” scoped Agent
- **THEN** The system MUST conversation `conversation.agentKey` update Agent  key
- **AND** update MUST localconversation #### Scenario: Clear an existing agent binding from the sidebar
- **WHEN** the userleft-sidelocalhistory“”
- **THEN** The system MUST conversation `conversation.agentKey`
- **AND** conversation MUST  `agentKey`  Agent conversationlist #### Scenario: Load binding candidates from the workspace context
- **WHEN** the userleft-sidelocalhistory“ Agent”
- **THEN** The system MUST current `contextProvider.getContext()` return `agentConfigs`  Agent list
- **AND** list MUST defaultscope Agent currentresolve scoped agents #### Scenario: Bind a new knowledge-workspace conversation to the currently selected agent
- **WHEN** the user creates a new local conversation from the knowledge workspace while a node already resolves to an effective Agent
- **THEN** The system MUST persist that effective Agent as the conversation's initial `conversation.agentKey`
- **AND** the initial binding MUST come from the selected node's effective Agent at creation time, not from later UI selection changes #### Scenario: Prefer the persisted conversation binding for follow-up execution
- **WHEN** an existing local conversation already has a persisted `conversation.agentKey`
- **AND** the user reopens that conversation from any workspace surface and sends a follow-up message
- **THEN** The system MUST execute the follow-up using the Agent context resolved from that persisted conversation binding
- **AND** The system MUST NOT replace that conversation's Agent tools, instructions, or model selection only because the currently selected node resolves to a different Agent ### Requirement: Normal chat view MUST support multimodal attachment composition
The system MUST inputsupportimageattachmentinput，attachment #### Scenario: Queue attachments before sending
- **WHEN** the userinputimage
- **THEN** The system MUST inputattachment
- **AND** the user MUST attachment #### Scenario: Reject oversized attachment
- **WHEN** the user 10MB attachment
- **THEN** The system MUST 
- **AND** The system MUST prompt ### Requirement: Conversation history MUST persist the actual sent request content
The system MUST “”the usermessagehistorysole，inputbodybodyenterautomatically， MUST the usermessage `content`  `attachments`  #### Scenario: Persist an auto-attached current document in user history
- **WHEN** knowledge workspacethe usermessageautomaticallycurrentdocument
- **THEN** The system MUST documentthe usermessageattachmenthistory
- **AND** documentprompt，prompt MUST the usermessagebody #### Scenario: Replay follow-up turns from the persisted actual request
- **WHEN** the userautomaticallydocumentmessagecontinue follow-up
- **THEN**  provider history MUST the usermessage `content`  `attachments` 
- **AND** The system MUST NOT current ### Requirement: Assistant message rendering MUST support structured annotations
The system MUST  `text + annotations` rendermessage，supportbody #### Scenario: Render cite annotation in assistant message
- **WHEN** message `cite`  `range` bodyvisibletext
- **THEN** The system MUST textrender
- **AND** The system MUST the user #### Scenario: Render image group annotation in assistant message
- **WHEN** message `image_group` 
- **THEN** The system MUST renderimage
- **AND** The system MUST supportenter ### Requirement: Workspace thread MUST provide dark minimalist presentation
The system MUST provide， #### Scenario: Render dark workspace thread
- **WHEN** the userenter
- **THEN** The system MUST render
- **AND**  MUST defaultonly hover  focus  ### Requirement: Sidebar new chat entry MUST use split-button interaction
The system MUST left-side“”：create，right-side（/） #### Scenario: Primary click starts normal chat
- **WHEN** the user“”
- **THEN** The system MUST createconversation
- **AND** The system MUST  #### Scenario: Secondary click opens mode menu
- **WHEN** the user“”right-side
- **THEN** The system MUST provide“”“”
- **AND** the user“” MUST switchworkflow ### Requirement: Sidebar history list MUST remain compact and title-first
The system MUST titleconversationlist， #### Scenario: Render compact history row
- **WHEN** renderconversationhistory
- **THEN**  MUST title，
- **AND** The system MUST NOT historydefault“local”text ### Requirement: Workspace thread MUST use role-driven alignment without role labels
The system MUST messagethe usermessage，bodyexplicit #### Scenario: Render aligned conversation messages
- **WHEN** conversationrenderthe usermessage
- **THEN** the usermessage MUST right-side
- **AND** message MUST left-sidebodyrender
- **AND** The system MUST NOT messagebodyrender `YOU`  `ASSISTANT`  ### Requirement: Citation rendering MUST provide inline clickable references
The system MUST bodyrender，onlymessagelist #### Scenario: Render inline citation links
- **WHEN** messageresolve URL  `cite` 
- **THEN** The system MUST bodyrender
- **AND**  MUST navigation ### Requirement: Normal chat workspace MUST integrate question index panel with conversation state
The system MUST currentconversationquestionpanelmain threadrenderthe sameconversation；switchexternal history，The system MUST questionpanel，continue #### Scenario: Show question index only for active normal chat
- **WHEN** the usercurrentconversationthe userquestion
- **THEN**  MUST renderconversationquestionpanel
- **AND** the userswitch， MUST conversationquestion ### Requirement: Normal chat input MUST follow desktop composition shortcuts
The system MUST inputtext： `Enter` only， `Ctrl + Enter`  `Cmd + Enter` currentThe system MUST inputprovidevisibleprompt，rule #### Scenario: Insert newline with bare Enter
- **WHEN** the userinput `Enter`  `Ctrl`  `Meta`
- **THEN** The system MUST input
- **AND** The system MUST NOT message #### Scenario: Send message with modifier shortcut
- **WHEN** the userinput `Ctrl + Enter`  `Cmd + Enter`
- **THEN** The system MUST currentmessage
- **AND** input MUST continuepromptcopy ### Requirement: Aborting generation MUST restore the submitted draft
，The system MUST switch“”the user，The system MUST current，the userpromptinput，automaticallyrecoveryinput，the usercontinue #### Scenario: Stop generation and refill prompt
- **WHEN** the user“”
- **THEN** The system MUST current
- **AND** The system MUST the userpromptinputautomatically ### Requirement: Local history sidebar MUST provide hover-only conversation deletion
The system MUST left-sidelocalhistorylistlocalconversationprovideconversationdelete， MUST onlyenter hover  focus ，titledelete MUST external historylist #### Scenario: Reveal delete action only on active history row
- **WHEN** the userlocalhistory，
- **THEN** The system MUST “delete”
- **AND**  hover  focus history MUST NOT  #### Scenario: Delete current conversation from sidebar
- **WHEN** the userleft-sidelocalhistorydeletecurrentconversation
- **THEN** The system MUST deleteconversationleft-sidelist
- **AND**  MUST automaticallyswitchlocalconversation，conversation MUST createconversation #### Scenario: Sidebar delete is unavailable for external preview rows
- **WHEN** the userswitchexternal historylist
- **THEN** The system MUST NOT external historylocalconversationdelete
- **AND** delete MUST onlylocalconversation ### Requirement: Sidebar history list MUST support conversation-level starring for local conversations
The system MUST allowthe userleft-sidelocalhistorylistlocalconversationstarredstarred，conversationlistselectedkeepcapability MUST onlylocalconversation，external historylist #### Scenario: Toggle star state for a local conversation from the sidebar
- **WHEN** the userleft-sidelocalconversationhistorystarred
- **THEN** The system MUST switchconversationconversationstarredsave
- **AND** conversation MUST starredstarred #### Scenario: Keep starred state available after reopening the workspace
- **WHEN** the userlocalconversationstarredenter
- **THEN** The system MUST recoveryconversationstarred
- **AND** “onlystarred”filter MUST continue #### Scenario: Do not expose conversation starring for external history rows
- **WHEN** the userswitchexternal historylist
- **THEN** The system MUST NOT external historyconversationstarred
- **AND** starredfilter MUST onlylocalhistorylist ### Requirement: Normal chat workspace MUST render model-specific option controls
The system MUST ，currentselectedmodelrendermodel， MUST currentmodeldirectorykeep #### Scenario: Show model option controls for supported model
- **WHEN** the user，currentmodeldirectorymodel
- **THEN** The system MUST input toggle 
- **AND**  toggle  tooltip  `aria-label`  MUST currentmodel option  #### Scenario: Hide model option controls when model has no options
- **WHEN** the usercurrentselectedmodel
- **THEN** The system MUST rendermodel
- **AND** input MUST continuekeep #### Scenario: Disable model option controls while chat input is unavailable
- **WHEN** current Provider modeldirectoryload
- **THEN** The system MUST model
- **AND**  MUST  Provider/Model selectorkeep ### Requirement: Normal chat workspace MUST persist and restore conversation model selection
The system MUST conversation `providerId``modelId` conversationsave，the userswitchconversationrecovery #### Scenario: Restore saved model selection when opening a conversation
- **WHEN** the usersave `modelSelection` localconversation
- **THEN** The system MUST recoveryconversation `providerId``modelId` 
- **AND** message MUST defaultrecoveryconfiguration #### Scenario: Drop incompatible options after switching model
- **WHEN** the usercurrentconversationswitchmodel，modelsupport
- **THEN** The system MUST automaticallycompatible
- **AND** The system MUST onlymodelsupport，modeldefault #### Scenario: Resolve conflicting options through normalized conversation state
- **WHEN** the usercurrentconversation
- **THEN** The system MUST automaticallysavenormalizeconversationconfiguration
- **AND**  MUST normalize ### Requirement: Normal chat view MUST surface host recovery actions for recoverable external-history failures
The system MUST allowexternal historyrecoveryhosterror，hostrecoverycopy，staticerrorpromptrecovery MUST support `gemini-web`  `AUTH_REQUIRED` #### Scenario: Render a host recovery action for Gemini auth failure
- **WHEN** current `gemini-web` external historylist，error `AUTH_REQUIRED`
- **THEN** `NormalChatView` MUST errorhostrecoverycopy ` Gemini` 
- **AND** input MUST continuekeep，recovery #### Scenario: Bubble the recovery request to the host application
- **WHEN** the userexternal historyerrorhostrecovery
- **THEN** `NormalChatView` MUST  `request-host-recovery`
- **AND** `ConversationWorkspaceView` MUST continuehost，shared UI  desktop 

### Requirement: Conversation workspace MUST expose archive only for agent-bound Markdown documents
The conversation workspace MUST expose an archive action in `NormalChatView` only when the workspace is in agent mode and the currently selected node is the active writable Markdown document. The action MUST NOT be shown for normal chat mode, compare mode, external preview mode, directory selections, non-Markdown files, or read-only documents.

#### Scenario: Show archive action for the active agent Markdown document
- **WHEN** `chatStore.workspaceMode` is `agent`
- **AND** the selected node path matches the active document path
- **AND** the active document MIME type is `text/markdown`
- **AND** the active document is writable
- **THEN** the system MUST render an archive action in `NormalChatView`

#### Scenario: Hide archive action outside eligible archive context
- **WHEN** the workspace is not in agent mode, or the selected node is not the active writable Markdown document
- **THEN** the system MUST NOT render the archive action

### Requirement: Conversation workspace MUST archive without confirmation and preserve chat continuity
When the user triggers archive from an eligible agent conversation, the system MUST execute the archive immediately without a preview-confirmation step. The workspace MUST keep the current conversation view active and provide lightweight completion feedback instead of switching to a dedicated archive preview mode.

#### Scenario: Archive runs immediately from the chat action
- **WHEN** the user clicks the archive action in an eligible agent conversation
- **THEN** the system MUST start the archive operation immediately
- **AND** the system MUST NOT require a preview confirmation before writing the merged document

#### Scenario: Preserve current chat view after archive
- **WHEN** an archive operation succeeds, produces no change, or fails
- **THEN** the system MUST keep the current conversation view mounted
- **AND** the system MUST provide non-blocking success, no-change, or failure feedback in the chat workspace

### Requirement: Conversation workspace MUST display persisted archive state for the current conversation
The conversation workspace MUST show the current conversation's persisted archive state in the chat UI whenever the archive action is relevant, so users can tell whether the conversation has never been archived, is archived and current, or has become stale.

#### Scenario: Show archived status after a successful archive
- **WHEN** the current eligible agent conversation has persisted archive metadata and no later visible messages beyond the archived snapshot
- **THEN** the system MUST display an archived status indicator in `NormalChatView`

#### Scenario: Show stale status after new turns arrive
- **WHEN** the current eligible agent conversation has persisted archive metadata and later gains additional visible messages
- **THEN** the system MUST display a stale archive status indicator in `NormalChatView`

#### Scenario: Show unarchived status before the first archive
- **WHEN** the current eligible agent conversation has no persisted archive metadata
- **THEN** the system MUST display an unarchived status indicator in `NormalChatView`

### Requirement: Local history sidebar MUST support local conversation rename
The conversation workspace MUST allow users to rename local conversation history entries in the shared sidebar. The rename operation MUST persist through the configured conversation persistence provider and MUST NOT be available for external history preview rows.

#### Scenario: Rename a local conversation from the sidebar
- **WHEN** the user edits a local conversation title and submits the rename
- **THEN** the system MUST persist the trimmed title on that local conversation
- **AND** the local history list MUST show the updated title

#### Scenario: Rename the active local conversation
- **WHEN** the user renames the currently active local conversation
- **THEN** the system MUST update both the persisted conversation and the active conversation state
- **AND** the active chat header or toolbar title MUST use the updated title after refresh

#### Scenario: Do not rename external history rows
- **WHEN** the sidebar is showing external history results
- **THEN** the system MUST NOT expose the local conversation rename action for those rows

### Requirement: Normal chat view MUST render shared collapsible functional message parts
The conversation workspace MUST render structured functional message parts in the shared normal chat surface. Functional parts MUST be collapsed by default and MUST be available anywhere `NormalChatView` renders assistant messages, including normal chat, Agent pane chat, and previewed or imported conversations.

#### Scenario: Render functional parts collapsed by default
- **WHEN** an assistant message contains one or more `functionalParts`
- **THEN** `NormalChatView` MUST render a functional details section for that message
- **AND** each functional part MUST be collapsed by default

#### Scenario: Expand functional message detail
- **WHEN** the user activates a functional part header
- **THEN** the system MUST expand that part and show its detailed content without changing the assistant answer text

#### Scenario: Keep messages without functional parts unchanged
- **WHEN** an assistant message has no `functionalParts`
- **THEN** the system MUST render the message without an empty functional details section

### Requirement: Conversation workspace MUST support explicit `@filename` file context references
The conversation workspace MUST allow users to reference workspace files in chat input with `@filename` and include those files as additional request context at send time. This capability MUST NOT rewrite the `@filename` text inside the user's question; referenced file contents MUST be injected as standalone prompt sections labeled by filename. File resolution MUST use the effective Agent context for the conversation rather than the entire workspace tree.

#### Scenario: Preserve the existing first-turn current-document behavior
- **WHEN** the user sends the first message of a conversation
- **THEN** the system MUST preserve the existing auto-include behavior for the current selected document
- **AND** the new `@filename` behavior MUST act as an additional context mechanism rather than replacing that first-turn flow

#### Scenario: Inject standalone context sections for `@filename` on any turn
- **WHEN** the user sends a message containing one or more `@filename` references
- **THEN** the system MUST append a standalone context section for each successfully resolved file
- **AND** each section MUST explicitly label the corresponding filename
- **AND** the original `@filename` text MUST remain in the user's question

#### Scenario: Unbound conversations resolve references from the default Agent context
- **WHEN** the conversation is not explicitly bound to an Agent
- **THEN** `@filename` resolution MUST use the current default active Agent scope
- **AND** files outside that Agent scope MUST NOT participate in basename ambiguity checks

#### Scenario: Only inject a repeated file once
- **WHEN** the user references the same resolved file path multiple times in one message
- **THEN** the system MUST inject that file content only once

#### Scenario: Block send on missing or ambiguous references
- **WHEN** an `@filename` does not resolve to a unique file inside the current Agent context
- **THEN** the system MUST block the send
- **AND** the system MUST show a clear missing-file or ambiguous-match error instead of guessing
