## ADDED Requirements

### Requirement: Storage providers MUST preserve conversation model selection across save and load
存储实现 MUST 在保存和读取 `Conversation` 时无损保留会话级 `modelSelection`，使普通聊天可以在会话恢复后继续沿用此前的 Provider、模型和功能选项。

#### Scenario: Persist conversation model selection
- **WHEN** 存储实现保存一条包含 `modelSelection.providerId`、`modelSelection.modelId` 与 `modelSelection.modelOptions` 的会话
- **THEN** 后续读取该会话时 MUST 返回完整一致的 `modelSelection`
- **AND** 系统 MUST 不因保存流程丢失任何已启用的功能项键值

#### Scenario: Preserve backward compatibility for conversations without model selection
- **WHEN** 存储实现读取旧会话且该会话未包含 `modelSelection`
- **THEN** 系统 MUST 允许该字段缺省
- **AND** 旧会话 MUST 继续作为普通可恢复会话被读取，而不是因为缺少新字段失败
