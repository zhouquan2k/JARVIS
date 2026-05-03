## ADDED Requirements

### Requirement: 本地化文案 MUST 覆盖杂项工作区控件
Markdown 搜索、会话重命名、dirty 保存状态和功能性消息详情的共享 UI 文案 MUST 在每个受支持 locale 中通过 translation keys 渲染。

#### Scenario: 通过翻译渲染 Markdown 搜索文案
- **WHEN** Markdown 搜索控件可见
- **THEN** placeholder、命中计数、上/下一个标签和关闭标签 MUST 来自翻译项

#### Scenario: 通过翻译渲染会话重命名和功能详情文案
- **WHEN** 会话重命名控件或功能性消息详情控件可见
- **THEN** 它们面向用户的 label、tooltip 和空/状态文本 MUST 来自翻译项

#### Scenario: 通过翻译渲染 dirty 保存文案
- **WHEN** 保存按钮表达存在未保存修改
- **THEN** 无障碍标签或 tooltip MUST 来自翻译项
