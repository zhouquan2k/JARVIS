## ADDED Requirements

### Requirement: Conversation workspace MUST open externally requested Agent conversations in detail mode
对话工作区 MUST 允许右侧 Agent 对话界面响应一次来自工作区导航的外部“打开本地对话”请求。当该请求有效时，界面 MUST 选中目标对话，并在当前正显示 Agent 对话列表的情况下也切换到该对话的详情视图。

#### Scenario: Open a requested conversation while the panel is in list mode
- **WHEN** 右侧 Agent pane 当前正显示 Agent 对话列表
- **AND** 工作区发出一个有效的请求，要求打开当前 Agent 作用域中的某条本地对话
- **THEN** 对话工作区 MUST 选中该目标对话
- **AND** 右侧界面 MUST 切换到该目标对话的详情视图

#### Scenario: Replace the current detail conversation with the requested target
- **WHEN** 右侧 Agent pane 当前已经在显示另一条对话的详情
- **AND** 工作区发出一个有效的请求，要求打开当前 Agent 作用域中的另一条本地对话
- **THEN** 对话工作区 MUST 将活动对话切换到该目标对话
- **AND** 右侧界面 MUST 继续保持在详情态，并展示新的目标对话

#### Scenario: Ignore invalid requests without destabilizing the panel
- **WHEN** 工作区发出的请求所指向的对话不存在、已删除，或不属于当前 Agent 作用域
- **THEN** 对话工作区 MUST 保持当前面板选中状态不变
- **AND** 右侧界面 MUST 保持当前列表态或详情态稳定，不得出现异常跳转
