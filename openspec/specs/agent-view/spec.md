## ADDED Requirements

### Requirement: Agent view MUST provide editable owner agent configuration
The system MUST let the user edit the selected owner directory's direct Agent configuration from `AgentView`. The editable fields MUST include target model provider, target model name, description, system prompt instructions, tools, and inheritance mode. The editor MUST persist those fields to the owner directory's `.agent.json` and refresh the resolved workspace context after a successful save.

#### Scenario: Edit the owner agent description
- **WHEN** the user changes the description in `AgentView` and saves
- **THEN** the system MUST write the new description to the selected owner directory's `.agent.json`
- **AND** the refreshed Agent metadata MUST expose the new description through the resolved Agent configuration

#### Scenario: Edit the owner agent system prompt
- **WHEN** the user changes the system prompt in `AgentView` and saves
- **THEN** the system MUST write the new prompt to the selected owner directory's `.agent.json`
- **AND** the refreshed Agent metadata MUST expose the new prompt through the resolved Agent configuration

#### Scenario: Edit the owner agent model selection
- **WHEN** the user chooses a model provider and model in `AgentView` and saves
- **THEN** the system MUST write `modelProviderName` and `modelName` to the selected owner directory's `.agent.json`
- **AND** future Agent requests for that owner Agent MUST use the saved model selection when it is available

#### Scenario: Edit the owner agent inheritance mode
- **WHEN** the user changes the inheritance mode in `AgentView` and saves
- **THEN** the system MUST write the corresponding inheritance behavior to the selected owner directory's `.agent.json`
- **AND** the refreshed Agent metadata MUST reflect the resolved prompt and model behavior for that inheritance mode

#### Scenario: Display the current resolved tools by default
- **WHEN** `AgentView` renders the tools selector for an owner directory
- **THEN** the system MUST initialize the selected tools from the current resolved `agent.tools`
- **AND** the rendered tool list MUST match the currently resolved tools set for that owner Agent

#### Scenario: Inherit parent tools in read-only mode
- **WHEN** the user enables the tools inheritance switch in `AgentView`
- **THEN** the system MUST display the resolved tools set in read-only mode
- **AND** saving MUST remove `tools` from the owner directory's `.agent.json` so the owner fully inherits the parent/default tool set

#### Scenario: Save explicit tool selection
- **WHEN** the user disables the tools inheritance switch, changes the selected tools, and saves
- **THEN** the system MUST write the selected tools to the owner directory's `.agent.json`
- **AND** future Agent requests for that owner Agent MUST expose the saved tool selection when it is available

#### Scenario: Edit the root default agent
- **WHEN** the user selects the workspace root node
- **THEN** the system MUST show `AgentView` for the default Agent
- **AND** saving edits MUST write `/.agent.json`, creating it if it is missing so the root default Agent remains persisted there
- **AND** this root bootstrap behavior MUST NOT apply to arbitrary non-owner directories

#### Scenario: Preserve unsupported agent config fields during save
- **WHEN** the user saves changes from `AgentView`
- **THEN** the system MUST preserve existing `.agent.json` fields that are not edited by this view, including `name`, `skills`, `linkDir`, and unknown fields
- **AND** the system MUST NOT rewrite the Agent config as only the visible form fields

#### Scenario: Load model choices through the existing provider catalog
- **WHEN** `AgentView` renders model selection controls
- **THEN** the system MUST use the provider and model catalog already available to the workspace UI
- **AND** the system MUST NOT introduce a second model provider runtime path for Agent config editing

#### Scenario: Load tool choices through the existing builtin tool catalog
- **WHEN** `AgentView` renders tool selection controls
- **THEN** the system MUST use the builtin tool catalog already exposed by the shared workspace runtime
- **AND** the system MUST NOT introduce a second tool definition source for Agent config editing

### Requirement: Knowledge workspace MUST preserve node navigation history
The system MUST remember user-initiated knowledge node selections in the shared document workspace and provide top-level back and forward controls for revisiting nodes in that history.

#### Scenario: Navigate backward and forward between visited nodes
- **WHEN** the user opens multiple knowledge nodes from the file tree
- **THEN** the workspace MUST enable a back control after at least two distinct node visits
- **AND** activating the back control MUST reopen the previous visited node
- **AND** activating the forward control after a back navigation MUST reopen the next visited node

#### Scenario: Opening a new node truncates forward history
- **WHEN** the user navigates backward in node history and then opens a different node from the file tree
- **THEN** the workspace MUST append the newly opened node after the current history entry
- **AND** the workspace MUST discard any previously available forward history

#### Scenario: Internal restores do not pollute history
- **WHEN** the workspace restores saved selection state or opens a node as part of back/forward history navigation
- **THEN** the workspace MUST NOT add duplicate history entries for that internal navigation

### Requirement: Chat message rendering MUST respect user scroll position
The normal chat view MUST avoid forcing the message list to the bottom while assistant content is appended asynchronously if the user has scrolled upward.

#### Scenario: User scrolls upward during asynchronous assistant rendering
- **WHEN** assistant message content is appended while the user is no longer near the bottom of the message list
- **THEN** the chat view MUST keep the user's current scroll position
- **AND** it MUST NOT automatically scroll to show the latest appended content

#### Scenario: Conversation selection starts at the beginning
- **WHEN** the displayed conversation changes
- **THEN** the chat view MAY position the message list at the top of the conversation by default
- **AND** preview mode MUST continue to start at the top

## REMOVED Requirements

### Requirement: Agent view MUST list owner documents
**Reason**: Owner directory documents already belong to the left file tree. Keeping a second document list in middle-pane `AgentView` duplicates navigation and competes with the Agent editor.

**Migration**: Directory documents remain available through the existing left file tree. `AgentView` becomes a compact owner overview with its editor inside the top expandable area.

### Requirement: Agent view MUST list local conversations by agent key
**Reason**: Agent-scoped conversation list and detail behavior already belongs to the right-side `AgentPane`; keeping another conversation list in middle-pane `AgentView` duplicates state and navigation.

**Migration**: Directory-level Agent conversations remain available through the existing right-side `AgentPane` when the selected directory is an Agent owner. `AgentView` becomes responsible for owner Agent configuration editing.

### Requirement: Agent view MUST provide a tabbed right-side workspace container
The Agent view MUST provide a tabbed right-side workspace container that hosts both conversation workflows and task workflows for the current workspace selection.

#### Scenario: Render the right-side container for a document selection
- **WHEN** the shared document workspace has an active document selection with Agent context
- **THEN** the Agent view MUST render a right-side workspace container for that selection
- **AND** that container MUST provide both conversation and task tabs

#### Scenario: Render the right-side container for an agent-owner selection
- **WHEN** the shared document workspace has an agent-owner/project selection without an active document
- **THEN** the Agent view MUST render the same right-side workspace container for that selection
- **AND** the available task behavior MUST remain scoped to that same selection
