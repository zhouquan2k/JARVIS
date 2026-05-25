## ADDED Requirements

### Requirement: Web host MUST 为 server-backed ChatGPT Codex provider 提供认证恢复入口
当当前 provider 为 `chatgpt-codex`，且本地 provider server 报告 Codex 当前未认证时，Web host MUST 提供一个清晰可见的认证恢复入口。

#### Scenario: 在 Web host 中显示 Codex 登录入口
- **WHEN** 当前 provider 为 `chatgpt-codex`，且 `checkAuth()` 返回 `false`
- **THEN** Web host MUST 显示一个可见的 Codex 登录或恢复操作入口
- **AND** host MUST 提供明确的 the user facing 文案，说明 Codex provider 在登录完成前不可用

#### Scenario: 发起登录恢复后刷新认证状态
- **WHEN** 用户触发 Web host 的 Codex 登录恢复操作
- **THEN** host MUST 启动本地 server-backed 登录流程
- **AND** host MUST 重试查询 Codex 认证状态，直到 provider 可用或该流程失败
