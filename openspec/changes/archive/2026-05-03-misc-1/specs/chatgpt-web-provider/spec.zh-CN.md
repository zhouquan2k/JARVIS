## ADDED Requirements

### Requirement: ChatGPT Web provider MUST 将功能性元数据归一化为功能性消息块
ChatGPT Web provider MUST 将 ChatGPT 响应中可可靠识别的 search、tool 或 function 结构化元数据归一化为共享功能性消息块。它 MUST 保持响应正文和 annotations 与现有渲染路径兼容。

#### Scenario: 将 search 元数据归一化为功能性消息块
- **WHEN** ChatGPT Web 响应包含与 assistant 正文分离的结构化 search 元数据
- **THEN** provider MUST 将该元数据转换为 search 或 trace 类型的 `functionalParts`
- **AND** provider MUST 继续通过普通 `text` 字段返回 assistant 正文

#### Scenario: 不从非结构化历史文本猜测
- **WHEN** ChatGPT 历史详情只包含非结构化渲染文本
- **THEN** provider MUST NOT 通过解析模糊自然语言来发明功能性消息块
- **AND** 会话 MUST 继续保留原始消息文本
