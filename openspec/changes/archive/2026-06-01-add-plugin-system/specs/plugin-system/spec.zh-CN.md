中文 | [English](spec.md)

## ADDED Requirements

### Requirement: Frontend hosts MUST activate only enabled builtin plugins
每个前端宿主 MUST 组合一份静态内置插件列表，读取全局插件启用配置，并且只激活当前宿主中被启用的插件。被禁用的插件 MUST NOT 向运行中的应用外壳贡献全局视图、右侧 panel tab 或文档创建流程。

#### Scenario: Activate only configured plugins at host startup
- **WHEN** 宿主启动时同时拥有内置插件列表与 `enabledPluginIds`
- **THEN** 系统 MUST 只对最终判定为启用的插件调用 `setup()`
- **AND** 不在启用集内的插件贡献 MUST NOT 出现在宿主的 contribution query 中

#### Scenario: Fall back to plugin defaults only when config is absent for a plugin
- **WHEN** 某个内置插件没有被显式写入 `enabledPluginIds`
- **THEN** 系统 MAY 使用该插件 manifest 的 `defaultEnabled` 作为回退值
- **AND** 显式配置白名单 MUST 优先于 `defaultEnabled`

### Requirement: Plugin activation MUST be isolated per plugin
插件系统 MUST 隔离每个插件的激活失败，确保单个损坏插件不会阻止前端宿主外壳加载。若某插件在激活期间抛错，系统 MUST 记录错误、移除该插件已部分注册的贡献，并继续激活其余已启用插件。

#### Scenario: Continue host startup after one plugin fails
- **WHEN** 某个已启用插件在执行 `setup()` 时抛错
- **THEN** 宿主外壳 MUST 继续激活剩余已启用插件
- **AND** 失败插件留下的贡献 MUST NOT 继续保留在注册表中

#### Scenario: Successful plugins remain available after a neighbor fails
- **WHEN** 一个插件激活失败，另一个已启用插件激活成功
- **THEN** 成功插件的贡献 MUST 继续可被宿主 UI 查询
- **AND** 失败插件 MUST NOT 出现在已启用插件集合中

### Requirement: Core contracts MUST define the initial plugin contribution model
共享核心契约 MUST 定义一组与前端运行时无关的最小插件契约，并且在本期支持当前真实需要的具名扩展点：全局视图、右侧 panel tab、workspace 选择视图、插入链接类型、文档创建流程、节点展示。

#### Scenario: Export plugin contracts from core without runtime host coupling
- **WHEN** 共享包或宿主导入插件契约
- **THEN** 系统 MUST 从 `packages/core` 提供 `PluginManifest`、`PluginEnablementConfig`、`PluginSetupApi` 与 `ContributionQuery`
- **AND** 这些契约 MUST NOT 依赖导入插件系统运行时实现

#### Scenario: Register only the concrete contribution types defined for this phase
- **WHEN** 某个插件在本期拿到 setup API
- **THEN** setup API MUST 提供全局视图、右侧 panel tab、workspace 选择视图、插入链接类型、文档创建流程、节点展示这几类注册方法
- **AND** 本次变更 MUST NOT 先引入一个泛化的 token 式扩展注册中心

### Requirement: Plugin contributions MUST be queryable through a read-only registry contract
插件系统 MUST 在运行时聚合已启用插件的贡献，并通过只读 contribution query 契约向共享 UI 暴露这些数据。该查询接口 MUST 返回每个扩展点上的全部已注册贡献，并且 MUST 保持确定性顺序。

#### Scenario: Query global views and right-panel tabs without mutable runtime access
- **WHEN** 共享 UI 读取注入的 contribution query
- **THEN** 系统 MUST 通过只读 getter 返回当前已注册的全局视图与右侧 panel tab
- **AND** UI MUST NOT 需要直接访问插件激活或注册方法

#### Scenario: Keep contribution ordering deterministic
- **WHEN** 多个已启用插件向同一扩展点贡献内容
- **THEN** 系统 MUST 以确定性的顺序返回这些贡献
- **AND** 带有 `order` 字段的贡献类型 MUST 优先按该字段排序，再回退到注册顺序

#### Scenario: Query workspace-core extension points without mutable runtime access
- **WHEN** 共享 UI 需要读取 workspace 选择视图、插入链接类型或节点展示这类扩展点
- **THEN** 系统 MUST 通过 `ContributionQuery` 上的只读 getter 返回这些贡献
- **AND** UI MUST NOT 需要直接访问插件激活或注册方法

### Requirement: Contribution identifiers MUST remain unique and removable per plugin
每条已注册贡献在其扩展点范围内 MUST 具备唯一标识，以保证宿主渲染 key 与路由路径稳定。插件系统 MUST 拒绝或回滚重复 ID 的注册，并且 MUST 能按插件归属移除该插件的全部贡献。

#### Scenario: Reject duplicate contribution identifiers
- **WHEN** 同一扩展点下有两个贡献注册了相同标识
- **THEN** 系统 MUST 将其视为违规插件的一次注册失败
- **AND** 该插件此前已注册的贡献 MUST 被一并移除

#### Scenario: Remove contributions by plugin ownership
- **WHEN** 插件系统停用某插件，或回滚一次失败激活
- **THEN** 系统 MUST 移除该插件拥有的全部全局视图、右侧 panel tab、workspace 选择视图、插入链接类型、文档创建流程与节点展示贡献
- **AND** 其他插件的贡献 MUST 保持不变

### Requirement: Host UI surfaces MUST be assembled from plugin contributions
前端宿主外壳 MUST 通过插件贡献装配顶层全局视图与 Workspace 右侧 panel tab，而不是继续依赖硬编码功能导入。当 AI 插件与任务插件被启用时，宿主 MUST 通过这些贡献暴露当前聊天/任务表面；当其中任一插件被禁用时，对应表面 MUST 消失，且 Markdown 文档工作区核心不能受损。

#### Scenario: Render enabled plugin views through contribution-driven assembly
- **WHEN** AI 插件和任务插件都处于启用状态
- **THEN** 宿主 MUST 在顶层工作区外壳中暴露它们注册的全局视图
- **AND** Workspace 右侧 panel MUST 通过插件贡献渲染对话 tab 与任务 tab

#### Scenario: Keep document workspace core available when optional plugins are disabled
- **WHEN** 一个或多个可选插件被禁用
- **THEN** Markdown 文档工作区核心 MUST 继续可用
- **AND** 宿主装配中缺失的 MUST 只是被禁用插件注册的表面

### Requirement: Workspace-core UI MUST consume the additional named extension points through ContributionQuery
共享的 workspace-core UI MAY 继续作为文档中心工作流的渲染宿主，但它 MUST 仅通过 `ContributionQuery` 消费插件提供的 workspace 选择视图、插入链接类型与节点展示扩展点。

#### Scenario: Render workspace selection views through plugin contributions
- **WHEN** `DocumentWorkspaceView` 需要解析当前 workspace 选择态对应的伴随视图
- **THEN** 它 MUST 通过 `ContributionQuery` 从插件注册的 workspace 选择视图中进行选择
- **AND** 共享 workspace 外壳 MUST NOT 硬编码 AI 专属的选择面板

#### Scenario: Extend Markdown link insertion through plugin contributions
- **WHEN** `DocumentWorkspaceView` 或其编辑器表面准备插入链接选项
- **THEN** 它 MUST 通过 `ContributionQuery` 收集所有支持当前上下文的插件插入链接类型
- **AND** 共享 workspace 外壳 MUST NOT 硬编码插件专属的链接来源

#### Scenario: Decorate file-tree nodes through plugin contributions
- **WHEN** `DocumentFileTree` 需要为某个节点解析视觉增强信息
- **THEN** 它 MUST 通过 `ContributionQuery` 查询插件注册的节点展示贡献
- **AND** 当没有插件贡献命中时，共享 workspace 外壳 MUST 保持节点渲染稳定

### Requirement: Hosts MUST 通过插件激活边界接入可选 AI 能力
前端宿主 MAY 知道内置插件 manifest、启用规则与插件加载机制，但 MUST NOT 再把直接硬编码 import 可选 AI 功能实现当作主要装配方式。可选 AI 能力 MUST 通过插件激活结果、注册贡献或插件拥有的服务边界进入宿主。

#### Scenario: 通过插件激活结果装配可选 AI 表面
- **WHEN** 宿主启用了 AI 插件
- **THEN** 宿主 MUST 通过插件激活结果暴露 AI 拥有的功能表面，而不是把具体 AI runtime / provider 实现视为宿主内建功能
- **AND** 禁用 AI 插件时，系统 MUST 能移除这些可选表面，而不要求重写宿主外壳逻辑

#### Scenario: 将插件加载保持为宿主拥有的集成边界
- **WHEN** 宿主在启动时组合内置插件
- **THEN** 宿主 MAY 静态声明内置插件列表
- **AND** 宿主 MUST 把插件加载与注册作为可选能力的正式集成边界

### Requirement: Optional feature implementations MUST be owned by their plugins
可选前端能力的插件边界 MUST 同时覆盖注册点与具体功能实现归属。共享 UI 包 MAY 承载 workspace-core 外壳与可复用基础组件，但在抽离完成后，MUST NOT 继续长期持有 AI 专属或任务专属的功能表面实现。

#### Scenario: AI 插件拥有其贡献的聊天与对话功能表面
- **WHEN** AI 插件贡献一个全局聊天表面或一个 Workspace 右侧 panel 对话 tab
- **THEN** 该贡献对应的实现 MUST 定义在 AI 插件包下，而不是反向从共享 `packages/ui` 的 feature 组件导入
- **AND** 对话 / 历史 / compare 等 AI 专属 UI MUST 被视为 AI 插件拥有的代码

#### Scenario: 任务插件拥有其贡献的任务功能表面
- **WHEN** 任务插件贡献一个 all-tasks 全局表面或一个 Workspace 右侧 panel 任务 tab
- **THEN** 该贡献对应的实现 MUST 定义在任务插件包下，而不是反向从共享 `packages/ui` 的 feature 组件导入
- **AND** 任务列表 / 编辑器等任务专属 UI MUST 被视为任务插件拥有的代码

#### Scenario: 共享 workspace 外壳保持 feature-agnostic
- **WHEN** `packages/ui` 渲染工作区宿主外壳，例如 host app 或 Workspace 右侧 panel
- **THEN** 这些外壳 MUST 仅消费 `ContributionQuery`，而不能内嵌 AI/task 的内建 fallback 实现
- **AND** 禁用可选插件时，系统 MUST 仅移除对应表面，而不要求重写共享外壳逻辑

### Requirement: 宿主与 context 代码 MUST 依赖最小会话查询契约
凡是只需要会话查询能力的宿主侧或 context 侧工作区实现，MUST 依赖最小查询契约，而不是直接拥有宽泛的 AI 会话领域实现。被多个宿主复用这一事实本身，并不意味着 AI 会话领域属于 workspace core。

#### Scenario: 通过最小查询契约委托会话查询
- **WHEN** 某个面向 context 的工作区实现需要为文档或 scope 查询关联会话
- **THEN** 它 MUST 依赖类似 `IConversationQueryProvider` 这样的最小查询契约
- **AND** 它 MUST NOT 为了完成查询而同时承担无关的 AI runtime / provider / storage 所有权

#### Scenario: 在 AI 契约迁入 AI 插件后保持 workspace-core 稳定
- **WHEN** AI 会话领域契约从 `packages/core` 迁入 AI 插件拥有的共享契约层
- **THEN** 只依赖最小查询契约的宿主侧与 context 侧代码 SHOULD 保持大体稳定
- **AND** 这次抽离 MUST NOT 迫使这些 workspace-core 组件变成更宽 AI 功能实现的所有者

### Requirement: The plugin system MUST reserve a document-creation-flow extension point
插件系统 MUST 支持插件贡献文档创建流程，作为围绕核心 Markdown 文档创建过程的受控扩展点。这些流程 MUST 仍由宿主中介，并在成功时返回新建文档路径。

#### Scenario: Register a custom document-creation flow
- **WHEN** 某个插件注册了一条文档创建流程贡献
- **THEN** 系统 MUST 通过 contribution query 暴露该流程
- **AND** 该贡献 MUST 提供标题与异步执行入口

#### Scenario: Return the created document path from a successful flow
- **WHEN** 宿主调用一个已注册的文档创建流程且流程成功
- **THEN** 该流程 MUST 返回新建文档路径
- **AND** 插件系统 MUST 保持核心文档工作区对后续文档打开与编辑流程的主导权
