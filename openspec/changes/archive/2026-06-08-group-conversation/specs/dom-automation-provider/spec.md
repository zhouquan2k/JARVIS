> **Language**: English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: DOM-automation provider MUST drive real site pages as a standard IModelProvider
The system SHALL provide a desktop-only model provider, instantiated as `chatgpt-dom` and `gemini-dom`, that implements the standard `IModelProvider` contract by driving the real target site page rather than reverse-engineering its HTTP backend. Each instance SHALL be configured with its own `targetUrl`. The provider SHALL remain platform-agnostic (no site selectors inside the provider) so it can be used standalone or as a group member.

#### Scenario: Send a prompt by driving the page
- **WHEN** a user sends a message using a DOM-automation provider
- **THEN** the provider MUST ensure the target site page is loaded in a controlled page
- **AND** the provider MUST inject the prompt and trigger submission on that page

#### Scenario: Usable standalone and as a group member
- **WHEN** a DOM-automation provider id appears in a group team preset
- **THEN** the group provider MUST be able to use it as a member without any group-side change

### Requirement: DOM-automation provider MUST stream replies via controlled-page event subscription
The provider SHALL generate a `requestId` per send, subscribe to controlled-page events for its `providerId`, and inject the prompt with that `requestId`. It SHALL emit `onUpdate` for each `chunk` event and resolve on the `done` event. It SHALL ignore events whose `requestId` does not match the current send.

#### Scenario: Stream chunks to onUpdate
- **WHEN** the controlled page pushes `chunk` events matching the current `requestId`
- **THEN** the provider MUST emit the chunk text through `onUpdate`

#### Scenario: Ignore stale events from a previous turn
- **WHEN** an event arrives whose `requestId` does not match the current send
- **THEN** the provider MUST ignore that event

#### Scenario: Resolve on done
- **WHEN** a `done` event matching the current `requestId` arrives
- **THEN** the provider MUST resolve a `ProviderSendResult` with the final text
- **AND** the provider MUST unsubscribe from controlled-page events for that send

### Requirement: DOM-automation provider MUST degrade to polling when observation fails
If no `done` event arrives within a timeout, or the observer reports an error, the provider SHALL fall back to a one-shot `evaluateInPage` read of the final reply text so the send never hangs indefinitely.

#### Scenario: Fallback on timeout
- **WHEN** no `done` event arrives within the configured timeout
- **THEN** the provider MUST perform a one-shot read of the final reply text via the controlled page
- **AND** the provider MUST resolve a `ProviderSendResult` from that read

### Requirement: DOM-automation provider MUST be desktop-only
The DOM-automation providers SHALL be available only in the desktop runtime. They SHALL NOT be offered in web or extension runtimes.

#### Scenario: Not available outside desktop
- **WHEN** the runtime mode is web or extension
- **THEN** the `chatgpt-dom` / `gemini-dom` providers MUST NOT be selectable
