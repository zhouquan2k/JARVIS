## 1. 配置与核心类型准备

- [ ] 1.1 扩展 `packages/core/config.ts` 的 Provider 元数据，增加 `supportedRuntimeModes` 并为现有 Provider 标注可运行模式。
- [ ] 1.2 在 `packages/core/src/runtime/types.ts` 定义 `RuntimeMode`、`ProviderRuntime` 及运行时初始化参数类型。
- [ ] 1.3 在 `packages/core/src/index.ts` 导出运行时装配相关类型与工厂函数，确保宿主可直接消费。

## 2. Runtime 装配层实现

- [ ] 2.1 在 `packages/core/src/runtime/createProviderRuntime.ts` 实现按 `runtimeMode` 过滤可用 Provider 列表。
- [ ] 2.2 实现 `getProvider(providerId)` 的工厂/注册表逻辑，返回符合 `IModelProvider` 的实例。
- [ ] 2.3 实现凭据注入链路（`credentials`），并明确优先级为“显式注入 > 环境变量回退”。

## 3. Provider 与 UI 适配

- [ ] 3.1 修改 `packages/core/src/providers/GeminiApiProvider.ts`，支持构造参数注入 API Key，同时保留兼容回退路径。
- [ ] 3.2 修改 `packages/ui/src/store/chat.ts`，增加可用 Provider 列表初始化与默认 provider/model 选择逻辑。
- [ ] 3.3 修改 `packages/ui/src/components/ProviderModelSelector.vue` 与 `packages/ui/src/ChatApp.vue`，改为消费 Runtime 过滤后的 Provider 列表并联动模型选择。

## 4. Web 宿主接入

- [ ] 4.1 新增并配置 `apps/web`（Vite + Vue3 + TS）工程，接入 workspace 依赖 `@packages/core` 与 `@packages/ui`。
- [ ] 4.2 在 `apps/web` 实现 `providerRuntime` 初始化（`runtimeMode: 'web'` + `credentials`），并注入 `IModelProvider` 与 `IndexedDBStorageProvider`。
- [ ] 4.3 在 `apps/web` 完成聊天主流程联调，验证页面刷新后会话可从 IndexedDB 恢复。

## 5. 验证与回归

- [ ] 5.1 为 Runtime 关键行为补充测试：运行模式过滤、`getProvider` 返回契约、凭据注入优先级。
- [ ] 5.2 补充 Web 端验收检查：Provider 下拉仅展示可运行项、模型联动、消息发送与流式更新。
- [ ] 5.3 执行扩展端回归验证，确认现有 `BackgroundProxyProvider` 路径不受本次变更影响。
