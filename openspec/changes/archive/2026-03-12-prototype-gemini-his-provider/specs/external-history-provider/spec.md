## MODIFIED Requirements

### Requirement: External history provider MUST return first-page conversation summaries
系统 MUST 通过独立的 `IHistoryProvider` 返回外部历史摘要列表，首版只读取最近的第 1 页结果，并允许不同 provider 以统一契约接入。

#### Scenario: Fetch first page of external history
- **WHEN** UI 调用某个外部 provider 的 `getHistoryList()`
- **THEN** 系统 MUST 返回最近一页的远端会话摘要列表
- **AND** 每条摘要 MUST 至少包含外部 ID、标题、更新时间和 `origin`

### Requirement: External history provider MUST normalize detail into shared Conversation model
系统 MUST 将外部历史详情转换为统一的线性 `Conversation` 数据结构，再交给 UI 渲染和导入流程使用。

#### Scenario: Normalize external history detail
- **WHEN** UI 调用 `getHistoryDetail(externalId)`
- **THEN** 系统 MUST 返回一个标准化的 `Conversation`
- **AND** 返回结果 MUST 包含 `externalId`、`backendId`、`origin` 和线性 `messages`

### Requirement: External history provider MUST select one renderable main branch from tree data
系统 MUST 在外部历史详情为树状节点结构时，仅选择一条可继续追问的主链并过滤当前 UI 不支持的节点类型。

#### Scenario: Flatten tree-like history detail
- **WHEN** 外部历史详情包含分支节点、系统节点或工具节点
- **THEN** 系统 MUST 只提取一条主链上的 `user` 与 `assistant` 消息
- **AND** 系统 MUST 过滤无法在当前聊天界面稳定渲染的非用户/助手节点

## ADDED Requirements

### Requirement: External history provider MUST expose recoverable provider-specific failures
系统 MUST 将外部历史抓取过程中的 provider 特定失败标准化为可恢复错误，避免 UI 把抓取故障误判为空列表或空详情。

#### Scenario: Return normalized external history error
- **WHEN** 外部 provider 发生认证失败、配置缺失、选择器失配或详情不存在等异常
- **THEN** 系统 MUST 返回带有稳定错误码的失败结果
- **AND** UI MUST 能根据该错误码展示可读提示而不是直接暴露底层异常文本
