## ADDED Requirements

### Requirement: ChatGPT Web provider MUST support low-cost conversation title generation
ChatGPT Web provider MUST 能通过共享 provider 标题生成能力，根据用户问题生成简洁会话标题。该标题生成链路 MUST 使用 provider 自行选定的低成本、非思考模型，而不是继承当前对话使用的模型、模型选项或推理强度。

#### Scenario: Generate a title with a dedicated low-cost provider path
- **WHEN** 调用方向 `ChatGPTWebProvider` 请求生成会话标题
- **THEN** provider MUST 发起一条专用的标题生成请求
- **AND** 该请求 MUST 使用 provider 选定的低成本非思考模型，而不是当前会话模型

#### Scenario: Return normalized title text only
- **WHEN** provider 从 ChatGPT Web 收到原始标题生成结果
- **THEN** provider MUST 将其归一化为简洁标题文本
- **AND** provider MUST NOT 把解释性文字、引号包裹或多行输出直接作为会话标题返回
