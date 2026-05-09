English | [Chinese](spec.zh-CN.md)

## Purpose
Define ChatGPT Web provider behavior for request construction, streaming normalization, history handling, host integration, and structured functional metadata extraction.
## Requirements
### Requirement: ChatGPT Web provider MUST support low-cost conversation title generation
The ChatGPT Web provider MUST be able to generate a concise conversation title from a user question through the shared provider title-generation capability. This title-generation path MUST use a provider-selected low-cost, non-thinking model rather than inheriting the active chat model, model options, or reasoning effort.

#### Scenario: Generate a title with a dedicated low-cost provider path
- **WHEN** the caller requests conversation title generation from `ChatGPTWebProvider`
- **THEN** the provider MUST issue a dedicated title-generation request
- **AND** that request MUST use a provider-selected low-cost non-thinking model instead of the current conversation model

#### Scenario: Return normalized title text only
- **WHEN** the provider receives a raw title-generation result from ChatGPT Web
- **THEN** the provider MUST normalize the result into concise title text
- **AND** the provider MUST NOT return explanatory prose, quoted wrappers, or multi-line output as the conversation title

## MODIFIED Requirements

### Requirement: ChatGPT Web Message Sending
The system MUST implements the ability to build multi-modal payloads, initiate requests and stream resolve SSE (Server-Sent Events), and standardize the ChatGPT Web private return structure into a unified `text + annotations` output contract. The request construction process MUST consumes `options.modelId` and the normalized `options.modelOptions` at the same time, and MUST be executed in different hosts through the request client and Cookie capability injected by the host. #### Scenario: Streaming response parsing with specific model
- **WHEN** calls `sendMessage` to send a request and receives a binary stream containing a `data:` block
- **THEN** The system MUST filter `[DONE]` mark, resolve the current complete body snapshot, and pass the standardized `text` in real time through the `onUpdate` callback
- **AND** The Payload sent to the backend `backend-api/conversation` MUST consume the incoming `options.modelId` (instead of hard-coding `model: 'auto'`) and specify the corresponding model to the ChatGPT official interface #### Scenario: Send multimodal payload to ChatGPT Web
- **WHEN** Call `sendMessage` with image or file attachment
- **THEN** The system MUST encode and assemble these attachments into a message payload structure acceptable to ChatGPT Web
- **AND** the same text and attachment of the usermessage MUST be submitted together in the same request #### Scenario: Enable web search mode for ChatGPT Web request
- **WHEN** `sendMessage` received `options.modelOptions.web_search = true`
- **THEN** The system MUST translate the request into a ChatGPT Web-recognizable network search pattern
- **AND** When `deep_research` is not enabled, the request MUST not carry Deep Research mode #### Scenario: Enable deep research mode for ChatGPT Web request
- **WHEN** `sendMessage` received `options.modelOptions.deep_research = true`
- **THEN** The system MUST translate the request into ChatGPT Web-aware Deep Research mode
- **AND** Provider MUST constructs the request based on the incoming normalize option, rather than recovering the conflict items that were trimmed by the upper layer by itself #### Scenario: Use host-injected request client in desktop host
- **WHEN** `ChatGPTWebProvider` runs on the desktop host and the host injects the requesting client
- **THEN** Provider MUST performs authentication, modeldirectory, historyquery and message through the injected request client to send the request
- **AND** Provider MUST NOT rely on the browser extension API in the renderer environment ### Requirement: ChatGPT Web history detail normalization
The system MUST provide read and standardization capabilities for the ChatGPT web version historydetails, so that the import process can reuse the unified `Conversation` model and retain message-level attachment and annotation information. #### Scenario: Normalize ChatGPT history detail into Conversation
- **WHEN** The system requests the details of a certain ChatGPT history conversation
- **THEN** The system MUST extract a renderable main chain from the original tree node
- **AND** The system MUST return a normalized `Conversation` containing `backendId`, `externalId`, `sourceType` and linear `messages` ## ADDED Requirements ### Requirement: ChatGPT Web provider MUST support searchable history summaries
The system MUST provide searchable summaryquerycapability for the ChatGPT web history provider and continue to reuse the unified `ConversationHistorySummary` contract. This capability MUST supports both "recent list" and "keyword search" query modes without changing the existing detailsread and standardization behaviors. #### Scenario: Return recent ChatGPT history summaries without query
- **WHEN** UI calls `ChatGPTWebProvider.getHistoryList()` without passing in `query` or passing in an empty string
- **THEN** Provider MUST returnmost recent page ChatGPT historysummarylist
- **AND** Each summary MUST contain `id`, `title`, `updatedAt` and `origin = 'chatgpt-web'` #### Scenario: Return searched ChatGPT history summaries with query
- **WHEN** UI calls `ChatGPTWebProvider.getHistoryList({ query })`, and `query` is non-empty string
- **THEN** Provider MUST calls ChatGPT native historysearchcapability and returns matching result
- **AND** returnresult MUST continue normalization to unified `ConversationHistorySummary[]` ### Requirement: ChatGPT Web provider MUST resolve device and cookie context through host abstractions
The system MUST resolve devices and Cookie contexts such as `oai-did` through the host abstraction, so that the same Provider implementation can be reused in the extension background and desktop host. #### Scenario: Resolve device cookie through injected cookie store
- **WHEN** Provider runs in an environment where supporthost injects Cookie capability
- **THEN** The system MUST first obtain `oai-did` through the injected Cookie readcapability
- **AND** When the host does not provide the capability or the read fails, the Provider MUST fallback to an acceptable device identity generation strategy ### Requirement: ChatGPT Web provider MUST expose auth state suitable for host-side recovery flows
The system MUST allowhost to trigger the login recovery process based on the result of `ChatGPTWebProvider.checkAuth()` instead of treating authentication failure as an unrecoverable final state. This behavior MUST be compatible with scenarios where the desktop host uses an independent persistent Session. #### Scenario: Desktop host uses checkAuth result to drive login recovery
- **WHEN** `ChatGPTWebProvider.checkAuth()` return failed in desktop host
- **THEN** host MUST be able to interpret this result as "current Session is not logged in"
- **AND** host MUST can re-execute `checkAuth()` after the user completes login to confirm whether the authentication status is recovery ### Requirement: ChatGPT Web provider MUST normalize provider-private annotations
The system MUST cleans ChatGPT Web private references, image groups and other identifiers at the provider layer, and outputs unified structured annotations instead of exposing private tokens to the UI. #### Scenario: Normalize cite and image group markers
- **WHEN** ChatGPT Web streaming response contains private identifiers such as references or image groups.
- **THEN** The system MUST convert these identifiers into standardized `annotations`
- **AND** The `text` returned to the UI MUST no longer contain the original private token

### Requirement: ChatGPT Web provider MUST normalize functional metadata into functional message parts
The ChatGPT Web provider MUST normalize confidently structured search, tool, or function metadata from ChatGPT responses into shared functional message parts. It MUST keep response text and annotations compatible with the existing rendering path.

#### Scenario: Normalize search metadata into functional parts
- **WHEN** a ChatGPT Web response contains structured search metadata separate from assistant answer text
- **THEN** the provider MUST convert that metadata into `functionalParts` with a search or trace kind
- **AND** the provider MUST continue returning the assistant answer text through the normal `text` field

#### Scenario: Avoid guessing from unstructured history text
- **WHEN** a ChatGPT history detail only contains unstructured rendered text
- **THEN** the provider MUST NOT invent functional parts by parsing ambiguous prose
- **AND** the conversation MUST continue to preserve the original message text
