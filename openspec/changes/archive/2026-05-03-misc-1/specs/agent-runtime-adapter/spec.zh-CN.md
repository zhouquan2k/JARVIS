## ADDED Requirements

### Requirement: Agent runtime adapter MUST 为工具循环详情输出结构化功能性消息块
Agent runtime adapter MUST 将应用侧管理的工具循环调用和结果输出为结构化功能性消息块，同时可保留兼容性文本输出。这些消息块 MUST 使用共享 provider result 契约，使 UI 能通过普通聊天同一套折叠功能详情组件渲染。

#### Scenario: 工具循环轮次后输出 tool call 功能性消息块
- **WHEN** native Agent 路径收到 tool calls 并通过共享 tool executor 执行
- **THEN** Agent runtime MUST 创建描述 tool calls 和 tool results 的功能性消息块
- **AND** 这些消息块 MUST 被包含在 assistant 消息的 stream update 或最终 provider result 中

#### Scenario: 保留共享 stream 契约
- **WHEN** Agent runtime 流式输出文本和功能详情
- **THEN** 它 MUST 继续使用 `ProviderStreamUpdate`
- **AND** 它 MUST NOT 为功能详情引入 Agent-only UI 事件协议
