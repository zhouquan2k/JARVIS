English | [Chinese](spec.zh-CN.md)

## Purpose
Define the runtime contract and behavior for agent execution, including provider selection, tool-loop handling, workspace context usage, and shared streaming/result shapes.

## Requirements

## ADDED Requirements

### Requirement: Agent runtime adapter MUST route requests through a dedicated agent runtime
The system MUST provide a dedicated agent scheduling layer on top of the existing `ProviderRuntime` to receive the active agent configuration, choose the target provider/model, and unify native agent paths with normal chat fallback, rather than scattering that logic across the UI store or base provider interfaces.

#### Scenario: Receive the current resolved agent config from UI
- **WHEN** the knowledge workspace or normal chat flow starts a request carrying the current active `ResolvedAgentConfig`
- **THEN** the system MUST pass that configuration to `AgentRuntime` first
- **AND** `AgentRuntime` MUST use that configuration to determine the target provider, model, and execution path

### Requirement: Agent runtime adapter MUST prefer native agent execution when supported
The system MUST prefer the native agent execution path when the provider supports native agent capability; if the current provider does not support that capability, it MUST automatically fall back to the existing normal chat path, and both paths may only append the current file context from program logic rather than composing extra Agent/Tools text prompts.

#### Scenario: Route to native agent provider with resolved tools
- **WHEN** `AgentRuntime` resolves that the target provider implements `IAgentCapableProvider`
- **THEN** the system MUST call that provider's native agent execution entry
- **AND** it MUST continue passing the current `ResolvedAgentConfig`, request context, and runtime-resolved tool declarations to that entry

#### Scenario: Execute provider tool calls through the shared tool executor
- **WHEN** the native agent returns a tool-call request
- **THEN** `AgentRuntime` MUST execute that call through the shared tool execution layer
- **AND** it MUST feed the tool result back into later model turns rather than continuing to return an unimplemented placeholder result

#### Scenario: Fall back with active-file-only augmentation
- **WHEN** `AgentRuntime` resolves that the target provider does not implement `IAgentCapableProvider`
- **THEN** the system MUST fall back to the existing `sendMessage` path
- **AND** it MUST only append the available current file context through a program-side helper
- **AND** it MUST NOT additionally compose Agent identity, tool list, or skill list text

### Requirement: Agent runtime adapter MUST reuse existing stream update contracts in phase one
In phase one, the system MUST continue to reuse the current `text + annotations` streaming snapshot contract so the UI can consume Gemini Agent results without introducing a new event-stream protocol.

#### Scenario: Stream native agent output through the existing UI contract
- **WHEN** `AgentRuntime` drives a Gemini native agent request
- **THEN** the upstream `onUpdate` callback MUST continue to receive standardized `ProviderStreamUpdate`
- **AND** the final completed state MUST continue to return a standardized `ProviderSendResult`

### Requirement: Agent runtime adapter MUST pass workspace context into tool execution
In knowledge workspace scenarios, the system MUST pass the current workspace context to the tool execution layer so file tools can use the current active path and knowledge file provider.

#### Scenario: Execute a scoped file tool from the knowledge workspace
- **WHEN** an agent triggers a file tool in the knowledge workspace
- **THEN** `AgentRuntime` MUST pass the current `activePath` and `contextProvider` into the tool execution context
- **AND** the file tool MUST be able to access the current workspace content based on that context

### Requirement: Agent runtime adapter MUST attach the active file with a stable prompt hint when available
When the current node in the knowledge workspace is a file, the system MUST include that file in the model request from program logic: if the file's `mimeType` is accepted by the current provider, the system MUST send it as an attachment; if the file is a text file, the system MUST also prepend a stable hint to the body stating that the current document has been provided as an attachment rather than injecting the full text directly into the prompt. This responsibility belongs to program-side context enhancement, not to default agent-instruction details.

#### Scenario: Include the current text file as attachment plus stable prompt hint
- **WHEN** the right-side agent request corresponds to a file node
- **AND** the current provider accepts that file's `mimeType`
- **THEN** `AgentRuntime` MUST include that file as an attachment in the model request
- **AND** if the file is a text file, `AgentRuntime` MUST append a stable hint to the final prompt stating that the current document has been provided as an attachment
- **AND** this rule MUST apply to both the native agent path and the fallback chat path

#### Scenario: Omit the active file when the provider rejects its MIME type
- **WHEN** the right-side agent request corresponds to a file node
- **AND** the current provider does not accept that file's `mimeType`
- **THEN** `AgentRuntime` MUST NOT automatically send that file as an attachment
- **AND** the system MAY continue sending the original user prompt, but it MUST NOT pretend that the file has been included in the actual request

### Requirement: Agent runtime adapter MUST emit structured functional parts for tool-loop details
The Agent runtime adapter MUST expose application-managed tool-loop calls and results as structured functional message parts in addition to any compatible text output. These parts MUST use the shared provider result contract so the UI can render them through the same collapsed functional details component used by normal chat.

#### Scenario: Emit tool call functional parts after a tool loop round
- **WHEN** the native Agent path receives tool calls and executes them through the shared tool executor
- **THEN** the Agent runtime MUST create functional parts describing the tool calls and tool results
- **AND** those parts MUST be included in the stream update or final provider result for the assistant message

#### Scenario: Preserve shared stream contract
- **WHEN** the Agent runtime streams text and functional details
- **THEN** it MUST continue using `ProviderStreamUpdate`
- **AND** it MUST NOT introduce an Agent-only UI event protocol for functional details
