## ADDED Requirements

### Requirement: Document import wizard MUST present registered import sources and source-defined configuration
系统 MUST 提供一个文档导入向导，列出所有已注册的 `DocumentImportContribution` 来源，并在向导流程中渲染所选来源自己的配置 UI。该向导 MUST 支持“选择来源 / 配置参数 / 执行与结果”三步流程。

#### Scenario: Open the wizard and list registered sources
- **WHEN** 用户从 knowledge workspace 打开文档导入向导
- **THEN** 系统 MUST 首先展示“选择来源”步骤
- **AND** 向导 MUST 列出当前所有已注册的文档导入来源及其可见标题

#### Scenario: Render the selected source configuration UI
- **WHEN** 用户选择一个已注册导入来源并进入配置步骤
- **THEN** 向导 MUST 渲染该来源 contribution 自己的配置 UI
- **AND** 在向导保持打开期间，系统 MUST 保留该来源的参数状态

### Requirement: Document import wizard MUST execute imports in observable stages and stop on failure
系统 MUST 以可观测的阶段执行所选导入 contribution，并向用户反馈成功或失败。当任一阶段失败时，向导 MUST 立即中止导入流程，并且 MUST NOT 报告成功。

#### Scenario: Complete a successful transcript-only import
- **WHEN** 用户发起一个“启用文字稿、禁用总结稿”的 B 站导入
- **THEN** 向导 MUST 展示包含“抓取文字稿 / 整理文字稿 / 写入文档”的阶段进度
- **AND** 成功后系统 MUST 关闭向导并打开新建的主文档

#### Scenario: Complete a successful transcript-plus-summary import
- **WHEN** 用户发起一个启用总结稿的 B 站导入
- **THEN** 向导 MUST 展示包含“抓取文字稿 / 整理文字稿 / 生成总结 / 写入文档”的阶段进度
- **AND** 成功后系统 MUST 关闭向导并打开生成的总结稿主文档

#### Scenario: Stop and report the failing stage
- **WHEN** 在导入过程中，抓取文字稿、生成总结或写入文档任一阶段失败
- **THEN** 向导 MUST 立即停止流程
- **AND** 系统 MUST 向用户报告失败所在阶段

### Requirement: Bilibili import MUST require transcript output and gate summary output on language-model availability
首个导入来源 B 站视频导入 MUST 始终生成文字稿内容，并且只有在系统存在至少一个共享 language-model contribution 时，MUST 允许启用总结稿生成。

#### Scenario: Keep transcript output mandatory
- **WHEN** 用户配置一个 B 站导入
- **THEN** 文字稿产出 MUST 始终保持启用
- **AND** 用户 MUST NOT 关闭文字稿生成

#### Scenario: Disable summary when no language model is available
- **WHEN** 系统中不存在任何已注册的 language-model contribution
- **THEN** B 站导入配置界面 MUST 将总结稿生成功能显示为不可用
- **AND** 用户 MUST NOT 发起启用总结稿的导入
