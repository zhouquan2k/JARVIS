## MODIFIED Requirements

### Requirement: Background Proxy Forwarding
系统 MUST 提供一个运行于 Background 的代理机制，并暴露对应的 UI 替身 Provider，以绕过浏览器插件内容脚本的 CORS 限制。

#### Scenario: Proxy sendMessage to actual provider
- **WHEN** UI 层调用 `BackgroundProxyProvider.sendMessage` 并附带了所需配置项及 Payload（如 `{ providerId: 'gemini-api', modelId: 'gemini-2.5-flash' }` 等）
- **THEN** 替身 Provider MUST 通过长连接将指令发送至 Background 脚本
- **AND** Background MUST 作为无状态的路由分发引擎，根据传入的 `providerId` 动态实例化对应的真实 Provider（而无需预先从存储读取额外设置）
- **AND** Background 随后向该 Provider 发起实际请求，并将 SSE 流数据实时转发回 UI 层
