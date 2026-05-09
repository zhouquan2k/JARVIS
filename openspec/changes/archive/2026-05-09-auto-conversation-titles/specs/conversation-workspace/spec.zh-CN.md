## ADDED Requirements

### Requirement: Conversation workspace MUST automatically title newly created local conversations from the first question
普通对话工作台 MUST 在新建本地会话首条问题发送成功后，将占位标题 `New Chat` 替换为基于该问题生成的简洁标题。该行为 MUST 适用于普通对话模式中新建的本地会话，并通过现有会话持久化提供者持久化。

#### Scenario: Replace the placeholder title after the first successful send
- **WHEN** 一条新建本地会话当前标题仍为 `New Chat`
- **AND** 用户在普通对话模式中成功发送首条问题
- **THEN** 系统 MUST 基于该首条问题生成简洁会话标题
- **AND** 系统 MUST 将该生成标题持久化到该会话上

#### Scenario: Do not block the main send flow when title generation fails
- **WHEN** 首条问题发送已经成功，但自动标题生成失败
- **THEN** 系统 MUST 保持主助手回复成功
- **AND** 系统 MUST 持久化一个确定性的本地回退标题，而不是让会话保持未命名状态

### Requirement: Conversation workspace MUST regenerate title only when the first visible question is resent
普通对话工作台 MUST 仅在用户编辑并重发第一条可见用户问题时重新生成会话标题。普通后续追问 MUST NOT 覆盖已经存在的非占位标题，包括手动重命名后的标题。

#### Scenario: Regenerate title after editing and resending the first visible question
- **WHEN** 用户编辑并重发一条本地会话中的第一条可见用户问题
- **THEN** 系统 MUST 基于修改后的第一条问题重新生成会话标题
- **AND** 该重生成标题 MUST 被持久化回原会话

#### Scenario: Preserve the current title during ordinary follow-up turns
- **WHEN** 一条本地会话已经具有非占位标题
- **AND** 用户发送普通后续追问，且该次发送并非编辑重发第一条可见问题
- **THEN** 系统 MUST 保持当前会话标题不变
- **AND** 系统 MUST NOT 在该次发送中覆盖手动重命名结果
