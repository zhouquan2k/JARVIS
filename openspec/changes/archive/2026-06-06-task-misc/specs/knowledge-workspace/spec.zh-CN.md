## ADDED Requirements

### Requirement: Knowledge workspace MUST provide a workspace-owned node navigation bridge with panel restoration
knowledge workspace MUST 提供一个更高层的导航桥接，用来在重新打开 workspace 节点的同时恢复 workspace 自身拥有的面板状态。该桥接 MUST 负责把路由恢复到 knowledge workspace，并且 MUST 支持可选的任务相关 `tab` 与 `detailKey` 载荷；而更底层的 document workspace store MUST NOT 获得路由切换语义。

#### Scenario: Reopen a workspace node with task panel restoration
- **WHEN** 调用方请求基于某个 workspace path 进行 knowledge workspace 导航，并同时传入任务相关的 `tab` 与 `detailKey`
- **THEN** the system MUST 先恢复 knowledge workspace 路由，再打开目标节点
- **AND** The system MUST 让请求中的 `tab` 与 `detailKey` 在目标 workspace 状态中可用

#### Scenario: Keep lower-level node opening free of route-switching semantics
- **WHEN** document workspace store 在内部执行节点打开操作
- **THEN** 该底层节点打开能力 MUST 继续在不拥有路由切换职责的前提下工作
- **AND** 更高层的 knowledge workspace 导航桥接 MUST 继续负责路由恢复
