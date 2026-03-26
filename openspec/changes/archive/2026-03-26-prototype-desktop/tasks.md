## 1. 桌面宿主工程初始化

- [x] 1.1 新建 `apps/desktop` 基础工程和 `package.json`，接入 Electron + renderer 入口并纳入 workspace
- [x] 1.2 创建 `apps/desktop/src/main.ts` 与 `apps/desktop/src/App.vue`，复用共享 `packages/ui` 工作区挂载流程
- [x] 1.3 为桌面宿主补充基础启动脚本、开发构建配置和最小 preload / IPC 通道骨架

## 2. Core runtime 与 ChatGPT provider 抽象改造

- [x] 2.1 在 `packages/core/config.ts`、`runtime/types.ts`、`createProviderRuntime.ts` 中新增 `runtimeMode = 'desktop'`
- [x] 2.2 更新 provider 配置与 runtime 测试，覆盖 desktop 模式下的 provider 可见性与实例隔离
- [x] 2.3 为 `ChatGPTWebProvider` 提炼可注入的请求客户端与 Cookie 抽象类型
- [x] 2.4 重构 `ChatGPTWebProvider`，保持 extension 兼容路径，同时支持 Electron host 注入的请求与 Cookie 能力

## 3. Desktop host 执行层

- [x] 3.1 实现 `apps/desktop/main/sessionManager.ts`，按 provider 返回稳定的持久化 Session / partition
- [x] 3.2 实现 `apps/desktop/main/providerHost.ts`，支持 `sendMessage`、`checkAuth`、`getAvailableModels`、`getHistoryList`、`getHistoryDetail` 和 `abort`
- [x] 3.3 实现 `apps/desktop/main/controlledPageManager.ts` 的接口和最小受控页面复用能力，为后续 DOM 型 provider 预留执行入口
- [x] 3.4 在 host 中接入 `ChatGPTWebProvider` 的 Electron 注入依赖，打通桌面端首个网页登录型 provider
- [x] 3.5 新增 `apps/desktop/main/authWindow.ts`，实现按 provider 打开/复用 `chatgpt-web` 登录窗口并绑定现有持久化 Session
- [x] 3.6 在 `apps/desktop/main/index.ts` 中接入登录窗口 IPC，支持 renderer 请求打开 ChatGPT 登录窗口
- [x] 3.7 在 `apps/desktop/main/preload.ts` 中暴露登录窗口 API 与关闭事件桥接

## 4. Desktop renderer 代理与工作区装配

- [x] 4.1 实现 `apps/desktop/src/utils/proxyProtocol.ts`，复用请求关联标识与流式消息结构
- [x] 4.2 实现 `DesktopProxyProvider` 与 `DesktopHistoryProxy`，通过 IPC 转发模型请求、分析请求和历史查询
- [x] 4.3 实现 `apps/desktop/src/providerRuntime.ts`，向共享 store 暴露 desktop runtime 与 history providers
- [x] 4.4 在 `apps/desktop/src/App.vue` 中完成聊天、对比、外部历史与文件导入入口的装配
- [x] 4.5 在 `apps/desktop/src/App.vue` 中为 `chatgpt-web` 未登录态增加“登录 ChatGPT”按钮与引导文案
- [x] 4.6 接入登录窗口关闭后的鉴权刷新逻辑，成功后恢复 provider 可用状态
- [x] 4.7 保持非 `chatgpt-web` provider 和已登录状态下的现有桌面工作区行为不回退

## 5. 测试与验证

- [x] 5.1 为 core runtime 和 `ChatGPTWebProvider` 注入式改造补充单元测试
- [x] 5.2 为桌面 proxy / host 通信补充单元测试，覆盖并发流、错误回传与 abort
- [x] 5.3 使用 Playwright 编写桌面 e2e 用例，验证桌面宿主启动、provider 列表展示与 `chatgpt-web` 请求链路
- [x] 5.4 验证 `prototype-desktop` 对应的关键 spec 场景已被测试覆盖，并补充必要的实现文档
- [x] 5.5 为 `apps/desktop/main/authWindow.ts` 和登录窗口 IPC 补充单元测试，覆盖窗口复用与关闭事件回传
- [x] 5.6 为桌面 renderer 登录引导补充单元测试，覆盖未登录展示与登录后状态刷新
- [x] 5.7 更新桌面 e2e，用例覆盖未登录提示、登录入口可见性和登录窗口拉起链路
