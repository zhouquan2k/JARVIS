## ADDED Requirements

### Requirement: 本地历史侧边栏 MUST 支持本地会话重命名
对话工作区 MUST 允许用户在共享侧边栏中重命名本地会话历史项。重命名操作 MUST 通过已配置的会话持久化 provider 保存，并且 MUST NOT 对外部历史预览行开放。

#### Scenario: 从侧边栏重命名本地会话
- **WHEN** 用户编辑本地会话标题并提交重命名
- **THEN** 系统 MUST 将 trim 后的标题持久化到该本地会话
- **AND** 本地历史列表 MUST 显示更新后的标题

#### Scenario: 重命名当前激活的本地会话
- **WHEN** 用户重命名当前激活的本地会话
- **THEN** 系统 MUST 同时更新持久化会话和当前活动会话状态
- **AND** 刷新后当前聊天标题或工具栏标题 MUST 使用更新后的标题

#### Scenario: 不重命名外部历史行
- **WHEN** 侧边栏显示外部历史结果
- **THEN** 系统 MUST NOT 为这些行暴露本地会话重命名操作

### Requirement: 普通聊天视图 MUST 渲染共享的可折叠功能性消息块
对话工作区 MUST 在共享普通聊天表面渲染结构化功能性消息块。功能性消息块 MUST 默认折叠，并且 MUST 适用于所有由 `NormalChatView` 渲染 assistant 消息的场景，包括普通聊天、Agent pane 聊天、预览或导入会话。

#### Scenario: 默认折叠渲染功能性消息块
- **WHEN** assistant 消息包含一个或多个 `functionalParts`
- **THEN** `NormalChatView` MUST 为该消息渲染功能详情区域
- **AND** 每个功能性消息块 MUST 默认折叠

#### Scenario: 展开功能性消息详情
- **WHEN** 用户激活某个功能性消息块标题
- **THEN** 系统 MUST 展开该块并显示详情内容，且不改变 assistant 正文

#### Scenario: 没有功能性消息块时保持原样
- **WHEN** assistant 消息没有 `functionalParts`
- **THEN** 系统 MUST 渲染该消息且不显示空的功能详情区域

### Requirement: 对话工作区 MUST 支持通过 `@文件名` 显式引入文件上下文
对话工作区 MUST 支持用户在输入中通过 `@文件名` 显式引用工作区文件，并在发送时把这些文件作为额外上下文加入请求。该能力 MUST NOT 改写用户问题正文中的 `@文件名` 文本；被引用文件内容 MUST 以带文件名标记的独立段落注入请求文本。文件解析 MUST 使用当前对话实际生效的 Agent context，而不是整棵 workspace 树。

#### Scenario: 保持现有首轮当前文档逻辑
- **WHEN** 用户发送会话首条消息
- **THEN** 系统 MUST 保持既有的当前选中文档自动加入逻辑不变
- **AND** 本次 `@文件名` 能力 MUST 作为额外上下文机制工作，而不是替代该首轮行为

#### Scenario: 为任意轮次的 `@文件名` 注入独立上下文段落
- **WHEN** 用户发送的消息中包含一个或多个 `@文件名`
- **THEN** 系统 MUST 为每个成功解析的文件追加独立上下文段落
- **AND** 每个段落 MUST 显式标出对应文件名
- **AND** 用户原始问题正文中的 `@文件名` MUST 保留

#### Scenario: 未绑定 Agent 的会话从默认 Agent context 解析引用
- **WHEN** 会话没有显式绑定到某个 Agent
- **THEN** `@文件名` 解析 MUST 使用当前默认活动 Agent 的 scope
- **AND** 该 scope 之外的文件 MUST NOT 参与 basename 歧义判断

#### Scenario: 重复引用同一文件时只注入一次
- **WHEN** 用户在同一条消息中多次引用解析到同一路径的文件
- **THEN** 系统 MUST 只注入一次该文件内容

#### Scenario: 未命中或歧义命中时阻止发送
- **WHEN** 某个 `@文件名` 没有匹配到当前 Agent context 内的唯一文件
- **THEN** 系统 MUST 阻止该次发送
- **AND** 系统 MUST 向用户显示明确的缺失或歧义错误，而不是静默猜测
