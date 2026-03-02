## Why

我们需要一个以浏览器插件形式运行的聊天原型（MVP），来验证跨端架构的可行性。当前的痛点是直接在前端发起大模型请求会遇到 CORS 跨域问题，且对话数据无法进行本地持久化。通过该方案，我们可以利用插件的 Background 权限劫持 ChatGPT 网页版鉴权并代理请求，同时实现网络通信和数据存储的彻底解耦，为未来向纯客户端（如 Tauri）扩展奠定工程基础。

## What Changes

- 初始化跨端工程的 Monorepo 物理结构（拆分为 `core`, `ui`, `apps/extension` 包）。
- 引入双核抽象设计（Provider Pattern），明确定义网络通信（`IModelProvider`）和数据持久化（`IStorageProvider`）的契约层。
- 实现 WebApp 模式的网络通信架构，采用“真实 Provider + UI 替身 (Proxy)”架构，通过 Background 脚本代理转发规避 CORS 限制。
- 逆向实现 ChatGPT Web 的 API 接口，包括前端鉴权、防爬 Token 获取及 SSE 流解析。
- 接入 IndexedDB 作为 Web 环境的存储适配器，实现聊天记录的本地持久化落盘。

## Capabilities

### New Capabilities

- `core-interfaces`: 定义大模型通信（`IModelProvider`）与本地数据持久化（`IStorageProvider`）的核心接口契约。
- `chatgpt-web-provider`: 实现真实的 ChatGPT 网页版网络请求引擎，负责鉴权、防爬、拼接 Payload 及解析 SSE 数据流。
- `extension-proxy`: 插件宿主层面的代理转发机制，包含 Background 代理和 UI 层的替身 Provider，解决跨域及流式传输的对接问题。
- `storage-provider`: 基于 IndexedDB 的浏览器端数据持久化适配器实现，支持对话数据的存取与侧边栏渲染。

### Modified Capabilities


## Impact

- 确立了项目的 Monorepo 依赖边界：`core` 和 `ui` 彻底解耦，`core` 层严禁包含任何特定宿主 API（如 DOM、chrome.*）或 Vue 组件。
- 提高了系统的可扩展性与可复用性：未来开发桌面端应用时，UI 和核心业务逻辑可实现零修改复用，仅需提供特定环境的 Provider 实现（如 SqliteStorageProvider）。
