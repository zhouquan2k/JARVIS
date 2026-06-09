> **Language**: English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Core interfaces MUST define a controlled-page event subscription contract
`ControlledPageCapability` SHALL expose a push-based subscription method `subscribeControlledPageEvent(providerId: string, listener: (event: ControlledPageEvent) => void): () => void` that returns an unsubscribe function. The capability SHALL define a `ControlledPageEvent` shape `{ providerId: string; requestId: string; type: 'chunk' | 'done' | 'error'; text?: string; message?: string }`. This allows a controlled page to push reply increments to subscribers instead of being polled.

#### Scenario: Subscribe and receive controlled-page events
- **WHEN** a caller invokes `subscribeControlledPageEvent(providerId, listener)`
- **THEN** the listener MUST be invoked with `ControlledPageEvent` payloads emitted for that `providerId`
- **AND** the call MUST return a function that, when invoked, stops further delivery to that listener

#### Scenario: Event payload carries requestId for alignment
- **WHEN** a controlled-page event is delivered
- **THEN** the event MUST carry a `requestId` so the subscriber can align it to a specific send
- **AND** the event `type` MUST be one of `chunk`, `done`, or `error`
