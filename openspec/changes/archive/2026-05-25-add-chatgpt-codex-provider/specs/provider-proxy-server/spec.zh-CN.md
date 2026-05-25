## ADDED Requirements

### Requirement: 本地 provider server MUST 暴露 Codex 认证状态和登录发起能力
本地 provider server MUST 为 `chatgpt-codex` 暴露 server-backed 认证 API，使所有支持的宿主都能通过同一套契约判断 Codex 是否可用，并发起登录恢复流程。

#### Scenario: 返回当前 Codex 认证状态
- **WHEN** 某个宿主调用本地 provider server 的 Codex auth status endpoint
- **THEN** server MUST 返回当前已安装的 Codex 后端是否已认证
- **AND** 返回结果 MUST 为规范化结构，而不是要求调用方自行解析原始 CLI 输出

#### Scenario: 发起一次 Codex 登录恢复流程
- **WHEN** 某个宿主请求本地 provider server 发起 Codex 登录恢复流程
- **THEN** server MUST 启动一个受支持的 Codex 登录路径
- **AND** server MUST 返回宿主可以直接展示给用户的规范化登录指令或 device-auth 元数据

### Requirement: 本地 provider server MUST 暴露 Codex 模型目录查询能力
本地 provider server MUST 为 `chatgpt-codex` 提供统一的模型目录 endpoint，使所有支持的宿主都解析同一份 Codex 模型列表和默认模型行为。

#### Scenario: 通过 server 读取 Codex 模型目录
- **WHEN** 宿主或 provider 请求 `chatgpt-codex` 的模型目录
- **THEN** 本地 provider server MUST 通过后端执行层读取可用的 Codex 模型
- **AND** server MUST 返回规范化的 `ProviderModelCatalog`

### Requirement: 本地 provider server MUST 代理普通 Codex 聊天执行
本地 provider server MUST 为 `chatgpt-codex` 暴露普通聊天执行 endpoint，并且 MUST 将规范化后的响应事件流式返回给调用方。

#### Scenario: 通过 server 流式返回一条 Codex 聊天响应
- **WHEN** 调用方向本地 provider server 提交一次普通 Codex chat 请求
- **THEN** server MUST 通过 Codex 后端执行该请求
- **AND** server MUST 持续将规范化响应事件流式返回给调用方，直到执行完成

### Requirement: 本地 provider server MUST 代理 Codex Agent 执行
本地 provider server MUST 为 `chatgpt-codex` 暴露 agent 执行 endpoint，使 ChatPrism Agent mode 可以复用同一套登录态和执行路径。

#### Scenario: 通过 server 执行一次 agent 请求
- **WHEN** 调用方向本地 provider server 提交一次 `chatgpt-codex` agent 执行请求
- **THEN** server MUST 通过 Codex 后端执行该请求
- **AND** server MUST 返回与 provider 契约兼容的规范化流式和最终结果载荷

### Requirement: 本地 provider server MUST 将宿主与 Codex CLI 细节隔离开
本地 provider server MUST 隐藏原始 CLI 调用细节，使 web、extension、desktop 三端只依赖规范化 HTTP 契约。

#### Scenario: 宿主不直接解析原始 CLI 输出
- **WHEN** 任一支持的宿主使用 `chatgpt-codex`
- **THEN** 宿主 MUST 只与规范化 server endpoint 交互
- **AND** CLI 命令构造、输出解析和错误规范化 MUST 保持在 server 侧
