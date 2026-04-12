## 1. 共享 i18n 运行时

- [x] 1.1 在 `packages/ui` 新增 i18n 模块、locale 类型、消息资源和 locale 解析逻辑
- [x] 1.2 在 `packages/ui/index.ts` 导出共享 i18n 插件和 composable，统一宿主接入方式
- [x] 1.3 实现 locale 持久化策略，满足“用户选择优先，其次宿主语言，默认英文”

## 2. 三宿主初始化接入

- [x] 2.1 在 `apps/web/src/main.ts` 安装共享 i18n 插件，确保挂载前完成 locale 初始化
- [x] 2.2 在 `apps/desktop/src/main.ts` 安装共享 i18n 插件，保持与 Web 相同的初始化契约
- [x] 2.3 在 `apps/extension/entrypoints/index/main.ts` 安装共享 i18n 插件，保持与另外两个宿主一致
- [x] 2.4 为语言切换入口选择一个 Phase 2 最小稳定位置，并在共享 UI 中接入

## 3. 静态文案与配置本地化

- [x] 3.1 迁移 `packages/ui/src/components/**` 中直接渲染的静态用户可见文案到 translation key
- [x] 3.2 迁移 `packages/ui/src/views/**` 与 `packages/ui/src/routes.ts` 中的静态文案到 translation key
- [x] 3.3 调整 `packages/core/config.ts`，为 provider / model / option 的可见配置增加 translation key 与英文 fallback
- [x] 3.4 更新 `ProviderModelSelector`、`ModelOptionToggleGroup` 及相关共享 UI，优先读取本地化 key，缺失时回退到英文原文
- [x] 3.5 明确排除 `currentError`、`analysisError` 和其他运行时异常字符串，不将其纳入 Phase 2 翻译资源

## 4. 测试与回归

- [x] 4.1 为共享 i18n 运行时补充单元测试，覆盖 locale 解析、持久化恢复和 `t()` fallback
- [x] 4.2 为关键共享组件/视图补充测试，覆盖 locale 切换后标签、按钮、空态和占位符渲染
- [x] 4.3 增加至少一条基于 Playwright 的最小 UI 国际化回归用例，验证语言切换与刷新持久化
- [x] 4.4 按顺序运行 `pnpm lint`、类型检查、目标宿主构建、最小功能回归和目标范围完整回归
- [x] 4.5 如涉及 extension e2e，按仓库规则申请提权并使用 Playwright `channel: 'chromium'` 执行，完成后运行 `pnpm --filter extension build`
