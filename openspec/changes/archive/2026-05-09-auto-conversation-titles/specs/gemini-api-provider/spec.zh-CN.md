## ADDED Requirements

### Requirement: Gemini provider MUST support low-cost conversation title generation
Gemini provider MUST 能通过共享 provider 标题生成能力，根据用户问题生成简洁会话标题。该链路 MUST 使用 provider 自行选定的低成本、非思考 Gemini 模型，而不是继承当前会话模型、模型选项或推理强度。

#### Scenario: Generate a title with a dedicated low-cost Gemini path
- **WHEN** 调用方向 Gemini provider 请求生成会话标题
- **THEN** provider MUST 通过其专用标题生成路径发起请求
- **AND** 该请求 MUST 使用 provider 选定的低成本非思考 Gemini 模型，而不是当前会话模型

#### Scenario: Return normalized standalone title text
- **WHEN** Gemini provider 收到原始标题生成结果
- **THEN** provider MUST 将结果归一化为简洁、可独立展示的标题文本
- **AND** provider MUST NOT 把解释性文字或多行回答直接作为标题返回
