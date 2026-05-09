## ADDED Requirements

### Requirement: Core interfaces MUST define an optional provider capability for conversation title generation
核心 model provider 契约 MUST 允许 provider 暴露一个可选的会话标题生成能力，并且该能力与正常消息发送链路分离。未实现该能力的 provider MUST 继续与基础 `IModelProvider` 契约兼容。

#### Scenario: Expose optional title generation without changing basic send semantics
- **WHEN** 核心模块导出 model provider 接口
- **THEN** 系统 MUST 允许 `IModelProvider` 暴露一个可选的 `generateConversationTitle(...)` 能力
- **AND** 未实现该能力的 provider MUST 继续通过现有消息发送契约正常工作

#### Scenario: Keep title generation independent from active reasoning settings
- **WHEN** 调用方请求 provider 侧会话标题生成
- **THEN** 共享标题生成 options MUST 与正常 `reasoningEffort` 和模型选项解耦
- **AND** 调用方 MUST NOT 被要求把当前聊天的推理配置透传进标题生成链路
