## ADDED Requirements

### Requirement: Extension host MUST 为 server-backed ChatGPT Codex provider 提供认证恢复入口
当当前 provider 为 `chatgpt-codex`，且本地 provider server 报告 Codex 当前未认证时，Extension host MUST 提供一个清晰可见的认证恢复入口。

#### Scenario: 在 Extension host 中显示 Codex 登录入口
- **WHEN** 当前 provider 为 `chatgpt-codex`，且 `checkAuth()` 返回 `false`
- **THEN** Extension host MUST 显示一个可见的 Codex 登录或恢复操作入口
- **AND** host MUST 提供明确的 the user facing 文案，说明 Codex provider 在登录完成前不可用

#### Scenario: Extension host 直接使用 server-backed provider
- **WHEN** Extension host 初始化 `chatgpt-codex`
- **THEN** host MUST 通过本地 provider server 路径构造该 provider，而不是继续依赖 extension 专属的 background 执行通道
- **AND** 其余共享工作区逻辑 MUST 继续通过正常的 runtime injection 消费该 provider
