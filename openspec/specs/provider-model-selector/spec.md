## MODIFIED Requirements

### Requirement: Show Provider Selector in chat interface
聊天界面 MUST 提供一个可见的下拉框，用于选择当前运行模式可用的 AI 模型提供商（Provider）。

#### Scenario: Provider options are populated from runtime-filtered config
- **WHEN** 聊天主界面渲染且运行时装配层已初始化时
- **THEN** Provider 下拉框 MUST 仅显示运行时返回的可用 Provider 列表（即满足 `supportedRuntimeModes` 与可用性约束的集合）。

### Requirement: Show cascading Model Selector based on Provider
根据用户选定的 Provider，Model 下拉框 MUST 动态更新为该 Provider 在当前运行模式下可用的模型列表。

#### Scenario: Provider changes trigger Model list refresh
- **WHEN** 用户在 Provider 下拉框中切换到另一个可用 Provider
- **THEN** Model 下拉框 MUST 清空上一个 Provider 的模型并加载新 Provider 的模型列表
- **AND** 系统 MUST 自动选中新 Provider 的默认模型。
