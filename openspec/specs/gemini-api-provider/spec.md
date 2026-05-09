English | [Chinese](spec.zh-CN.md)

## Purpose
Define Gemini API provider behavior for streaming model execution, native agent capability, tool/function metadata handling, and shared result normalization.
## Requirements
### Requirement: Gemini provider MUST support low-cost conversation title generation
The Gemini provider MUST be able to generate a concise conversation title from a user question through the shared provider title-generation capability. This path MUST use a provider-selected low-cost, non-thinking Gemini model rather than inheriting the active conversation model, model options, or reasoning effort.

#### Scenario: Generate a title with a dedicated low-cost Gemini path
- **WHEN** the caller requests conversation title generation from the Gemini provider
- **THEN** the provider MUST issue a dedicated title-generation request through its provider-side title path
- **AND** that request MUST use a provider-selected low-cost non-thinking Gemini model instead of the current conversation model

#### Scenario: Return normalized standalone title text
- **WHEN** the Gemini provider receives a raw title-generation result
- **THEN** the provider MUST normalize the result into a concise standalone title
- **AND** the provider MUST NOT return explanatory prose or multi-line answer text as the title

## MODIFIED Requirements

### Requirement: Implementation of Gemini API via SSE
The system MUST integrate with the Google Gemini API to provide native large language model capability and output standardized `text + annotations` results through a unified streaming snapshot contract. The implementation MUST consume both `modelId` and normalized `modelOptions` so Gemini request behavior can switch among normal chat, Deep Research, and the phase-one native agent mode. For phase-one native agent requests, the system MUST prefer reusing the existing `streamGenerateContent` path rather than switching to Live API or a new real-time session form.

#### Scenario: Streaming response generation for standard chat
- **WHEN** a normal chat request is sent to the Gemini provider with `modelId`
- **THEN** the provider MUST call the Google Generative AI endpoint using SSE (Server-Sent Events) response mode so the frontend can receive streaming full-text snapshots
- **AND** those snapshots MUST be returned through the unified `onUpdate` contract rather than only raw chunk text

#### Scenario: Enable deep research mode for Gemini request
- **WHEN** `sendMessage` receives `options.modelOptions.deep_research = true`
- **THEN** the provider MUST translate that flag into Gemini-compatible Deep Research request behavior
- **AND** when that flag is missing or `false`, the provider MUST keep the existing normal chat request path unchanged

#### Scenario: Stream native agent request through the existing content API
- **WHEN** the Gemini provider receives a native agent execution request
- **THEN** the provider MUST continue issuing the request through the existing `streamGenerateContent` or equivalent content-generation streaming endpoint
- **AND** the provider MUST NOT require the caller to switch to a WebSocket Live API session model in phase one

## ADDED Requirements

### Requirement: Gemini provider MUST expose native agent execution capability
The system MUST allow the Gemini provider to explicitly declare support for native agent execution while retaining normal chat capability, and it MUST accept the currently resolved agent configuration as runtime input.

#### Scenario: Declare native agent capability on Gemini provider
- **WHEN** the runtime requests the Gemini provider's capability declaration
- **THEN** the provider MUST clearly indicate that it supports native agent execution
- **AND** that capability declaration MUST be usable by `AgentRuntime` for execution-path selection

#### Scenario: Execute native agent request with the current resolved agent config
- **WHEN** `AgentRuntime` passes the current `ResolvedAgentConfig` and request context to the Gemini provider
- **THEN** the provider MUST construct the Gemini agent request using the model, instructions, and capability boundaries from that configuration
- **AND** the provider MUST continue returning results through the standardized streaming text update contract

### Requirement: Gemini native agent execution MUST support application-managed tool loop in phase one
The system MUST allow phase-one Gemini native agent requests to work through Gemini function calling/tools, and the application-side runtime MUST maintain the multi-step tool loop rather than wrapping the full tool loop in a new transport protocol.

#### Scenario: Send tool declarations with a native agent request
- **WHEN** the Gemini provider starts a native agent request and the current agent has an available tool boundary
- **THEN** the provider MUST include the corresponding tools/function-calling configuration in the Gemini request
- **AND** the provider MUST allow the application to continue maintaining the subsequent loop after tool calls are received

#### Scenario: Consume runtime-resolved tool declarations
- **WHEN** `AgentRuntime` has resolved structured tool declarations for this request
- **THEN** the Gemini provider MUST use those runtime tool declarations to generate function declarations
- **AND** the provider MUST NOT require itself to derive local tool implementation details directly from the raw `agent.tools`

#### Scenario: Consume runtime-augmented agent and workspace context
- **WHEN** `AgentRuntime` has prepared the augmented Agent/Workspace context for this request
- **THEN** the Gemini provider MUST consume that runtime input directly to issue the native agent request
- **AND** the provider MUST NOT independently decide whether to read or inject the current active file content

### Requirement: Gemini provider MUST normalize function and tool metadata into functional message parts
The Gemini provider MUST convert structured function-call or tool-call metadata from normal and native Agent Gemini responses into shared functional message parts when such metadata is available.

#### Scenario: Normalize Gemini function call metadata
- **WHEN** a Gemini response includes structured function-call metadata
- **THEN** the provider MUST expose that metadata as `functionalParts`
- **AND** the normal assistant text stream MUST remain available through the shared `text` update

#### Scenario: Preserve normal responses without functional metadata
- **WHEN** a Gemini response contains only assistant answer text
- **THEN** the provider MUST return no functional parts
- **AND** the response MUST render as a normal assistant message
