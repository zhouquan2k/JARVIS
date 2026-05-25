## Why

ChatPrism 目前已经支持 ChatGPT Web 和 Gemini 相关的 model provider，但还没有把 ChatGPT subscription 的 Codex 作为一等 provider 暴露出来。我们需要一个统一的 Codex provider，让它在 web、extension、desktop 三端表现一致，通过 server-backed 执行链路完成认证和请求，并且能够参与 Agent mode，同时明确不承担外部历史导入职责。

## What Changes

- 新增统一的 `chatgpt-codex` model provider，并让它在 `web`、`extension`、`desktop` 三种 runtime mode 下都可用。
- 通过本地 server 执行链路封装已安装的 `codex` CLI，用于完成认证状态检查、登录发起、模型目录读取、普通聊天执行和 Agent 执行。
- 为 web、extension、desktop 三端增加 Codex 的认证恢复流程，使用户可以在各自宿主内完成登录并重试 provider 初始化，而不需要重启应用。
- 让该 provider 实现 `IAgentCapableProvider`，接入 ChatPrism 的 Agent mode。
- 保持外部历史导入能力不变，并明确 Codex 不参与 external history provider 职责。

## Capabilities

### New Capabilities
- `chatgpt-codex-provider`: 统一定义 Codex provider 在三端的模型目录解析、认证、普通聊天请求和 Agent-capable 执行行为。
- `provider-proxy-server`: 新增本地 server 路由与服务，为 web、extension、desktop 三端提供统一的 Codex 认证和执行 API。

### Modified Capabilities
- `runtime-mode-provider-injection`: runtime 过滤与 provider factory 注入需要把 `chatgpt-codex` 纳入 `web`、`extension`、`desktop`，同时保持 fresh instance 语义不变。
- `web-host-app`: Web host 需要补充 Codex 认证恢复、server-backed provider 装配和共享工作区中的 provider 可用性要求。
- `extension-host-app`: Extension host 需要补充 Codex 认证恢复，并改为直接使用 server-backed Codex provider，而不是仅依赖 background host 通道。
- `desktop-host-app`: Desktop host 需要补充 Codex 认证恢复，并改为直接使用 server-backed Codex provider，而不是继续复用桌面 ChatGPT Web session 通道。

## Impact

- 影响代码范围：`packages/core` 的 provider/runtime 代码、`apps/server` 的 routes/services/config，以及 `apps/web`、`apps/extension`、`apps/desktop` 的 host 启动与 UI 逻辑。
- 新依赖链路：本机 `codex` CLI 将成为该 provider 的执行后端，并复用其 ChatGPT 登录态。
- API 影响：需要新增本地 server 的 Codex 认证、模型目录、普通执行和 Agent 执行接口。
- 验证影响：需要补充 core/server/host 的单测，以及三端关于认证恢复和 provider 可用性的 e2e 覆盖。
