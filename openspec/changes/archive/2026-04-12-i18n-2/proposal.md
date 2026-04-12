## Why

Phase 1 解决了仓库对外默认英文的问题，但当前运行中的 Web、Extension、Desktop 界面仍大量依赖中文硬编码，导致“仓库英文、界面中文”的割裂状态持续存在。将 Phase 2 独立成变更，可以先建立共享 UI i18n 基础设施并迁移静态可见文案，而不与异常英文统一混做，从而降低实施和回归风险。

## What Changes

- 在 `packages/ui` 建立共享 i18n 基础设施，包括语言资源、语言解析、切换与持久化。
- 在 `apps/web/src/main.ts`、`apps/desktop/src/main.ts`、`apps/extension/entrypoints/index/main.ts` 统一接入语言初始化。
- 将 `packages/ui/src/components/**`、`packages/ui/src/views/**`、`packages/ui/src/routes.ts` 中的主要静态用户可见文案迁移为可本地化资源。
- 将 `packages/core/config.ts` 中 provider / model / option 的用户可见 `name`、`label`、`description` 改造成可本地化的可见配置。
- 保持 `throw new Error(...)`、`currentError`、`analysisError` 等异常文本不进入 i18n 词条；这些内容留到 Phase 3 统一处理。

## Capabilities

### New Capabilities
- `ui-localization-runtime`: 定义共享 UI i18n 运行时、语言解析、切换和持久化行为，供 Web、Extension、Desktop 三宿主统一复用。
- `localized-ui-copy`: 定义共享组件、视图、路由标签以及 provider/model 可见配置的静态文案本地化行为。

### Modified Capabilities
- `<none>`: Phase 2 不直接修改既有运行时能力规格，而是新增 UI 国际化相关能力规格。

## Impact

- 影响 `packages/ui` 的共享导出、状态和共享组件渲染方式。
- 影响 `apps/web`、`apps/extension`、`apps/desktop` 的应用初始化流程。
- 影响 `packages/core/config.ts` 中用户可见配置的表达方式。
- 影响组件测试、store 测试和 e2e 回归方式。
- 不影响异常处理链路、服务端接口和 OpenSpec 双语归档流程。
