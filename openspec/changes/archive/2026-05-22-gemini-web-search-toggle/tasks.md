## 1. Shared option wiring

- [x] 1.1 Add `web_search` to Gemini model option definitions in `packages/core/config.ts` with the same key and conflict semantics used by ChatGPT Web.
- [x] 1.2 Confirm normalized model-option state continues to flow from `packages/ui/src/store/chat.ts` into both normal Gemini chat and Agent runtime requests without adding a new option key.

## 2. Gemini provider request translation

- [x] 2.1 Update `packages/core/src/providers/model/GeminiApiProvider.ts` so `modelOptions.web_search = true` adds Gemini's built-in Google Search tool to the request payload.
- [x] 2.2 Preserve coexistence between Gemini built-in `google_search` and existing function declarations / `toolConfig` for native Agent execution.

## 3. Verification

- [x] 3.1 Add provider tests in `packages/core/src/providers/model/GeminiApiProvider.test.ts` for enabled and disabled Gemini `web_search` payloads in both chat and Agent paths.
- [x] 3.2 Add or adjust state tests in `packages/ui/src/store/chat.test.ts` to confirm Gemini exposes and persists the shared `web_search` option.
- [x] 3.3 Run the relevant lint / type / test / build verification sequence after implementation.
