## 1. 核心契约与配置基础

- [x] 1.1 更新 `packages/core/src/interfaces/IStorageProvider.ts`、`packages/core/src/interfaces/IHistoryProvider.ts` 与相关导出，统一使用 `Conversation.origin`、`ExternalHistoryProviderId` 和外部 provider 注册表契约
- [x] 1.2 在 `packages/core` 中补充 Gemini 远程配置、规范化历史错误与相关类型定义，并让现有 ChatGPT 历史摘要/详情返回新字段命名
- [x] 1.3 扩展 `packages/core/config.ts` 以支持 provider config 基础地址读取和 Gemini 相关运行时配置

## 2. 服务端远程配置分发

- [x] 2.1 在 `apps/server` 中新增 provider config 路由与 `gemini-history` 配置文件，提供版本化 JSON 响应与 404 处理
- [x] 2.2 为服务端 provider config 接口补充单元测试，覆盖正常拉取、未知 provider、缓存/版本元信息返回

## 3. 扩展端 Gemini 历史抓取链路

- [x] 3.1 更新 `apps/extension/wxt.config.ts`，补充 Gemini 站点权限、内容脚本入口与运行时所需声明
- [x] 3.2 实现 `GeminiHistoryConfigLoader`、`GeminiHistoryTabBridge`、`geminiContentProtocol` 与 `GeminiDomHistoryProvider`，完成远程配置拉取、缓存回退、受控标签页抓取和规范化错误返回
- [x] 3.3 在 `apps/extension/entrypoints/background.ts` 和 `apps/extension/src/providerRuntime.ts` 中注册 Gemini 历史 provider，并打通外部 provider 注册表与文件导入入口

## 4. 工作台与导入交互改造

- [x] 4.1 改造 `packages/ui/src/store/chat.ts`，实现“本地 / 外部”一级状态、`ChatGPT / Gemini / 外部文件导入` 二级选择、外部 provider 列表加载与导入后回切本地
- [x] 4.2 更新 `packages/ui/src/views/ConversationWorkspaceView.vue`、`packages/ui/src/components/ConversationSidebar.vue` 与相关组件，使外部视图支持 provider 二级切换和文件导入触发
- [x] 4.3 调整 `apps/extension/src/App.vue` 与相关运行时装配逻辑，确保扩展宿主在启动时注入外部 provider 注册表、Gemini 依赖和文件导入能力

## 5. 测试与收尾

- [x] 5.1 为核心 store、Gemini provider 与服务端配置加载补充单元测试，覆盖 `origin` 持久化、缓存回退与规范化错误
- [x] 5.2 使用 Playwright 为 extension 编写并运行 e2e 用例，覆盖“本地 / 外部”切换、外部 provider 二级选择、Gemini 历史预览/错误兜底与外部文件导入流程
- [x] 5.3 在 e2e 通过后运行 `pnpm --filter extension build`，确认扩展产物可正常构建
