## 1. Core Provider

- [x] 1.1 Add static `chatgpt-codex` provider configuration and runtime base URL helpers in `/Users/quanzhou/Workspace/JARVIS/packages/core/config.ts`
- [x] 1.2 Add `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/ChatGPTCodexProvider.ts` and the related option types in `/Users/quanzhou/Workspace/JARVIS/packages/core/src/providers/model/providerHostTypes.ts`
- [x] 1.3 Register `chatgpt-codex` in `/Users/quanzhou/Workspace/JARVIS/packages/core/src/runtime/createModelProviderRuntime.ts` and export it from `/Users/quanzhou/Workspace/JARVIS/packages/core/src/index.ts`
- [x] 1.4 Add core unit tests for runtime registration, auth handling, model catalog resolution, normal chat streaming, and `IAgentCapableProvider` behavior

## 2. Local Provider Server

- [x] 2.1 Add Codex server config and route wiring in `/Users/quanzhou/Workspace/JARVIS/apps/server/src/config.ts` and `/Users/quanzhou/Workspace/JARVIS/apps/server/src/app.ts`
- [x] 2.2 Implement `/Users/quanzhou/Workspace/JARVIS/apps/server/src/services/codexAuthService.ts` to wrap `codex login status` and `codex login --device-auth`
- [x] 2.3 Implement `/Users/quanzhou/Workspace/JARVIS/apps/server/src/services/codexCliService.ts` to wrap `codex exec --json` for model lookup, normal chat, and agent execution
- [x] 2.4 Add `/Users/quanzhou/Workspace/JARVIS/apps/server/src/routes/codex.ts` for auth status, login start, model catalog, chat execution, and agent execution
- [x] 2.5 Add server tests for auth parsing, CLI event normalization, route validation, and error handling

## 3. Host Integration

- [x] 3.1 Update `/Users/quanzhou/Workspace/JARVIS/apps/web/src/modelProviderRuntime.ts` and `/Users/quanzhou/Workspace/JARVIS/apps/web/src/App.vue` to construct `chatgpt-codex` through the local provider server and show auth recovery UI
- [x] 3.2 Update `/Users/quanzhou/Workspace/JARVIS/apps/extension/src/modelProviderRuntime.ts` and `/Users/quanzhou/Workspace/JARVIS/apps/extension/src/App.vue` to construct `chatgpt-codex` through the local provider server and show auth recovery UI
- [x] 3.3 Update `/Users/quanzhou/Workspace/JARVIS/apps/desktop/src/modelProviderRuntime.ts` and `/Users/quanzhou/Workspace/JARVIS/apps/desktop/src/App.vue` to construct `chatgpt-codex` through the local provider server and show auth recovery UI
- [x] 3.4 Add host tests covering provider availability, auth warning copy, login action handling, and auth refresh after recovery

## 4. Verification

- [x] 4.1 Run lint, typecheck, and relevant package tests for `packages/core`, `apps/server`, `apps/web`, `apps/extension`, and `apps/desktop`
- [x] 4.2 Add or update Playwright E2E cases for web Codex availability, auth recovery entry, and successful provider selection
- [x] 4.3 Add or update Playwright E2E cases for extension Codex availability, auth recovery entry, and successful provider selection using `channel: 'chromium'`
- [x] 4.4 Run extension E2E with escalated permissions, then run `pnpm --filter extension build`
- [x] 4.5 Add or update Playwright E2E cases for desktop Codex availability, auth recovery entry, and successful provider selection
- [x] 4.6 Run the full required E2E verification matrix and confirm no regression in existing provider workflows
