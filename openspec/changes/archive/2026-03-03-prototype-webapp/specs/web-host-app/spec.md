## ADDED Requirements

### Requirement: Provide standalone web host application
系统 MUST 在 Monorepo 中提供独立的 Web 宿主应用工程，用于在普通浏览器环境运行聊天功能。

#### Scenario: Web host application scaffold exists
- **WHEN** 开发者初始化并安装项目依赖后
- **THEN** 系统 MUST 存在 `apps/web` 工程，并可通过标准前端命令启动和构建。

### Requirement: Reuse shared chat UI in web host
Web 宿主 MUST 复用 `packages/ui` 的聊天主界面与交互流程，不得在 `apps/web` 重复实现同等 UI 逻辑。

#### Scenario: Web host mounts shared Chat UI
- **WHEN** Web 宿主应用启动并渲染主页面时
- **THEN** 聊天界面 MUST 使用 `packages/ui` 提供的组件与状态流完成消息发送、流式展示和历史对话入口展示。

### Requirement: Integrate IndexedDB storage provider in web host
Web 宿主 MUST 注入 `IndexedDBStorageProvider` 作为会话存储实现，以保证会话历史可持久化。

#### Scenario: Conversation persists and can be restored in web host
- **WHEN** 用户在 Web 宿主中发送消息并刷新页面后
- **THEN** 系统 MUST 能从 IndexedDB 读取并恢复先前保存的会话记录。
