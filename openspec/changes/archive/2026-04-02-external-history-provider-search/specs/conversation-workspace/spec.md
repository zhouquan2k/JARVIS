## MODIFIED Requirements

### Requirement: External workspace MUST provide secondary provider selection
系统 MUST 在“外部”来源视图中提供二级 provider 选择，至少包含 `ChatGPT`、`Gemini` 与 `外部文件导入` 三个入口。对于声明支持历史搜索的 provider，工作台 MUST 在左侧外部历史区域提供一份共享搜索框；该搜索框的关键词状态 MUST 在 `chatgpt-web` 与 `gemini-web` 之间共享，并在切换 provider 时沿用当前关键词重新加载新 provider 的结果。对于不支持搜索的 provider，工作台 MUST 隐藏该搜索框。

#### Scenario: Switch external provider within external workspace
- **WHEN** 用户已切换到“外部”来源并选择 `ChatGPT` 或 `Gemini`
- **THEN** 系统 MUST 在不离开当前 workspace 的前提下刷新左侧外部历史列表
- **AND** 右侧预览行为 MUST 继续复用统一的普通聊天预览视图

#### Scenario: Reuse the shared query when switching searchable providers
- **WHEN** 用户在 `chatgpt-web` 或 `gemini-web` 下已提交一个非空搜索关键词后切换到另一个支持搜索的 provider
- **THEN** 工作台 MUST 保留当前搜索框中的关键词
- **AND** 系统 MUST 使用该同一关键词对新 provider 重新加载结果列表

#### Scenario: Hide search box for non-searchable external providers
- **WHEN** 用户在“外部”来源下选择 `外部文件导入`
- **THEN** 系统 MUST 隐藏外部历史搜索框
- **AND** 系统 MUST 触发文件导入流程而不是请求远端历史列表
