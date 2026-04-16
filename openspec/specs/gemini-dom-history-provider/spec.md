English | [Chinese](spec.zh-CN.md)

## MODIFIED Requirements

### Requirement: Gemini DOM history provider MUST fetch history through remote-config-driven selectors
The system MUST provide a Gemini DOM history provider in the shared core layer and fetch Gemini website history lists and details through a host-injected `GeminiHistoryBridge` plus selectors supplied by remote configuration. The provider MUST work for both extension and desktop hosts instead of binding to a single host implementation. The history-list query MUST support both "recent list" and "keyword search" modes: when `query` is empty it returns the recent list; when `query` is a non-empty string, the system MUST drive the page's native search box through remote configuration and then extract the search-result summaries.

#### Scenario: Fetch Gemini history list through the host bridge
- **WHEN** the external-history workspace in the extension or desktop host activates the `gemini-web` provider and the UI calls `getHistoryList()` without passing `query` or with an empty string
- **THEN** the system MUST first resolve remote, cached, or built-in fallback configuration through `GeminiHistoryConfigLoader`
- **AND** the system MUST fetch the recent history summaries through the host-injected `GeminiHistoryBridge.getHistoryList(config, { query: '' })` or equivalent empty-query semantics
- **AND** the result MUST be normalized into a summary array containing `id`, `title`, `updatedAt`, and `origin = 'gemini-web'`

#### Scenario: Fetch Gemini searched history list through the host bridge
- **WHEN** the external-history workspace in the extension or desktop host activates the `gemini-web` provider and the UI calls `getHistoryList({ query })` with a non-empty string
- **THEN** the system MUST first resolve remote, cached, or built-in fallback configuration through `GeminiHistoryConfigLoader`
- **AND** the system MUST drive Gemini's native search box and fetch matching summaries through the host-injected `GeminiHistoryBridge.getHistoryList(config, { query })`
- **AND** the result MUST continue to be normalized into a summary array with `origin = 'gemini-web'`

#### Scenario: Fetch Gemini history detail through the host bridge
- **WHEN** the UI calls `getHistoryDetail(externalId)` to query Gemini history details
- **THEN** the system MUST fetch the corresponding details through `GeminiHistoryBridge.getHistoryDetail(config, externalId)`
- **AND** the system MUST normalize the fetched result into a unified `Conversation` before returning it

### Requirement: Gemini DOM history provider MUST normalize Gemini page content into shared conversation data
The system MUST convert Gemini page message nodes, images, and basic attachments into the shared ChatPrism `Conversation` structure so page DOM details are not exposed to the UI.

#### Scenario: Normalize Gemini conversation detail
- **WHEN** the Gemini page returns history details containing multiple user and assistant messages
- **THEN** the system MUST generate linearly renderable `messages` in time order
- **AND** the returned `Conversation` MUST include `origin = 'gemini-web'`, `externalId`, and any preservable image or basic attachment data

### Requirement: Gemini DOM history provider MUST fail with normalized recoverable errors
The system MUST return normalized errors when the Gemini page is not logged in, selectors fail, details are missing, or the controlled tab is unavailable, rather than exposing raw DOM exceptions to the caller.

#### Scenario: Detect selector mismatch before scraping
- **WHEN** key selectors declared by the remote configuration are repeatedly missing in the Gemini page and exceed the health-check threshold
- **THEN** the system MUST stop fetching and return `SELECTOR_MISMATCH`
- **AND** the UI MUST be able to show a fallback message such as "the page structure has changed, please try again later" based on that error

#### Scenario: Detect login-required state
- **WHEN** the system attempts to fetch Gemini history but the page is not logged in, is redirecting, or is in an unauthorized state
- **THEN** the system MUST return `AUTH_REQUIRED`
- **AND** the system MUST NOT misinterpret a blank page as "no history records"

## ADDED Requirements

### Requirement: Gemini DOM history provider MUST preserve a host-agnostic error contract
The system MUST preserve the same Gemini external-history error contract across both extension and desktop hosts so the upper UI can reuse the same recovery logic without being aware of host differences.

#### Scenario: Map desktop bridge failures into normalized history errors
- **WHEN** the desktop main-process bridge detects a login page, error page, selector mismatch, missing detail, or unavailable controlled page
- **THEN** the system MUST continue returning `AUTH_REQUIRED`, `SELECTOR_MISMATCH`, `DETAIL_NOT_FOUND`, or `TAB_UNAVAILABLE`
- **AND** the system MUST NOT expose Electron page internal exceptions directly to the workspace

#### Scenario: Preserve shared config failures across hosts
- **WHEN** `GeminiHistoryConfigLoader` cannot obtain remote configuration and has no usable cache or built-in fallback in either host
- **THEN** the system MUST return `CONFIG_UNAVAILABLE`
- **AND** the desktop and extension hosts MUST use the same error-code semantics
