## Why

当前 ChatPrism 只有 `web` 和 `extension` 两种宿主，依赖网页登录态的 provider 主要只能在浏览器插件里可用，导致用户无法在桌面端获得与插件一致的能力。现在补齐桌面宿主，可以把现有的多 Provider、历史导入和共享工作区能力扩展到跨平台桌面场景，同时复用现有 `core/ui/runtime` 分层。

## What Changes

- 新增一个基于 Electron 的 `desktop` 宿主，用于承载共享 `packages/ui` 工作区和 `packages/core` runtime。
- 新增桌面端 provider 代理链路，使 renderer 通过 IPC 调用 host 中的真实 provider，而不是在前端直接执行网页登录请求。
- 新增桌面端会话与受控页面管理机制，用于承载基于 Cookie/Chromium 网络栈的 provider，以及后续依赖页面 DOM 的 provider。
- 新增桌面端 `chatgpt-web` 未登录态引导：当检测到鉴权失败时，在界面中提供“登录 ChatGPT”入口，并由 host 打开绑定持久化 Session 的登录窗口。
- 修改运行时装配能力，新增 `runtimeMode = 'desktop'`，使 provider 可按宿主模式进行可见性和创建策略过滤。
- 修改 `ChatGPTWebProvider`，将宿主相关的请求与 Cookie 获取能力抽象为可注入依赖，以便同时运行于 extension background 和 Electron host。

## Capabilities

### New Capabilities
- `desktop-host-app`: 定义桌面宿主如何装配共享工作区、provider runtime、历史 provider 与本地持久化能力。
- `desktop-provider-proxy`: 定义桌面 renderer 与 host 之间的代理协议、流式回传、错误处理和请求中止行为。

### Modified Capabilities
- `runtime-mode-provider-injection`: 增加 `desktop` 运行模式，并要求 runtime 对桌面宿主执行 provider 可见性过滤与实例创建。
- `chatgpt-web-provider`: 调整 provider 对宿主 API 的依赖方式，使其通过可注入请求客户端和 Cookie 能力运行于 Electron host。
- `desktop-host-app`: 增加桌面端未登录态的登录引导与登录窗口拉起能力，使网页登录型 provider 可在独立 Session 中完成首次认证。

## Impact

- 影响代码范围：`packages/core` runtime 与 provider、`apps/*` 宿主装配层，新增 `apps/desktop`。
- 影响宿主边界：新增 Electron main/renderer IPC、持久化 Session、登录窗口拉起和受控页面管理。
- 影响依赖：引入 Electron 相关开发与打包依赖。
- 影响后续规格：需要新增桌面宿主与桌面代理的 spec，并修改 runtime/provider 相关现有 spec。
