## MODIFIED Requirements

### Requirement: Core contracts MUST define the initial plugin contribution model
共享 core 契约 MUST 定义一个前端运行时无关的最小插件契约面，并覆盖当前阶段需要的具体 contribution 类型：global views、right-panel tabs、workspace-selection views、insert-link types、document imports、language-model contributions 和 node presentations。

#### Scenario: Export plugin contracts from core without runtime host coupling
- **WHEN** 共享包或宿主导入插件契约
- **THEN** 系统 MUST 从 `packages/core` 提供 `PluginManifest`、`PluginEnablementConfig`、`PluginSetupApi` 和 `ContributionQuery`
- **AND** 这些契约 MUST NOT 依赖导入 plugin-system 的运行时实现

#### Scenario: Register only the concrete contribution types defined for this phase
- **WHEN** 某个插件在当前阶段收到 setup API
- **THEN** setup API MUST 暴露 global views、right-panel tabs、workspace-selection views、insert-link types、document imports、language-model contributions 和 node presentations 的注册方法
- **AND** 系统 MUST NOT 因此要求一个通用 token-based extension registry

### Requirement: Contribution identifiers MUST remain unique and removable per plugin
每个已注册 contribution 在其扩展点内 MUST 具有唯一标识，以保持宿主渲染 key 和路由路径稳定。plugin system MUST 拒绝或回滚重复注册，并且 MUST 能够移除属于某个插件的所有 contribution。

#### Scenario: Reject duplicate contribution identifiers
- **WHEN** 同一个扩展点下两个 contribution 注册了相同 identifier
- **THEN** 系统 MUST 将其视为 offending plugin 的注册失败
- **AND** 该插件此前已注册的 contribution MUST 被移除

#### Scenario: Remove contributions by plugin ownership
- **WHEN** plugin system 停用某个插件，或回滚一个失败的激活过程
- **THEN** 系统 MUST 移除该插件拥有的所有 global views、right-panel tabs、workspace-selection views、insert-link types、document imports、language-model contributions 和 node presentations
- **AND** 其他插件的 contribution MUST 保持不受影响

## ADDED Requirements

### Requirement: The plugin system MUST expose document import contributions as a first-class extension point
plugin system MUST 将插件提供的 document import source 作为一等扩展点暴露出去，使共享 workspace UI 可以通过 host-owned orchestration 查询并调用这些导入来源。

#### Scenario: Query registered document import sources
- **WHEN** 共享 workspace UI 读取导入能力对应的 contribution query
- **THEN** 系统 MUST 通过只读 getter 返回所有已注册的 document import contributions
- **AND** UI MUST NOT 需要直接访问可变的插件注册 API

#### Scenario: Keep document import ownership in the plugin boundary
- **WHEN** 某个 document import source 被 workspace host 调用
- **THEN** 该插件 contribution MUST 拥有来源特定的导入逻辑
- **AND** 共享 workspace shell MUST 仅负责向导宿主和打开文档等生命周期能力

### Requirement: The plugin system MUST expose shared language-model contributions
plugin system MUST 允许插件注册通用 language-model 文本生成能力，并且 MUST 通过 `ContributionQuery` 向其他插件和共享 UI 暴露这些 contribution。

#### Scenario: Query language-model capability from another plugin
- **WHEN** 一个插件或共享 UI 读取 language-model 能力对应的 contribution query
- **THEN** 系统 MUST 通过只读 getter 返回当前已注册的 language-model contributions
- **AND** 调用方 MUST 能检测到“当前没有可用 language-model contribution”的情况

#### Scenario: Remove language-model capability with plugin deactivation
- **WHEN** 注册了 language-model contribution 的插件被禁用，或在 setup 期间失败
- **THEN** 该 language-model contribution MUST 从 contribution query 中消失
- **AND** 其他已启用插件的 contribution MUST 继续正常工作
