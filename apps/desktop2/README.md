# ChatPrism Desktop

## 概览

`apps/desktop2` 是基于 Electron 的桌面宿主，复用 `packages/ui` 的工作区界面与 `packages/core` 的 runtime/provider 能力，并通过 `renderer -> preload -> IPC -> host` 的代理链路访问真实 Provider。

当前首批能力包括：

- `desktop2` runtimeMode 与共享 provider 目录接入
- 桌面端 `ChatGPT (Web)` / `Gemini (API)` Provider 列表与对比工作流
- host 侧 `chatgpt-web` Session/Cookie 注入
- renderer 侧聊天、对比、外部历史入口与文件导入装配
- `controlledPageManager` 预留，为后续 `gemini-web` 这类 DOM 型能力复用受控页面

## 目录

- `src/`：renderer 入口、桌面版 App 装配、proxy runtime 与 IPC 代理
- `main/`：Electron 主进程入口、preload、provider host、Session 与受控页面管理
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
- `CHATPRISM_DESKTOP_DEV_SERVER_URL`：开发模式下主进程加载的 renderer 地址
- `CHATPRISM_LLM_API_KEY` / `VITE_LLM_API_KEY`：桌面 host 透传给 `gemini-api`
- `VITE_E2E=1`：切换到 mock runtime，供桌面 e2e 使用

## 测试覆盖

当前已经覆盖以下关键场景：

- core runtime 在 `desktop2` 模式下的 provider 过滤与注入
- `ChatGPTWebProvider` 的注入式请求客户端 / Cookie 能力
- desktop proxy / host 的并发流、错误回传与 abort
- Electron 宿主启动、provider 列表展示与 `chatgpt-web` mock 请求链路
