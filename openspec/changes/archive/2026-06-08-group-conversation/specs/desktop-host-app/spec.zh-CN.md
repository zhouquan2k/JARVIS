> **语言**: [English](spec.md) | 中文

## ADDED Requirements

### Requirement: Desktop host MUST implement the controlled-page event lane
desktop host SHALL 端到端实现 `subscribeControlledPageEvent` 能力：per-provider DOM preload SHALL 对最新助手回复节点常驻 `MutationObserver`，经 `ipcRenderer.send` 上报增量；主进程 SHALL 为每个转发事件打上 `providerId` 并转发到渲染窗口；渲染端 preload SHALL 暴露一个返回取消订阅函数的订阅。

#### Scenario: Reply increments flow page → main → renderer
- **WHEN** 活动发送期间受控页内被观察的回复节点发生变化
- **THEN** preload MUST 向主进程上报结构化增量
- **AND** 主进程 MUST 打上 `providerId` 并转发到渲染窗口
- **AND** 该 `providerId` 的渲染端订阅者 MUST 收到一个 `ControlledPageEvent`

#### Scenario: Unsubscribe stops delivery
- **WHEN** 渲染端订阅者调用返回的取消订阅函数
- **THEN** host MUST 停止向该订阅者继续投递受控页事件

### Requirement: Desktop host MUST register ChatGPT and Gemini DOM site adapters
desktop host SHALL 在受控页 preload 注册表中，为 `chatgpt-dom` 与 `gemini-dom` 各注册一个 DOM preload。每个适配器 SHALL 封装其 `targetUrl`、提问注入与提交选择器、最新回复节点定位、生成结束判定，并 SHALL 以 `{ providerId, requestId, type, text?, message? }` 载荷发出事件。

#### Scenario: Inject and submit a prompt
- **WHEN** host 被要求以某 `requestId` 向已注册 DOM 站点注入提问
- **THEN** 适配器 MUST 定位输入框、填入提问并触发提交
- **AND** 后续回复增量 MUST 携带该 `requestId`

#### Scenario: Detect end of generation
- **WHEN** 已注册 DOM 站点上被观察的回复趋于稳定且「停止生成」控件消失
- **THEN** 适配器 MUST 发出携带最终文本的 `done` 事件
