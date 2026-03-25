## ADDED Requirements

### Requirement: Normal chat workspace MUST render model-specific option controls
系统 MUST 在普通聊天活动态下，根据当前选中模型动态渲染模型功能选项控件，并且这些控件 MUST 与当前模型目录声明保持一致。

#### Scenario: Show model option controls for supported model
- **WHEN** 用户位于普通聊天活动态，且当前模型目录为所选模型声明了一个或多个功能选项
- **THEN** 系统 MUST 在普通聊天输入区展示对应的 toggle 控件
- **AND** 每个 toggle 的图标、可操作状态以及可通过 tooltip 或 `aria-label` 获取的文字说明 MUST 直接反映当前模型的 option 元数据

#### Scenario: Hide model option controls when model has no options
- **WHEN** 用户当前选中的模型未声明任何功能选项
- **THEN** 系统 MUST 不渲染模型功能选项区域
- **AND** 普通聊天输入区 MUST 继续保持现有发送交互

#### Scenario: Disable model option controls while chat input is unavailable
- **WHEN** 普通聊天处于生成中、未鉴权或当前 Provider 模型目录仍在加载
- **THEN** 系统 MUST 禁用模型功能选项控件
- **AND** 这些控件 MUST 与 Provider/Model 选择器保持一致的不可编辑状态

### Requirement: Normal chat workspace MUST persist and restore conversation model selection
系统 MUST 将普通聊天会话的 `providerId`、`modelId` 与功能选项作为会话级状态保存，并在用户切换或重新打开该会话时恢复。

#### Scenario: Restore saved model selection when opening a conversation
- **WHEN** 用户重新打开一条已保存了 `modelSelection` 的本地普通聊天会话
- **THEN** 系统 MUST 恢复该会话上次使用的 `providerId`、`modelId` 与已启用功能选项
- **AND** 后续新消息 MUST 默认沿用该恢复后的配置

#### Scenario: Drop incompatible options after switching model
- **WHEN** 用户在当前会话中切换到另一模型，而新模型不支持此前启用的部分功能项
- **THEN** 系统 MUST 自动移除这些不兼容功能项
- **AND** 系统 MUST 仅保留新模型仍支持的启用项，并补上该模型声明为默认开启的选项

#### Scenario: Resolve conflicting options through normalized conversation state
- **WHEN** 用户在当前会话中启用一个与已有启用项存在冲突关系的功能项
- **THEN** 系统 MUST 自动关闭冲突项并保存规范化后的会话配置
- **AND** 发送链路 MUST 只消费规范化后的功能选项集合
