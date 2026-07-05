English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: ProviderStreamUpdate and ProviderSendResult MUST carry optional group structured fields
`ProviderStreamUpdate` and `ProviderSendResult` SHALL each carry optional `groupMembers` and `groupSummary` fields. These fields are only populated by `MultiModelGroupProvider`; all other providers MUST remain unaffected.

#### Scenario: Group provider emits groupMembers in stream updates
- **WHEN** `MultiModelGroupProvider.sendMessage` emits `onUpdate` during a group turn
- **THEN** the update object MAY include `groupMembers: GroupMemberPart[]` and optionally `groupSummary: GroupSummaryPart`
- **AND** the `text` field MUST still carry the flattened plaintext fallback

#### Scenario: Non-group providers are unaffected
- **WHEN** any provider other than `MultiModelGroupProvider` emits `onUpdate`
- **THEN** `groupMembers` and `groupSummary` MUST be absent from the update object
- **AND** existing consumers of `ProviderStreamUpdate` MUST continue to work without modification

### Requirement: ConversationMessage MUST carry optional group structured fields
`ConversationMessage` SHALL gain optional `groupMembers?: GroupMemberPart[]` and `groupSummary?: GroupSummaryPart` fields. The existing `content` field MUST be retained as a flattened plaintext fallback for search, export, and legacy rendering.

#### Scenario: Group turn message stores structured fields alongside content
- **WHEN** the chat store processes a group turn result
- **THEN** `lastMsg.groupMembers` and `lastMsg.groupSummary` MUST be written from the provider result
- **AND** `lastMsg.content` MUST still contain the flattened Markdown text

#### Scenario: Messages without group fields render via existing path
- **WHEN** a `ConversationMessage` has no `groupMembers` field
- **THEN** the rendering system MUST use the existing `MarkdownContent` path for that message
- **AND** no runtime errors SHALL occur due to the absent field
