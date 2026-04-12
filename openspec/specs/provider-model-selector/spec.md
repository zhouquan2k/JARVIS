English | [中文](spec.zh-CN.md)

## MODIFIED Requirements

### Requirement: Show Provider Selector in chat interface
聊天界面 MUST 提供可见的 Provider 选择控件；在普通聊天模式下 MUST 提供单组 Provider 选择器，在对比模式下 MUST 提供 A/B 两组独立 Provider 选择器。该要求 MUST 同时适用于 Web 宿主与 extension 全窗口宿主。

#### Scenario: Compare mode renders two independent provider selectors in extension host
- **WHEN** 用户在 extension 全窗口宿主进入对比聊天视图
- **THEN** 系统 MUST 渲染 Model A 与 Model B 的独立 Provider 选择器
- **AND** 每组 Provider 选项 MUST 来自 extension 运行模式可用 Provider 列表。

### Requirement: Show cascading Model Selector based on Provider
每个 Provider 选择器都 MUST 绑定一个级联 Model 选择器；当某一组 Provider 变化时，该组 Model 列表 MUST 独立刷新并选中该 Provider 默认模型，不得影响另一组选择状态。该行为在 extension 宿主下同样 MUST 保持独立。

#### Scenario: Changing Provider A updates only Model A options in extension compare mode
- **WHEN** 用户在 extension 对比视图中切换 Model A 的 Provider
- **THEN** 系统 MUST 仅刷新 Model A 的模型列表并自动选中默认模型
- **AND** Model B 的 Provider 与 Model 选择 MUST 保持不变。
