## ADDED Requirements

### Requirement: Knowledge workspace MUST expose a document import entry alongside document creation
knowledge workspace 的文档树 MUST 在现有“新建文档”入口旁边暴露一个“导入文档”入口，使用户可以从当前 workspace 上下文启动一个插件驱动的导入流程。

#### Scenario: Open the import wizard from the document tree
- **WHEN** 用户点击文档树工具栏中的“导入文档”入口
- **THEN** workspace MUST 打开文档导入向导
- **AND** 当存在当前选中目录时，向导 MUST 默认将其作为目标目录

#### Scenario: Change the target directory before import
- **WHEN** 用户在向导中配置导入参数
- **THEN** workspace MUST 允许用户在执行前切换目标目录
- **AND** 所选目标目录 MUST 作为参数传给被调用的导入 contribution

### Requirement: Knowledge workspace MUST organize transcript and summary outputs according to import result shape
当一次文档导入只产出文字稿时，workspace MUST 在所选目标目录中创建一个普通 Markdown 文档；当一次导入同时产出文字稿和总结稿时，workspace MUST 将总结稿视为主文档，并且 MUST 将文字稿写入该主文档的 `references/` 目录下，作为被引用资源。

#### Scenario: Persist transcript-only output as a normal document
- **WHEN** 一次完成的导入只返回文字稿内容而没有总结稿内容
- **THEN** workspace MUST 在所选目标目录中把文字稿创建为普通 Markdown 文档
- **AND** 成功后系统 MUST 打开该文字稿文档作为主文档

#### Scenario: Persist transcript-plus-summary output with transcript as a reference resource
- **WHEN** 一次完成的导入同时返回文字稿和总结稿内容
- **THEN** workspace MUST 在所选目标目录中创建总结稿主文档
- **AND** workspace MUST 将文字稿写入该总结稿文档的 `references/` 目录下，作为引用资源
- **AND** 总结稿文档 MUST 链接到该文字稿资源

### Requirement: Knowledge workspace MUST keep failed imports from leaving user-visible success state
当一次导入在完成前失败时，knowledge workspace MUST 将向导保持在失败状态、向用户呈现错误，并且 MUST NOT 把该次导入呈现为成功。

#### Scenario: Report transcript-fetch failure without success navigation
- **WHEN** 一次 B 站导入在抓取文字稿数据阶段失败
- **THEN** workspace MUST 对该失败导入展示错误消息
- **AND** workspace MUST NOT 把向导按成功路径关闭，也 MUST NOT 打开主文档

#### Scenario: Report summary-generation failure without partial-success messaging
- **WHEN** 一次启用总结稿的导入在生成总结内容阶段失败
- **THEN** workspace MUST 对失败阶段展示错误消息
- **AND** workspace MUST NOT 为该次导入展示成功提示
