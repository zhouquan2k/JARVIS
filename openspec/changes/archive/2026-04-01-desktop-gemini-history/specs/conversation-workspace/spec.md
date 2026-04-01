## ADDED Requirements

### Requirement: Normal chat view MUST surface host recovery actions for recoverable external-history failures
系统 MUST 允许共享工作台在外部历史出现可恢复宿主错误时，通过普通聊天预览区域展示宿主恢复文案和操作按钮，而不是只显示静态错误提示。首个恢复场景 MUST 支持 `gemini-web` 的 `AUTH_REQUIRED`。

#### Scenario: Render a host recovery action for Gemini auth failure
- **WHEN** 工作台当前处于 `gemini-web` 外部历史列表或预览态，且错误码为 `AUTH_REQUIRED`
- **THEN** `NormalChatView` MUST 在错误区域显示宿主恢复文案和 `登录 Gemini` 操作
- **AND** 普通聊天输入区 MUST 继续保持禁用或隐藏状态，直到恢复流程完成

#### Scenario: Bubble the recovery request to the host application
- **WHEN** 用户点击外部历史错误区域中的宿主恢复按钮
- **THEN** `NormalChatView` MUST 发出 `request-host-recovery`
- **AND** `ConversationWorkspaceView` MUST 继续向宿主应用透传该事件，而不是在共享 UI 内直接处理 desktop 专属逻辑
