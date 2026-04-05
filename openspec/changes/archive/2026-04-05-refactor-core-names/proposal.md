## Why

`packages/core` 中多组核心抽象存在命名重叠或语义过宽的问题，导致接口职责边界不清，增加了阅读、扩展和跨端协作时的理解成本。现在需要先统一核心命名，把“会话持久化”“外部会话来源”“模型 provider 运行时”这三类职责明确下来，为后续实现和文档收敛建立稳定基线。

## What Changes

- 将 `IStorageProvider` 与 `IConversationStorageProvider` 统一收敛为 `IConversationPersistProvider`，明确其职责仅为会话持久化。
- 将 `IHistoryProvider` 重命名为 `IExternalConversationProvider`，强调其代表外部会话来源，而不是泛义上的“历史”。
- 将 `ProviderRuntime` 重命名为 `ModelProviderRuntime`，强调该运行时只负责模型 provider 的解析、过滤与实例化。
- 在核心导出、宿主装配层、UI store、同步接入点和测试桩中同步更新相关类型引用，并保留必要的过渡兼容导出。
- 补充覆盖重命名路径的类型测试、运行时装配测试，以及关键宿主/存储接入的最小回归验证。

## Capabilities

### New Capabilities

无

### Modified Capabilities

- `core-interfaces`: 更新核心接口命名与兼容导出，明确持久化契约、外部会话来源契约和模型运行时契约的语义边界。
- `storage-provider`: 将存储能力规范从 `IStorageProvider` 收敛到 `IConversationPersistProvider`，并要求现有 CRUD 语义保持不变。
- `external-history-provider`: 将外部历史来源规范从 `IHistoryProvider` 收敛到 `IExternalConversationProvider`，并保持列表/详情读取行为不变。
- `runtime-mode-provider-injection`: 将运行时装配规范中的 `ProviderRuntime` 收敛为 `ModelProviderRuntime`，保持跨宿主的 provider 过滤与实例获取行为不变。

## Impact

- 受影响目录包括 `packages/core/src/interfaces/*`、`packages/core/src/runtime/*`、`packages/core/src/providers/*`、`packages/ui/src/store/*`、`apps/web/src/*`、`apps/desktop/src/*`、`apps/extension/src/*` 与对应测试。
- 这是一次类型命名和接口导出层面的重构，属于源码 API 变更；需要同步调整内部调用方与测试，但不引入新外部依赖。
- 若兼容导出策略处理不当，可能造成现有宿主装配、历史导入与存储链路的编译或运行时回归。
