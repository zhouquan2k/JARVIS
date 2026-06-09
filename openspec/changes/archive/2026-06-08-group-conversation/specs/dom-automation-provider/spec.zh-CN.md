> **语言**: [English](spec.md) | 中文

## ADDED Requirements

### Requirement: DOM-automation provider MUST drive real site pages as a standard IModelProvider
系统 SHALL 提供一个仅 desktop 的模型 provider，实例化为 `chatgpt-dom` 与 `gemini-dom`，通过驱动真实目标站点页面（而非逆向其 HTTP 后端）实现标准 `IModelProvider` 契约。每个实例 SHALL 配置各自的 `targetUrl`。provider SHALL 保持平台无关（内部不含站点选择器），从而既可单独使用、也可作为 group 成员。

#### Scenario: Send a prompt by driving the page
- **WHEN** 用户使用 DOM 自动化 provider 发送消息
- **THEN** provider MUST 确保目标站点页面已在受控页加载
- **AND** provider MUST 在该页注入提问并触发提交

#### Scenario: Usable standalone and as a group member
- **WHEN** 某 DOM 自动化 provider id 出现在 group 团队预设中
- **THEN** group provider MUST 能将其作为成员使用，且 group 侧零改动

### Requirement: DOM-automation provider MUST stream replies via controlled-page event subscription
provider SHALL 每次发送生成一个 `requestId`，订阅其 `providerId` 的受控页事件，并以该 `requestId` 注入提问。它 SHALL 对每个 `chunk` 事件触发 `onUpdate`，并在 `done` 事件时解析。对 `requestId` 不匹配当前发送的事件 SHALL 忽略。

#### Scenario: Stream chunks to onUpdate
- **WHEN** 受控页 push 出匹配当前 `requestId` 的 `chunk` 事件
- **THEN** provider MUST 经 `onUpdate` 推送 chunk 文本

#### Scenario: Ignore stale events from a previous turn
- **WHEN** 到达的事件 `requestId` 不匹配当前发送
- **THEN** provider MUST 忽略该事件

#### Scenario: Resolve on done
- **WHEN** 到达匹配当前 `requestId` 的 `done` 事件
- **THEN** provider MUST 以最终文本解析 `ProviderSendResult`
- **AND** provider MUST 取消该次发送的受控页事件订阅

### Requirement: DOM-automation provider MUST degrade to polling when observation fails
若超时内无 `done` 事件，或观测器报错，provider SHALL 降级为一次性 `evaluateInPage` 读取最终回复文本，使发送不会无限卡住。

#### Scenario: Fallback on timeout
- **WHEN** 配置超时内无 `done` 事件到达
- **THEN** provider MUST 经受控页一次性读取最终回复文本
- **AND** provider MUST 据此解析 `ProviderSendResult`

### Requirement: DOM-automation provider MUST be desktop-only
DOM 自动化 provider SHALL 仅在 desktop runtime 可用。SHALL NOT 在 web 或 extension runtime 提供。

#### Scenario: Not available outside desktop
- **WHEN** runtime 模式为 web 或 extension
- **THEN** `chatgpt-dom` / `gemini-dom` provider MUST NOT 可选
