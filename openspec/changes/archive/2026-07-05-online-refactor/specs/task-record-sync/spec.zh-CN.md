[English](spec.md) | 中文

## ADDED Requirements

### Requirement: 任务 MUST 以记录形态持久化在 hub 数据库
系统 SHALL 将任务按 `syncKey` + 任务 id 逐条存入 hub SQLite,取代 `tasks.json` 作为真身。任务真身 MUST NOT 位于 Dropbox 同步的 knowledge root 内。

#### Scenario: 任务写入落在 hub 数据库
- **WHEN** 客户端新建或更新任务并同步
- **THEN** hub MUST 将该任务作为记录持久化,并赋予单调递增的服务端游标
- **AND** hub MUST NOT 将任务真身写入 `<knowledgeRoot>/.chatprism/tasks.json`

### Requirement: 客户端 MUST 持有离线任务副本
每个客户端 SHALL 维护本地任务副本(IndexedDB),所有任务读写(含离线时)均由副本承接。本地写入 MUST 标记 dirty 并在联网后推送;启动时 MUST 补推未同步的本地任务。

#### Scenario: 离线编辑任务在重连后存活
- **WHEN** hub 不可达时客户端编辑任务
- **THEN** 编辑 MUST 立即落在本地副本并标记 dirty
- **AND** 下一次成功同步 MUST 将该 dirty 任务推送到 hub

#### Scenario: 任务视图从副本读取
- **WHEN** 任一任务视图(今天、计划中、按文档)渲染
- **THEN** 任务数据 MUST 来自本地副本,而非逐请求 HTTP 调用

### Requirement: 任务冲突 MUST 按单任务 last-write-wins 解决
不同客户端对同一任务的并发编辑 SHALL 按任务 id 比较 `updatedAt`,较新记录整体胜出。不同任务之间 MUST 互不冲突。

#### Scenario: 两个客户端编辑同一任务
- **WHEN** 两个客户端推送同一任务 id 的不同版本
- **THEN** hub MUST 保留 `updatedAt` 较大的版本
- **AND** 所有客户端后续 pull MUST 收敛到该版本

### Requirement: 任务载荷 MUST 通过白名单 normalizer
hub SHALL 在持久化前用显式字段白名单规范化每个入站任务。任何新增持久化字段 MUST 加入 normalizer,否则 MUST NOT 在往返后存活。

#### Scenario: 未知字段被剥除
- **WHEN** 客户端推送含白名单外字段的任务
- **THEN** hub MUST 只持久化白名单字段
- **AND** pull 结果 MUST NOT 含被剥除的字段

### Requirement: 既有 tasks.json MUST 一次性迁移
hub 启动时,若迁移标记未置,系统 SHALL 将 `<knowledgeRoot>/.chatprism/tasks.json` 的全部任务一次性导入 hub 数据库并置标记。遗留文件降为只读遗留数据。

#### Scenario: 首次启动一次性导入
- **WHEN** hub 启动且任务迁移标记未置、tasks.json 可读
- **THEN** 全部任务 MUST 导入 hub 数据库
- **AND** 迁移标记 MUST 置位,后续启动跳过导入

### Requirement: Google Calendar 同步 MUST 在 hub 执行
日历同步副作用 SHALL 在 hub 接受任务变更时执行,使用 hub 配置的凭据。客户端 MUST NOT 直接调用日历 API。

#### Scenario: 含重复规则的任务由 hub 同步至日历
- **WHEN** hub 接受一条需要日历同步的任务推送
- **THEN** hub MUST 用自身凭据调用日历同步服务
- **AND** 结果 MUST NOT 依赖任务由哪个客户端推送
