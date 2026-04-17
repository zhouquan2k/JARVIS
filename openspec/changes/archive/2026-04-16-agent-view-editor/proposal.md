## Why

Agent owner directories currently have a middle-pane `AgentView`, but it is read-only and duplicates the agent conversation list that already exists in the right-side `AgentPane`. Users need a single place to edit an agent's description, model, system prompt, tool selection, and inheritance behavior while keeping conversations in the dedicated right panel.

The current OpenSpec also conflicts with the desired behavior: `agent-view` requires a middle-pane conversation list, while `agent-binding` describes phase-one nearest-parent resolution where `merge` is out of scope. This change aligns the specs and implementation with editable Agent configuration, default inheritance, and explicit override.

## What Changes

- Add an editable Agent configuration form to `AgentView` for description, model provider, model, system prompt, tools, and inheritance mode.
- Add a tools inheritance switch to `AgentView` so the current owner can either inherit the resolved parent tools in read-only mode or explicitly choose its own tools.
- Remove the local conversation list from middle-pane `AgentView`; agent-scoped conversations remain available through the right-side `AgentPane`.
- Define `inheritance` as `merge | override` for `.agent.json`.
- Make `merge` the default inheritance mode: child agents inherit parent configuration and system prompts merge from parent to child.
- Make `override` cut off parent/default inheritance for the current `.agent.json`, using only fields explicitly declared at that level.
- Persist Agent edits back to the owner directory's `.agent.json` and refresh the resolved workspace context.
- Remember knowledge node access history and expose top-level back/forward controls for revisiting previously selected nodes.
- Keep chat content stable during asynchronous assistant rendering: if the user has scrolled upward, new streamed content MUST NOT force the message list back to the bottom, and newly selected conversations may start at the top.
- Update tests and verification around AgentView rendering, config resolution, and `.agent.json` save behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-view`: AgentView changes from a read-only overview with local document/conversation lists into an owner-directory overview and editor; documents and conversations are no longer listed in the middle pane. The shared workspace UI also gains knowledge-node back/forward navigation and non-disruptive chat scrolling during asynchronous rendering.
- `agent-view`: AgentView changes from a read-only overview with local document/conversation lists into an owner-directory overview and editor; documents and conversations are no longer listed in the middle pane. The shared workspace UI also gains tools editing plus read-only inherited tools display, knowledge-node back/forward navigation, and non-disruptive chat scrolling during asynchronous rendering.
- `agent-binding`: `.agent.json` inheritance semantics change from phase-one nearest-parent/override to default merge with explicit override truncation.

## Impact

- Core contracts: `AgentConfig` and `ResolvedAgentConfig` gain explicit inheritance typing.
- Core resolution: scoped Agent config resolution must support default merge and override truncation consistently.
- Shared UI: `AgentView`, `DocumentWorkspaceView`, i18n messages, and related tests change.
- Workspace store: document workspace state needs a save path for patching owner `.agent.json` files.
- Agent tools: tools selection UI must stay aligned with the resolved `agent.tools` defaults and with explicit inherit-vs-override save behavior.
- Agent metadata: description editing must remain consistent with the existing `.agent.json` identity fields and preserve other unsupported fields.
- No new runtime dependency is expected; existing provider/model catalog and context provider write APIs should be reused.
