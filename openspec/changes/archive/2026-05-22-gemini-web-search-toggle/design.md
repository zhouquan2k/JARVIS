## Context

The current architecture already has almost everything needed to expose this feature without adding a new cross-cutting abstraction:

- `packages/core/config.ts` defines provider model catalogs and user-facing model options. ChatGPT Web already exposes `web_search` here, but Gemini only exposes `deep_research`.
- `packages/ui/src/store/chat.ts` normalizes, persists, and forwards `modelOptions` for both normal chat and Agent requests.
- `packages/core/src/agents/runtime/createAgentRuntime.ts` forwards runtime-resolved `modelOptions` into `provider.runAgent(...)`, so Gemini Agent requests already share the same option pipeline as normal chat.
- `packages/core/src/providers/model/GeminiApiProvider.ts` already has a provider-local request tool assembly path that combines Gemini built-in request tools with application-managed function declarations for native Agent mode.

The missing piece is provider-specific request translation: Gemini needs to accept the existing shared `web_search` option and map it to its native Google Search tool (`tools: [{ google_search: {} }]`) without breaking current Deep Research or Agent tool-loop behavior.

## Goals / Non-Goals

**Goals:**
- Expose `web_search` for Gemini models through the same shared option contract already used by ChatGPT Web.
- Make the option work for both normal Gemini chat and Gemini native Agent requests.
- Map the option to Gemini's native Google Search request capability instead of inventing a parallel application-managed search layer.
- Preserve compatibility with existing Gemini function declarations when Agent mode is active.
- Cover the request-shape behavior with provider-level tests so future refactors do not silently drop the tool.

**Non-Goals:**
- Do not add new Agent tools such as `search_web` or `fetch_webpage`.
- Do not change ChatGPT Web request behavior.
- Do not add a new provider-specific UI toggle or naming variant; reuse the existing `web_search` option key.
- Do not redesign search-result rendering or add new UI for Gemini grounding metadata in this change.

## Decisions

### 1. Reuse the existing shared `web_search` option contract for Gemini

Files to change:
- `/Users/quanzhou/Workspace/JARVIS/packages/core/config.ts`

Function / type signatures:
```ts
export const APP_CONFIG: { providers: ProviderConfig[]; analyzer: AnalyzerConfig };
```

Change description:
- Add `web_search` to Gemini model option definitions with the same key, label, description, and conflict behavior used by ChatGPT Web.
- Keep `deep_research` as a conflicting option so upper-layer normalization continues to enforce one mutually exclusive research/search mode.

Rationale:
- The product already has a normalized model-options pipeline. Reusing the same key keeps UI, persistence, and Agent propagation aligned without new state branches.

Alternatives considered:
- Adding a Gemini-only `google_search` option key. Rejected because it would fragment the shared UI contract and require provider-specific user education.

### 2. Translate `modelOptions.web_search` into Gemini built-in `google_search`

Files to change:
- `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/GeminiApiProvider.ts`

Function / method signatures:
```ts
function buildGeminiRequestTools(options: {
  modelOptions?: Record<string, boolean>;
  tools?: AgentToolDeclaration[];
}): Record<string, unknown>[];
```

Change description:
- Extend Gemini request-tool assembly so `modelOptions.web_search === true` contributes Gemini's built-in Google Search tool.
- Ensure the generated request shape matches Gemini API expectations for the current content API path.
- Keep the provider's normal chat and native Agent execution both routed through the same helper so the behavior cannot drift.

Rationale:
- The provider already owns Gemini-specific request translation. Keeping the mapping inside the provider avoids leaking vendor-specific payload rules into shared runtime layers.

Alternatives considered:
- Enabling search via prompt wording only. Rejected because it does not guarantee access to fresh web sources and is not equivalent to the provider-native capability.

### 3. Preserve coexistence between built-in Google Search and Agent function declarations

Files to change:
- `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/GeminiApiProvider.ts`
- `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/GeminiApiProvider.test.ts`

Function / method signatures:
```ts
function buildGeminiFunctionDeclarations(
  tools?: AgentToolDeclaration[]
): Record<string, unknown>[];

async runAgent(
  request: AgentRunRequest,
  onUpdate: (update: ProviderStreamUpdate) => void
): Promise<ProviderSendResult>;
```

Change description:
- Keep Gemini built-in tools and application-managed function declarations in the same request assembly path.
- Ensure Agent requests can still include `toolConfig.functionCallingConfig` and function declarations when `web_search` is enabled.
- Avoid any fallback that would disable Agent tools just because Google Search is present.

Rationale:
- The user explicitly wants the same network-search switch for Agent-capable Gemini usage, not a chat-only feature.
- The highest regression risk is losing function-calling behavior under Agent mode, so the design keeps both tool families explicit in tests.

Alternatives considered:
- Disabling `web_search` in Agent mode. Rejected because it would violate the shared-option expectation and create hidden mode-specific semantics.

### 4. Verify through provider and state tests instead of adding new UI mechanics

Files to change:
- `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/GeminiApiProvider.test.ts`
- `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/store/chat.test.ts`

Function / method signatures:
```ts
setCurrentModelOption(key: string, enabled: boolean): void;
```

Change description:
- Add provider tests that assert Gemini request payloads include `google_search` when `web_search` is enabled, and omit it otherwise.
- Add or adjust state tests so switching to Gemini preserves the shared `web_search` option in normalized model-option state.
- Prefer test coverage at the request-payload seam rather than adding new rendering-only assertions.

Rationale:
- This change is fundamentally about request translation and option propagation, not about inventing new UI controls.

## Risks / Trade-offs

- Gemini API request shape for built-in Google Search must remain compatible with existing function-calling payload structure; tests need to lock this down.
- Grounding metadata may be available in Gemini responses without a dedicated UI representation yet. This change accepts that limitation because the user request is only to expose the switch and use the API capability.
- Some Gemini models may differ in built-in tool support over time. The initial design assumes the currently configured Gemini chat models are within the supported range and relies on provider tests to catch local regressions.
