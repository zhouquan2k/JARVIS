## ADDED Requirements

### Requirement: Gemini provider MUST 将 function 和 tool 元数据归一化为功能性消息块
Gemini provider MUST 在结构化元数据可用时，把普通 Gemini 响应和 native Agent Gemini 响应中的 function-call 或 tool-call 元数据转换为共享功能性消息块。

#### Scenario: 归一化 Gemini function call 元数据
- **WHEN** Gemini 响应包含结构化 function-call 元数据
- **THEN** provider MUST 将该元数据暴露为 `functionalParts`
- **AND** 普通 assistant text stream MUST 继续通过共享 `text` update 可用

#### Scenario: 保留没有功能性元数据的普通响应
- **WHEN** Gemini 响应只包含 assistant 正文
- **THEN** provider MUST 不返回功能性消息块
- **AND** 该响应 MUST 作为普通 assistant 消息渲染
