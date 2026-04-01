## Why

当前 desktop 宿主对 `gemini-web` 外部历史仍停留在 `Desktop Gemini history provider is not implemented yet` 占位阶段，导致桌面端无法完成 Gemini 历史预览与导入，和已经具备的 ChatGPT 历史导入能力出现明显断层。与此同时，`packages/core/src` 内的 `providers`、`agent-tools`、`runtime`、`analysis` 边界已经变得模糊，继续在旧结构上叠加 desktop Gemini 历史只会放大共享实现和 import 维护成本。

## What Changes

- 在 desktop 主进程补齐 Gemini 历史 bridge、preload 与登录恢复链路，使桌面端能够预览并导入 Gemini 官网历史。
- 将 Gemini 历史共享实现收拢到 `packages/core/src/providers/history/gemini/`，统一承载远程配置、缓存回退、标题回退、消息序列化和标准化错误。
- 对 `packages/core/src` 做目录收口：`providers` 按接口类型分层，`agent-tools` 并入 `agents/tools`，agent runtime 并入 `agents/runtime`，`runtime` 仅保留 provider runtime，`analysis` 并入 `workflows/compare`。
- 全仓统一更新 import 与 `packages/core/src/index.ts` 导出，并补充 desktop 侧单测与回归验证，确保 desktop / extension 在目录迁移后行为保持不变。

## Capabilities

### New Capabilities
- 无新增 capability；本次变更以既有能力扩展和实现补齐为主。

### Modified Capabilities
- `gemini-dom-history-provider`: 将 Gemini 历史提供者从单一宿主 DOM 抓取扩展为共享 core 实现 + 宿主注入 bridge 的模式，使 desktop 与 extension 都能复用同一套 Gemini 历史内核。
- `desktop-host-app`: 扩展桌面宿主对 `gemini-web` 的登录恢复、受控页面 preload 装配与登录窗口关闭后的历史刷新能力。
- `conversation-workspace`: 扩展外部历史错误态的宿主恢复入口，使 `AUTH_REQUIRED` 场景可以在共享工作台中显示 `登录 Gemini` 等恢复动作。

## Impact

- 影响代码范围：`packages/core`、`packages/ui`、`apps/desktop/main`、`apps/desktop/src`，以及引用旧 core 路径的 `apps/extension`、`apps/server` 和测试文件。
- 影响的接口与装配点：`GeminiHistoryBridge`、`GeminiHistoryConfigLoader`、`GeminiDomHistoryProvider`、`controlledPageManager.ensurePage(...)`、`requestProviderLogin(providerId)`、`packages/core/src/index.ts`。
- 影响的运行时行为：desktop 主进程将第一次真正承载 Gemini 历史抓取；renderer 会在 `gemini-web` 外部历史 `AUTH_REQUIRED` 时展示宿主恢复动作；core 目录迁移后公共 API 保持稳定导出。
- 无计划引入破坏性对外接口变更；本次目录重构以边界收口和 import 迁移为主，不改变既有公共语义。
