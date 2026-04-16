English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Agent view MUST render only for selected agent owner directories
The system MUST treat `AgentView` as a directory-level overview of agent assets and render it only when the currently selected node in the knowledge workspace is a directory with `isAgentOwner === true`. `AgentView` MUST consistently obtain the current agent through `ownerNode.agentKey` and `agentConfigs[agentKey]` rather than resolving it separately by path.

#### Scenario: Render agent view for an owner directory
- **WHEN** the user selects a directory node in the knowledge workspace and that node's `isAgentOwner` is `true`
- **THEN** the system MUST render `AgentView` in the main middle panel
- **AND** `AgentView` MUST use that node's `agentKey` and `agentConfigs[agentKey]` as the current agent data source

#### Scenario: Do not render agent view for a non-owner selection
- **WHEN** the user selects a file node or selects a directory node where `isAgentOwner !== true`
- **THEN** the system MUST NOT render `AgentView`
- **AND** the main middle panel MUST continue showing the existing document viewing or editing content

### Requirement: Agent view MUST display current agent details and scoped markdown documents
`AgentView` MUST show the current agent's name, scope, model, and effective prompt, and it MUST show only the Markdown document list under the current owner directory subtree. That document list MUST be filtered from `ownerNode.children` for `.md` and `.markdown` files rather than re-requesting the provider.

#### Scenario: Show agent metadata in the agent view
- **WHEN** `AgentView` successfully resolves the current agent using an `agentKey`
- **THEN** the system MUST display that agent's name, scope, model, and effective prompt
- **AND** that information MUST come from `agentConfigs[agentKey]`

#### Scenario: List only markdown documents under the owner subtree
- **WHEN** `AgentView` renders the current owner directory's document list
- **THEN** the system MUST list only `.md` and `.markdown` files in that directory subtree
- **AND** the system MUST NOT list `.agent.json`, PDF, or other non-Markdown files

#### Scenario: Open a markdown document from the agent view
- **WHEN** the user clicks a Markdown document in `AgentView`
- **THEN** the system MUST open that document and switch the main panel to the corresponding document viewing or editing state
- **AND** the system MUST keep the chat area on the right-side `AgentPane`

### Requirement: Agent view MUST list local conversations by agent key
`AgentView` MUST show the local conversation list for the current agent and use `conversation.agentKey === current agentKey` as the only filter condition. This rule MUST apply both to real directory agents and to the provider's internal default fallback agent, as long as the conversation was answered under that key in the knowledge workspace agent flow.

#### Scenario: Show only local conversations belonging to the current agent key
- **WHEN** `AgentView` renders the current agent's conversation list
- **THEN** the system MUST show only local conversations where `conversation.agentKey === current agentKey`
- **AND** the system MUST NOT mix in normal chat conversations without an `agentKey` or conversations from other agents

#### Scenario: Include manually bound local conversations in the agent view
- **WHEN** the user manually binds a local conversation to the current `agentKey` in the normal conversation workspace
- **THEN** `AgentView` MUST treat that conversation as a local conversation for the current agent and show it
- **AND** the system MUST NOT require that conversation to come from the knowledge workspace's automatic binding flow

#### Scenario: Switch to a local conversation from the agent view
- **WHEN** the user clicks a conversation record in `AgentView`
- **THEN** the system MUST switch the current local active conversation to that record
- **AND** the right-side `AgentPane` MUST display that conversation's message thread
