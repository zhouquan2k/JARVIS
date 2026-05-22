## Why

The workspace already exposes a `web_search` model option for ChatGPT Web requests, but Gemini API requests do not yet provide the same user-facing switch or equivalent runtime behavior. As a result, users must remember provider-specific capability differences even when the product presents a shared model-options surface.

For Gemini, the platform already offers a native Google Search grounding tool. This change brings Gemini onto the same `web_search` option contract used by ChatGPT Web so users can enable fresh web-backed answers without learning a second provider-specific toggle.

## What Changes

- Add the existing shared `web_search` model option to Gemini API model configuration so the UI and conversation state treat Gemini consistently with ChatGPT Web.
- Translate `modelOptions.web_search = true` into Gemini API request payloads that enable the native `google_search` tool.
- Preserve coexistence between Gemini built-in Google Search and existing function-calling/tool declarations for native Agent execution.
- Verify that normal chat and Agent runtime requests both inherit the same Gemini `web_search` behavior through the existing `modelOptions` pipeline.
- Explicitly keep this change scoped to Gemini's built-in capability rather than introducing new application-managed `search_web` or `fetch_webpage` tools.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gemini-api-provider`: expose the same user-facing `web_search` switch contract as ChatGPT Web and map it to Gemini's native Google Search tool for chat and Agent requests.

## Impact

- Affected static provider model configuration: `packages/core/config.ts`.
- Affected Gemini request construction and native Agent request assembly: `packages/core/src/providers/model/GeminiApiProvider.ts`.
- Affected provider/unit coverage for request payload composition and option propagation: `packages/core/src/providers/model/GeminiApiProvider.test.ts`, `packages/ui/src/store/chat.test.ts`, and related model-option tests if needed.
