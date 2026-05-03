## ADDED Requirements

### Requirement: 知识工作区 MUST 暴露 viewer 层搜索接口并实现 Markdown 搜索
知识工作区 MUST 通过 viewer 层接口暴露搜索能力，使未来其他文档 viewer 可以实现 scoped search。本次变更中，只有 Markdown viewer MUST 实现文档内关键字搜索。当活动 viewer 支持搜索时，搜索 MUST 可通过 `Ctrl+F` 或 `Cmd+F` 打开，MUST 在活动 viewer 内高亮命中项，并且 MUST 支持上一个/下一个命中跳转。

#### Scenario: 通过快捷键打开 Markdown 文档搜索
- **WHEN** Markdown 文档处于激活状态且用户按下 `Ctrl+F` 或 `Cmd+F`
- **THEN** 系统 MUST 在文档 pane 中打开 Markdown 搜索控件
- **AND** 系统 MUST 将搜索行为限定在当前激活的 Markdown 文档内

#### Scenario: 高亮并导航命中项
- **WHEN** 用户输入非空搜索词且当前 Markdown 文档存在命中
- **THEN** 系统 MUST 在 viewer 中高亮命中项
- **AND** 用户 MUST 能跳转到上一个和下一个命中项

#### Scenario: 非 Markdown 文档保留浏览器搜索行为
- **WHEN** 当前活动 viewer 未实现 viewer 搜索接口
- **THEN** 系统 MUST NOT 为文档 viewer 搜索拦截浏览器查找快捷键

#### Scenario: 未来 viewer 可通过同一接口实现搜索
- **WHEN** 未来某个非 Markdown viewer 实现 viewer 搜索接口
- **THEN** 文档 pane MUST 能通过该接口驱动搜索词更新、命中数量读取和上/下一个跳转
- **AND** 未来 viewer MUST 自己负责高亮和滚动行为

### Requirement: 知识工作区保存按钮 MUST 反映活动文档 dirty 状态
知识工作区文档保存按钮 MUST 使用活动文档的 canonical dirty 状态，为可写文本文件区分 clean、dirty 和 saving 视觉状态。

#### Scenario: 显示 dirty 保存状态
- **WHEN** 当前可写文本文件存在未保存本地修改
- **THEN** 保存按钮 MUST 渲染 dirty 视觉状态
- **AND** 其无障碍标签或 tooltip MUST 表达存在未保存修改

#### Scenario: 显示 saving 状态
- **WHEN** 当前文档保存操作正在执行
- **THEN** 保存按钮 MUST 渲染 saving 视觉状态
- **AND** 保存完成前按钮 MUST 保持禁用

### Requirement: 知识工作区 MUST 在存在时显示 Agent 文件夹 index 文档
选择 Agent owner 目录时，知识工作区 MUST 将该目录下已有的 `index.md` 作为主文档打开，同时保留所选目录作为活动 Agent scope。系统 MUST NOT 自动创建 `index.md`。

#### Scenario: 为 Agent owner 目录显示 index 文档
- **WHEN** 用户选择包含 `index.md` 的 Agent owner 目录
- **THEN** 系统 MUST 在主文档 pane 中打开该 `index.md`
- **AND** 活动 Agent 上下文 MUST 继续从所选目录解析

#### Scenario: 缺少 index 文档时保留 Agent view
- **WHEN** 用户选择不包含 `index.md` 的 Agent owner 目录
- **THEN** 系统 MUST 在主 pane 中继续显示 `AgentView`
- **AND** 系统 MUST NOT 创建新的 `index.md`

### Requirement: 知识工作区 MUST 为 `@文件名` 引用提供文件解析来源
知识工作区 MUST 允许聊天发送链路基于当前对话实际生效的 Agent context 解析 `@文件名` 引用。若会话已绑定 Agent，则解析 MUST 使用该 Agent 的 scope；若未绑定，则 MUST 使用默认活动 Agent 的 scope。解析 MUST 优先使用 basename 精确匹配；当 basename 在该 Agent scope 内不唯一时，系统 MAY 接受唯一路径后缀匹配。只有可安全读取为文本的文档 MAY 被作为 prompt 段落注入。

#### Scenario: 从当前 Agent context 解析唯一 basename
- **WHEN** 聊天输入包含 `@guide.md` 且当前 Agent context 中只有一个同名文件
- **THEN** 系统 MUST 将该引用解析到该唯一文件

#### Scenario: basename 冲突时允许唯一路径后缀匹配
- **WHEN** 当前 Agent context 内多个文件共享同一 basename 且用户输入的引用能唯一匹配某个路径后缀
- **THEN** 系统 MUST 将该引用解析到该唯一路径

#### Scenario: 非文本文件不能作为 prompt 段落注入
- **WHEN** `@文件名` 解析到非文本类文档
- **THEN** 系统 MUST 阻止该次段落注入
- **AND** 系统 MUST 返回明确错误，而不是把二进制内容拼进 prompt
