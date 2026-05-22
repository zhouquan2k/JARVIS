## MODIFIED Requirements

### Requirement: Implementation of Gemini API via SSE
The system MUST integrate with the Google Gemini API to provide native large language model capability and output standardized `text + annotations` results through a unified streaming snapshot contract. The implementation MUST consume both `modelId` and normalized `modelOptions` so Gemini request behavior can switch among normal chat, web-backed search, Deep Research, and the phase-one native agent mode. For phase-one native agent requests, the system MUST prefer reusing the existing `streamGenerateContent` path rather than switching to Live API or a new real-time session form.

#### Scenario: Streaming response generation for standard chat
- **WHEN** a normal chat request is sent to the Gemini provider with `modelId`
- **THEN** the provider MUST call the Google Generative AI endpoint using SSE (Server-Sent Events) response mode so the frontend can receive streaming full-text snapshots
- **AND** those snapshots MUST be returned through the unified `onUpdate` contract rather than only raw chunk text

#### Scenario: Enable web search mode for Gemini request
- **WHEN** `sendMessage` receives `options.modelOptions.web_search = true`
- **THEN** the provider MUST add Gemini's built-in Google Search tool to the request payload
- **AND** the provider MUST keep the request on the existing Gemini content API path instead of inventing an application-managed search transport

#### Scenario: Enable deep research mode for Gemini request
- **WHEN** `sendMessage` receives `options.modelOptions.deep_research = true`
- **THEN** the provider MUST translate that flag into Gemini-compatible Deep Research request behavior
- **AND** when that flag is missing or `false`, the provider MUST keep the existing normal chat request path unchanged

#### Scenario: Stream native agent request through the existing content API
- **WHEN** the Gemini provider receives a native agent execution request
- **THEN** the provider MUST continue issuing the request through the existing `streamGenerateContent` or equivalent content-generation streaming endpoint
- **AND** the provider MUST NOT require the caller to switch to a WebSocket Live API session model in phase one

### Requirement: Gemini native agent execution MUST support application-managed tool loop in phase one
The system MUST allow phase-one Gemini native agent requests to work through Gemini function calling/tools, and the application-side runtime MUST maintain the multi-step tool loop rather than wrapping the full tool loop in a new transport protocol.

#### Scenario: Send tool declarations with a native agent request
- **WHEN** the Gemini provider starts a native agent request and the current agent has an available tool boundary
- **THEN** the provider MUST include the corresponding tools/function-calling configuration in the Gemini request
- **AND** the provider MUST allow the application to continue maintaining the subsequent loop after tool calls are received

#### Scenario: Combine built-in web search with runtime tool declarations
- **WHEN** `AgentRuntime` sends a Gemini native agent request with `modelOptions.web_search = true`
- **THEN** the provider MUST include Gemini's built-in Google Search tool alongside runtime-resolved function declarations
- **AND** the provider MUST enable the Gemini tool-combination request config required for built-in search plus function calling
- **AND** the provider MUST NOT drop application-managed Agent tools just because web search is enabled

#### Scenario: Preserve Gemini server-side tool context across the application-managed tool loop
- **WHEN** a Gemini native agent response includes built-in tool invocation parts such as search `toolCall` or `toolResponse`
- **THEN** the provider MUST retain those parts in the returned model turn
- **AND** the provider MUST send those retained parts back on the next native agent request before appending the local `functionResponse`

#### Scenario: Consume runtime-resolved tool declarations
- **WHEN** `AgentRuntime` has resolved structured tool declarations for this request
- **THEN** the Gemini provider MUST use those runtime tool declarations to generate function declarations
- **AND** the provider MUST NOT require itself to derive local tool implementation details directly from the raw `agent.tools`

#### Scenario: Consume runtime-augmented agent and workspace context
- **WHEN** `AgentRuntime` has prepared the augmented Agent/Workspace context for this request
- **THEN** the Gemini provider MUST consume that runtime input directly to issue the native agent request
- **AND** the provider MUST NOT independently decide whether to read or inject the current active file content
