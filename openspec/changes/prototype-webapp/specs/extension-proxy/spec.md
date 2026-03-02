## ADDED Requirements

### Requirement: Background Proxy Forwarding
系统 MUST 提供一个运行于 Background 的代理机制，并暴露对应的 UI 替身 Provider，以绕过浏览器插件内容脚本的 CORS 限制。

#### Scenario: Proxy sendMessage to actual provider
- **WHEN** UI 层调用 `BackgroundProxyProvider.sendMessage`
- **THEN** 替身 Provider MUST 通过长连接将指令发送至 Background 脚本，由真实的 Provider 请求外部网络，并将 SSE 流数据实时转发回 UI 层
