> **Language**: English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Desktop host MUST implement the controlled-page event lane
The desktop host SHALL implement the `subscribeControlledPageEvent` capability end to end: a per-provider DOM preload SHALL run a resident `MutationObserver` over the latest assistant reply node and report increments via `ipcRenderer.send`; the main process SHALL stamp each forwarded event with its `providerId` and relay it to renderer windows; the renderer preload SHALL expose a subscription that returns an unsubscribe function.

#### Scenario: Reply increments flow page → main → renderer
- **WHEN** the observed reply node changes in a controlled page during an active send
- **THEN** the preload MUST report a structured increment to the main process
- **AND** the main process MUST forward it, stamped with `providerId`, to the renderer windows
- **AND** a renderer subscriber for that `providerId` MUST receive a `ControlledPageEvent`

#### Scenario: Unsubscribe stops delivery
- **WHEN** a renderer subscriber invokes the returned unsubscribe function
- **THEN** the host MUST stop delivering further controlled-page events to that subscriber

### Requirement: Desktop host MUST register ChatGPT and Gemini DOM site adapters
The desktop host SHALL register, in the controlled-page preload registry, a DOM preload for `chatgpt-dom` and `gemini-dom`. Each adapter SHALL encapsulate its `targetUrl`, prompt injection and submission selectors, latest-reply-node location, and end-of-generation detection, and SHALL emit events using the `{ providerId, requestId, type, text?, message? }` payload.

#### Scenario: Inject and submit a prompt
- **WHEN** the host is asked to inject a prompt with a `requestId` into a registered DOM site
- **THEN** the adapter MUST locate the input field, fill the prompt, and trigger submission
- **AND** subsequent reply increments MUST carry that `requestId`

#### Scenario: Detect end of generation
- **WHEN** the observed reply on a registered DOM site stabilizes and the stop-generating affordance disappears
- **THEN** the adapter MUST emit a `done` event with the final text
