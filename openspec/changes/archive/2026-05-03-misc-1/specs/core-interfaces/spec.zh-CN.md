## ADDED Requirements

### Requirement: 核心会话模型 MUST 保留结构化功能性消息块
核心会话模型 MUST 允许 assistant 消息携带可选的结构化功能性消息块，用于 tool call、function call、search trace 及相关操作详情。不包含这些消息块的会话 MUST 继续有效。

#### Scenario: 在会话消息上保存功能性消息块
- **WHEN** provider 或 runtime 为 assistant 消息返回结构化功能详情
- **THEN** 系统 MUST 允许该消息以 `functionalParts` 持久化这些详情
- **AND** 该消息 MUST 继续保留普通正文和 annotations

#### Scenario: 读取没有功能性消息块的会话
- **WHEN** 系统归一化旧会话消息且该消息没有 `functionalParts`
- **THEN** 系统 MUST 将该字段视为缺省
- **AND** 会话 MUST 仍可读取和渲染

### Requirement: Provider result 契约 MUST 携带可选功能性消息块
Provider streaming 和最终结果契约 MUST 支持可选功能性消息块，使普通 provider、Agent-capable provider 和 proxy provider 能共享同一输出形态。

#### Scenario: 生成期间流式输出功能性消息块
- **WHEN** provider 在 streaming response 期间拥有结构化功能详情
- **THEN** provider stream update MAY 包含 `functionalParts`
- **AND** 消费方 MUST 能把这些块关联到当前 assistant 消息

#### Scenario: 在最终结果中返回功能性消息块
- **WHEN** provider 完成响应且拥有结构化功能详情
- **THEN** 最终 provider result MUST 能包含 `functionalParts`
- **AND** 对不暴露此类详情的 provider，该字段 MUST 是可选的
