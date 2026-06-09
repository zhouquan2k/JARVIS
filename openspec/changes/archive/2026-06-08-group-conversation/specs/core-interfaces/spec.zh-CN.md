> **语言**: [English](spec.md) | 中文

## ADDED Requirements

### Requirement: Core interfaces MUST define a controlled-page event subscription contract
`ControlledPageCapability` SHALL 暴露一个 push 式订阅方法 `subscribeControlledPageEvent(providerId: string, listener: (event: ControlledPageEvent) => void): () => void`，返回取消订阅函数。该能力 SHALL 定义 `ControlledPageEvent` 形态 `{ providerId: string; requestId: string; type: 'chunk' | 'done' | 'error'; text?: string; message?: string }`。这使受控页能向订阅者 push 回复增量，而非被轮询。

#### Scenario: Subscribe and receive controlled-page events
- **WHEN** 调用方执行 `subscribeControlledPageEvent(providerId, listener)`
- **THEN** listener MUST 收到为该 `providerId` 发出的 `ControlledPageEvent` 载荷
- **AND** 该调用 MUST 返回一个函数，调用后停止向该 listener 继续投递

#### Scenario: Event payload carries requestId for alignment
- **WHEN** 投递一个受控页事件
- **THEN** 事件 MUST 携带 `requestId`，使订阅者能对齐到具体一次发送
- **AND** 事件 `type` MUST 为 `chunk`、`done` 或 `error` 之一
