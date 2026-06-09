> **Language**: English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Group provider MUST orchestrate a fixed team preset as a single IModelProvider
The system SHALL provide a model provider with `id = 'group'` that implements the standard `IModelProvider` contract. Its `sendMessage` SHALL NOT call a single model; instead it SHALL dispatch the request to the members of the currently selected team preset. The group provider SHALL resolve each member generically via `resolveMemberProvider(providerId)` and SHALL NOT contain any per-provider special-casing, so any `IModelProvider` (including future providers and the DOM-automation providers) can be a member.

#### Scenario: Broadcast to all members by default
- **WHEN** a user sends a message in a conversation bound to a group team preset
- **AND** the message contains no `@member` mention
- **THEN** the group provider MUST dispatch the prompt concurrently to every member of the preset
- **AND** each member MUST receive the prompt through its own `IModelProvider.sendMessage`

#### Scenario: Resolve members without per-provider branching
- **WHEN** the group provider dispatches to a member with a given `providerId`
- **THEN** it MUST obtain the member instance via `resolveMemberProvider(providerId)`
- **AND** it MUST NOT branch on the concrete provider type when dispatching

### Requirement: Group provider MUST support @mention targeting
The group provider SHALL parse `@memberName` mentions in the prompt. When one or more members are mentioned, only the mentioned members SHALL answer; when no member is mentioned, all members SHALL answer (broadcast). Mentioned members SHALL still answer concurrently.

#### Scenario: Restrict a turn to mentioned members
- **WHEN** a user sends a prompt that mentions one or more members by `@name`
- **THEN** only the mentioned members MUST be dispatched to
- **AND** non-mentioned members MUST NOT receive the prompt for that turn

#### Scenario: Multiple mentions answer concurrently
- **WHEN** a prompt mentions two or more members
- **THEN** all mentioned members MUST be dispatched concurrently

### Requirement: Group provider MUST merge member output into one streamed assistant transcript
The group provider SHALL accumulate each member's streaming output into a per-member buffer and SHALL emit, on each member chunk, a merged transcript through `onUpdate`, segmented per member in a stable order (e.g. `### {name}\n{text}`). The final `ProviderSendResult` SHALL be a single assistant message whose text is the merged transcript.

#### Scenario: Stream merged segments as members reply
- **WHEN** members produce streaming chunks during a turn
- **THEN** each `onUpdate` MUST contain the merged transcript with one labeled segment per responding member
- **AND** segment order MUST be stable across updates within the turn

#### Scenario: Return a single merged assistant message
- **WHEN** all responding members have finished
- **THEN** the group provider MUST resolve a single `ProviderSendResult` whose text is the final merged transcript

### Requirement: Group members MUST be isolated within a turn and share context across turns
Within a single turn, members SHALL NOT see each other's same-turn replies. Across turns, each member SHALL receive the previous turn's full transcript via `options.history`, so prior member replies are visible on the next turn.

#### Scenario: No same-turn cross-visibility
- **WHEN** two members answer the same turn concurrently
- **THEN** neither member's prompt input MUST include the other member's same-turn reply

#### Scenario: Previous turn visible on the next turn
- **WHEN** a new turn begins after a group reply
- **THEN** each member MUST receive the previous turn's merged transcript through `options.history`

### Requirement: Group provider MUST fan out abort to all running members
When `abort()` is called, the group provider SHALL propagate the abort to every member provider instance started in the current turn.

#### Scenario: Abort propagates to all members
- **WHEN** a group turn is in progress with multiple members streaming
- **AND** `abort()` is called on the group provider
- **THEN** `abort()` MUST be called on every member provider instance started this turn
