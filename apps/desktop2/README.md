# ChatPrism Desktop

## 概览

`apps/desktop2` 是基于 Electron 的桌面宿主，复用 `packages/ui` 的工作区界面与 `packages/core` 的 runtime/provider 能力，并通过 `renderer -> preload -> IPC -> host` 的代理链路暴露桌面特有的容器能力。

当前首批职责包括：

- `desktop2` runtimeMode 与共享 provider 目录接入
- 受控页、登录页、浏览器自动化、context 等桌面宿主能力暴露
- Electron 主进程、preload、IPC 与窗口生命周期管理
- 供插件消费的通用 controlled-page 容器

## 目录

- `src/`：renderer 入口、桌面版 App 装配、proxy runtime 与 IPC 代理
- `main/`：Electron 主进程入口、preload、Session 与受控页面管理
- `shared/`：renderer / host 共享的代理协议定义
- `tests/e2e/`：桌面宿主启动与请求链路验证

## 常用命令

- `pnpm --filter desktop2 dev:renderer`：启动 renderer 开发服务
- `pnpm --filter desktop2 dev:host`：构建 main/preload 并启动 Electron 宿主
- `pnpm --filter desktop2 build`：构建 renderer 与 main/preload
- `pnpm --filter desktop2 test`：运行桌面单测
- `pnpm --filter desktop2 test:e2e`：运行桌面 e2e（使用 mock runtime）

## 关键环境变量

- `CHATPRISM_SYNC_KEY`：桌面宿主的同步命名空间；生产构建下必须提供
- `CHATPRISM_DESKTOP_USE_LOCAL_BUNDLE=1`：以本地 bundle 模式加载 renderer，不走任何本地 server origin
- `CHATPRISM_CONTEXT_BASE_URL` / `CHATPRISM_SYNC_BASE_URL` / `CHATPRISM_CODEX_BASE_URL` / `CHATPRISM_PROVIDER_CONFIG_BASE_URL`：本地 bundle 模式下指向真实 VPS 的 API 地址
- `CHATPRISM_DESKTOP_DEV_SERVER_URL`：开发模式下主进程加载的 renderer 地址
- `CHATPRISM_LLM_API_KEY` / `VITE_LLM_API_KEY`：桌面 host 透传给 `gemini-api`
- `VITE_E2E=1`：切换到 mock runtime，供桌面 e2e 使用

## 当前推荐运行方式

- `web2` 本地开发继续依赖本地 server，作为 VPS 模拟器。
- `desktop2` 默认按生产形态验证：`CHATPRISM_DESKTOP_USE_LOCAL_BUNDLE=1`，并把 context/sync/codex/provider-config 指到真实 VPS。
- 因此 `desktop2` 的日常链路不应再依赖 Mac 本地 server。
- 当前 VPS 示例：`http://100.110.154.91:8787`，当前共享 `syncKey`：`dev-local`。

## 测试覆盖

当前已经覆盖以下关键场景：

- core runtime 在 `desktop2` 模式下的 provider 过滤与注入
- `ChatGPTWebProvider` 的注入式请求客户端 / Cookie 能力
- desktop proxy / host 的并发流、错误回传与 abort
- Electron 宿主启动、provider 列表展示与 `chatgpt-web` mock 请求链路

## 边界原则

- `desktop2` 只暴露桌面宿主特有的通用容器能力，不持有 provider-specific 的概念、命名或业务流程。
- 任何 AI provider 的页面桥接、历史抓取、DOM 自动化与主动控制逻辑都应归插件侧；宿主仅承载通用 preload / IPC / 受控页窗口壳。
