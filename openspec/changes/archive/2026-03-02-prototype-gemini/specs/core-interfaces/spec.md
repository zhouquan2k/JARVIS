## MODIFIED Requirements

### Requirement: Define IModelProvider Interface
系统 MUST 定义 `IModelProvider` 接口契约，作为所有大模型底层网络通信的统一规范，不得耦合特定宿主环境（如 DOM 或 Chrome API）。

#### Scenario: Validate IModelProvider structure
- **WHEN** 开发者实现一个新的大模型提供者时
- **THEN** 该实现 MUST 包含 `id` 属性，以及 `checkAuth`、`sendMessage` 和 `abort` 此三个核心方法。
- **AND** `sendMessage` 方法签名 MUST 升级为包含一个额外配置对象 `options?: { context?: any, modelId?: string }` 以接纳 UI 层传递过来的模型标识选择。
