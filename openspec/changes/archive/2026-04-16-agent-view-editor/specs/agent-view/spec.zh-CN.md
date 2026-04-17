## ADDED Requirements

### Requirement: Agent view MUST provide editable owner agent configuration
系统 MUST 允许用户在 `AgentView` 中编辑当前选中 owner directory 的直接 Agent 配置。可编辑字段 MUST 包含目标模型 Provider、目标模型名称、描述、系统提示词 instructions、tools 以及继承模式。编辑器 MUST 将这些字段持久化到该 owner directory 的 `.agent.json`，并在保存成功后刷新已解析的工作区上下文。

#### Scenario: Edit the owner agent description
- **WHEN** 用户在 `AgentView` 中修改描述并保存
- **THEN** 系统 MUST 将新描述写入当前选中 owner directory 的 `.agent.json`
- **AND** 刷新后的 Agent 元数据 MUST 通过已解析 Agent 配置暴露新描述

#### Scenario: Edit the owner agent system prompt
- **WHEN** 用户在 `AgentView` 中修改系统提示词并保存
- **THEN** 系统 MUST 将新提示词写入当前选中 owner directory 的 `.agent.json`
- **AND** 刷新后的 Agent 元数据 MUST 通过已解析 Agent 配置暴露新提示词

#### Scenario: Edit the owner agent model selection
- **WHEN** 用户在 `AgentView` 中选择模型 Provider 和模型并保存
- **THEN** 系统 MUST 将 `modelProviderName` 和 `modelName` 写入当前选中 owner directory 的 `.agent.json`
- **AND** 后续该 owner Agent 的 Agent 请求 MUST 在可用时使用已保存的模型选择

#### Scenario: Edit the owner agent inheritance mode
- **WHEN** 用户在 `AgentView` 中修改继承模式并保存
- **THEN** 系统 MUST 将对应继承行为写入当前选中 owner directory 的 `.agent.json`
- **AND** 刷新后的 Agent 元数据 MUST 反映该继承模式下解析得到的提示词与模型行为

#### Scenario: Display the current resolved tools by default
- **WHEN** `AgentView` 为某个 owner directory 渲染 tools 选择器时
- **THEN** 系统 MUST 以当前 resolved 的 `agent.tools` 初始化已选工具
- **AND** 渲染出来的 tools 列表 MUST 与该 owner Agent 当前解析后的工具集合一致

#### Scenario: Inherit parent tools in read-only mode
- **WHEN** 用户在 `AgentView` 中开启 tools 继承开关
- **THEN** 系统 MUST 以只读模式显示当前 resolved tools 集合
- **AND** 保存时 MUST 从该 owner directory 的 `.agent.json` 中删除 `tools`，让该 owner 完全继承父级/默认工具集

#### Scenario: Save explicit tool selection
- **WHEN** 用户关闭 tools 继承开关、修改所选工具并保存
- **THEN** 系统 MUST 将所选工具写入该 owner directory 的 `.agent.json`
- **AND** 后续该 owner Agent 的 Agent 请求 MUST 在可用时暴露已保存的工具选择

#### Scenario: Edit the root default agent
- **WHEN** 用户选中 workspace 根节点
- **THEN** 系统 MUST 为默认 Agent 显示 `AgentView`
- **AND** 保存编辑 MUST 写入 `/.agent.json`，当该文件缺失时创建它，使根默认 Agent 始终持久化在该文件中
- **AND** 这个根节点 bootstrap 行为 MUST NOT 应用于任意非 owner directory

#### Scenario: Preserve unsupported agent config fields during save
- **WHEN** 用户从 `AgentView` 保存变更
- **THEN** 系统 MUST 保留 `.agent.json` 中该视图未编辑的既有字段，包括 `name`、`skills`、`linkDir` 和未知字段
- **AND** 系统 MUST NOT 将 Agent 配置重写为只有可见表单字段

#### Scenario: Load model choices through the existing provider catalog
- **WHEN** `AgentView` 渲染模型选择控件
- **THEN** 系统 MUST 使用工作区 UI 已有的 Provider 和模型目录
- **AND** 系统 MUST NOT 为 Agent 配置编辑引入第二套模型 Provider runtime 路径

#### Scenario: Load tool choices through the existing builtin tool catalog
- **WHEN** `AgentView` 渲染 tools 选择控件
- **THEN** 系统 MUST 使用共享工作区运行时已经暴露的内置 tools catalog
- **AND** 系统 MUST NOT 为 Agent 配置编辑引入第二套工具定义来源

### Requirement: Knowledge workspace MUST preserve node navigation history
系统 MUST 在共享 document workspace 中记住用户主动选择过的知识库节点，并提供顶部前进/后退控件，用于重新访问历史节点。

#### Scenario: Navigate backward and forward between visited nodes
- **WHEN** 用户从文件树打开多个知识库节点
- **THEN** workspace MUST 在至少访问过两个不同节点后启用后退控件
- **AND** 点击后退控件 MUST 重新打开上一个访问节点
- **AND** 在后退后点击前进控件 MUST 重新打开下一个访问节点

#### Scenario: Opening a new node truncates forward history
- **WHEN** 用户在节点历史中后退后，又从文件树打开另一个不同节点
- **THEN** workspace MUST 将新打开的节点追加到当前历史项之后
- **AND** workspace MUST 丢弃此前可用的前进历史

#### Scenario: Internal restores do not pollute history
- **WHEN** workspace 恢复已保存 selection state，或作为前进/后退历史导航的一部分打开节点
- **THEN** workspace MUST NOT 为该内部导航增加重复历史记录

### Requirement: Chat message rendering MUST respect user scroll position
普通聊天视图 MUST 在 assistant 内容异步追加时尊重用户滚动位置；如果用户已经上滚，不得强制将消息列表拉到底部。

#### Scenario: User scrolls upward during asynchronous assistant rendering
- **WHEN** 用户不再位于消息列表底部附近，而 assistant 消息内容继续追加
- **THEN** chat view MUST 保持用户当前滚动位置
- **AND** chat view MUST NOT 自动滚动到最新追加内容

#### Scenario: Conversation selection starts at the beginning
- **WHEN** 当前显示的 conversation 发生变化
- **THEN** chat view MAY 默认将消息列表定位在 conversation 顶部
- **AND** preview mode MUST 继续从顶部开始

## REMOVED Requirements

### Requirement: Agent view MUST list owner documents
**Reason**: owner directory 文档已经属于左侧文件树。在中间栏 `AgentView` 保留第二份文档列表会造成导航重复，并与 Agent 编辑器争夺空间。

**Migration**: directory 文档继续通过现有左侧文件树提供。`AgentView` 改为紧凑 owner overview，并将编辑器放入顶部可展开区域。

### Requirement: Agent view MUST list local conversations by agent key
**Reason**: Agent 作用域 conversation list 与 detail 行为已经属于右侧 `AgentPane`；在中间栏 `AgentView` 保留另一份 conversation list 会造成状态和导航重复。

**Migration**: 当选中 directory 是 Agent owner 时，directory 级 Agent conversations 仍通过现有右侧 `AgentPane` 提供。`AgentView` 改为负责 owner Agent 配置编辑。
