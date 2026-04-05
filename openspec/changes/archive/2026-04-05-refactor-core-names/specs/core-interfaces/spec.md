## ADDED Requirements

### Requirement: Core interfaces MUST expose conversation persistence through a dedicated persist contract
系统 MUST 使用专门表达“会话持久化”的核心契约来承载会话 CRUD 能力，而不是继续同时暴露 `IStorageProvider` 与 `IConversationStorageProvider` 两套等价命名。该主契约 MUST 命名为 `IConversationPersistProvider`，并保持现有会话保存、读取、列表和删除语义不变。

#### Scenario: Expose one canonical conversation persistence interface
- **WHEN** 核心模块导出会话持久化相关接口
- **THEN** 系统 MUST 提供 `IConversationPersistProvider`
- **AND** 该接口 MUST 至少包含 `saveConversation`、`getConversation`、`getAllConversations` 与 `deleteConversation`

#### Scenario: Preserve compatibility for current conversation data model
- **WHEN** 调用方继续使用现有 `Conversation`、`ConversationMessage`、`MessageAttachment` 等会话数据结构
- **THEN** 系统 MUST 保持这些数据模型的字段语义不变
- **AND** 本次重构 MUST NOT 借接口重命名顺带改变会话内容结构

### Requirement: Core interfaces MUST name external conversation sources explicitly
系统 MUST 以 `IExternalConversationProvider` 作为外部会话来源的统一契约，并通过相应的外部 provider 标识与摘要类型表达其“来源于外部系统”的语义，而不是继续使用泛化的 `IHistoryProvider` 名称。

#### Scenario: Expose external source contract under explicit naming
- **WHEN** 核心模块导出外部会话来源相关接口
- **THEN** 系统 MUST 提供 `IExternalConversationProvider`
- **AND** 相关 provider entry 类型 MUST 引用该新接口，而不是继续把“历史”作为主语义

#### Scenario: Keep external conversation read behavior stable during rename
- **WHEN** 外部会话来源实现迁移到新接口命名
- **THEN** 系统 MUST 继续支持外部会话摘要列表读取和详情读取
- **AND** 本次重构阶段 MUST NOT 改变这些读取操作的行为约束

### Requirement: Core interfaces MUST distinguish model runtime from other provider families
系统 MUST 将模型 provider 装配接口明确命名为 `ModelProviderRuntime`，以表达其职责仅限于模型 provider 的过滤、目录读取与实例创建，而不是广义的 provider 管理总线。

#### Scenario: Expose a model-scoped runtime contract
- **WHEN** 核心运行时模块导出 provider runtime 类型
- **THEN** 系统 MUST 以 `ModelProviderRuntime` 作为模型运行时契约名
- **AND** 该契约 MUST 继续承载 provider 列表、provider catalog、模型目录与 provider 实例获取能力

#### Scenario: Keep runtime method semantics stable during rename
- **WHEN** 现有 Compare、Agent 或宿主装配逻辑使用模型运行时
- **THEN** 系统 MUST 保持 `getAvailableProviders`、`getProviderCatalog`、`getProviderModels` 与 `getProvider` 的行为语义不变
- **AND** 本次重构 MUST NOT 顺带把其他 provider 家族注入到该 runtime 契约中
