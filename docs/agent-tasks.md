# Agent 视图任务管理

## 原始需求

`agent-tasks` 需要在 Agent 视图中，为文档增加任务管理功能。任务管理显示在右侧 panel，因此右侧需要支持多 Tab Pane：

- 当前已有的对话 Tab
- 新增任务 Tab

任务属性参考 macOS 的“提醒事项”。任务需要支持增删改、完成闭环，并保持与当前文档 / Project 上下文一致的作用域语义。

在此基础上，补充一项扩展需求：对于带具体日期和时间的任务，在创建或编辑后，同步到 Google Calendar，并同步任务备注以及固定提醒时间。

## 详细需求

### 需求范围

- 在 Agent 视图右侧 panel 中增加 `任务` Tab，与现有 `对话` Tab 并列。
- 右侧 panel 不增加额外标题区，直接展示 Tab 与任务内容。
- 任务支持两类归属：
  - 文档任务
  - Project 任务
- 当前视图严格按当前聚焦对象展示任务，不做混合聚合：
  - 当前聚焦文档时，只显示该文档的任务
  - 当前聚焦 Project 时，只显示该 Project 的直属任务
- 任务支持以下操作：
  - 新增任务
  - 编辑任务
  - 标记完成
  - 取消完成
  - 删除任务
- 对于带具体日期和时间的任务，支持同步到 Google Calendar。
- Google Calendar 同步触发范围：
  - 新建带具体日期和时间的任务
  - 编辑已有任务的标题、备注、日期时间后同步更新
- Google Calendar 同步内容包括：
  - 任务标题
  - 任务日期时间
  - 任务备注，作为事件描述原样同步
- Google Calendar 事件自动设置以下提醒时间：
  - 前 1 天晚上 9:00
  - 当天早上 8:00
  - 任务时间前 1 小时
- 任务字段和概念参考 macOS 提醒事项，但不复制其完整产品能力和界面结构。

### 非目标

- 不显示任务归属来源信息
- 不做文档任务与 Project 任务的混合汇总视图
- 不做全局任务页面
- 不在左侧目录树中增加任务节点
- 不在文档正文内嵌任务视图
- 不支持多人协作、指派、共享
- 不支持子任务、重复任务、标签体系、地点提醒、附件
- 不做自然语言自动抽取任务
- 暂不实现 Web 宿主下的 Google Calendar 同步
- 暂不支持除 Google Calendar 以外的其他日历服务
- 暂不支持用户自定义提醒策略
- 暂不支持任务完成时自动处理 Google Calendar 事件
- 暂不支持任务删除时自动处理 Google Calendar 事件
- 暂不支持将任务从“带具体时间”改为“无具体时间”时自动删除或取消既有 Google Calendar 事件

### 界面描述 (UI)

右侧 panel 顶部为 Tab 切换：

- `对话`
- `任务`

切换到 `任务` Tab 后，不显示额外标题区，主体直接进入任务区域。

任务区域结构如下：

- 顶部轻操作区
  - `新增任务` 按钮
- 未完成任务列表
- 已完成任务折叠区
  - 默认折叠
  - 显示已完成任务数量

每条任务在列表中应展示：

- 完成勾选控件
- 标题
- 备注摘要（如果有）
- 日期时间信息（如果设置了时间）
- 优先级提示（如果设置了优先级）

每条任务不展示：

- 归属文档
- 归属 Project
- 来源说明

新增任务采用右侧 panel 内联展开的轻量编辑区，不跳离当前 Agent 工作流。

### 交互逻辑

#### 1. 任务 Tab 切换

- 用户在右侧 panel 切换到 `任务` Tab 后：
  - 当前聚焦文档时，看到该文档的任务
  - 当前聚焦 Project 时，看到该 Project 的直属任务
- 不显示其他作用域任务

#### 2. 新增任务

- 用户点击 `新增任务`
- 在右侧 panel 内联展开轻量编辑区
- 默认归属当前聚焦对象：
  - 文档视角默认归属当前文档
  - Project 视角默认归属当前 Project
- 用户填写标题
- 可选填写备注、日期时间、优先级
- 保存后任务立即出现在未完成列表中

#### 3. 编辑任务

- 用户可对已有任务执行编辑
- 可修改：
  - 标题
  - 备注
  - 日期时间
  - 优先级
- 保存后当前列表即时更新
- 如果该任务带具体日期和时间，则保存后同步更新对应的 Google Calendar 事件

#### 4. 完成 / 取消完成

- 用户将未完成任务标记完成后：
  - 任务移入已完成区
  - 已完成区默认折叠
- 用户取消完成后：
  - 任务回到未完成区

#### 5. 删除任务

- 用户删除任务后：
  - 该任务从当前列表移除

#### 6. 日期时间体现

- 任务支持设置“日期时间”，而不仅是日期
- 如果任务设置了时间，列表中必须明确体现
- 用户无需进入编辑态，就能知道该任务带有具体时间约束

#### 7. Google Calendar 同步

- 当任务具备具体日期和/或时间时：
  - 保存任务后，系统尝试同步到 Google Calendar
  - 若该任务此前未同步，则创建新的 Google Calendar 事件
  - 若该任务此前已经同步，则更新已有事件
- 同步失败时：
  - 任务本身仍然保存成功
  - 系统记录同步失败状态，供后续恢复或排查

#### 8. 提醒时间规则

- 如果“当天早上 8:00”晚于或等于任务时间，则不设置这一次提醒
- 如果多个提醒时间重合，则按最终提醒时间点去重

### macOS 提醒事项参考后的功能收敛

本次只参考 macOS 提醒事项中的“轻量任务项”概念，收敛为以下功能：

- 基础任务项
  - 标题
  - 备注
  - 完成状态
- 日期时间型提醒信息
  - 支持设置具体日期时间
  - 列表中可见
- 优先级
  - `低`
  - `中`
  - `高`
- 完成闭环
  - 标记完成
  - 取消完成
  - 删除
- 已完成默认折叠显示
- 任务编辑
  - 支持修改标题、备注、日期时间、优先级

## 推荐实现方案

### 架构设计

- `DocumentWorkspaceView`
  - 保持三栏工作区装配层职责
  - 继续向右侧 pane 传递当前文档 / Project 上下文
- `AgentPane` 建议改名为 `AgentRightPane`
  - 更准确表达其“右侧工作区容器”职责
  - 从单一会话承载层演进为右侧多 Tab 容器
- `AgentConversationPanel`
  - 保持会话专属职责
  - 不直接承载任务逻辑
- `AgentTaskPanel`
  - 新增
  - 负责任务列表、已完成折叠区、内联新建/编辑区
- `TaskEditorInline`
  - 新增
  - 负责轻量编辑表单
- `FileSystemTaskProvider`
  - 新增
  - 从 `FileSystemContextProvider` 中独立出来
  - 负责任务存储、CRUD、规范化以及同步编排入口
- `ITaskCalendarSyncService`
  - 新增
  - 抽象任务到外部日历服务的同步能力
- `GoogleCalendarSyncService`
  - 新增
  - 作为 `ITaskCalendarSyncService` 的首个实现，负责 Google Calendar 接入

### 核心组件

#### 1. `IContextProvider` 与 `ITaskProvider`

为保持任务域适度隔离，不建议把任务 CRUD 直接平铺到 `IContextProvider`。建议：

- `IContextProvider` 提供 `getTaskProvider()`
- 任务能力由独立的 `ITaskProvider` 承载

建议接口形态：

```ts
type TaskPriority = 'low' | 'medium' | 'high';

interface TaskCalendarSyncState {
  provider: 'google-calendar' | null;
  status: 'not_synced' | 'synced' | 'sync_failed';
  externalEventId: string | null;
  lastSyncedAt: number | null;
  lastError: string | null;
}

interface Task {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  dueAt: number | null;
  priority: TaskPriority | null;
  documentPath: string | null;
  agentKey: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  calendarSync: TaskCalendarSyncState;
}

interface ITaskProvider {
  getTasks(
    documentPath?: string | null,
    agentKey?: string | null,
    completed?: boolean
  ): Promise<Task[]>;
  createTask(task: Task): Promise<Task>;
  updateTask(task: Task): Promise<Task>;
  deleteTask(taskId: string): Promise<void>;
  setTaskCompleted(taskId: string, completed: boolean): Promise<Task>;
}

interface TaskCalendarSyncResult {
  provider: 'google-calendar';
  status: 'not_synced' | 'synced' | 'sync_failed';
  externalEventId: string | null;
  lastSyncedAt: number | null;
  lastError: string | null;
}

interface ITaskCalendarSyncService {
  readonly providerId: 'google-calendar' | string;
  shouldSync(task: Task): boolean;
  syncTask(task: Task, previousTask?: Task | null): Promise<TaskCalendarSyncResult>;
}

interface IContextProvider {
  getTaskProvider(): ITaskProvider;
}
```

补充约束：

- 接口形式虽然使用 `Task`，但语义上允许 `id`、`createdAt`、`updatedAt`、`completedAt` 由 provider 规范化
- 不使用 `CreateTaskInput` / `UpdateTaskInput`
- 不使用 `TaskQuery`
- 完成状态变更使用单独的 `setTaskCompleted`

#### 2. 任务数据规则

尽管 UI 不显示归属，数据层仍保留作用域区分：

- 文档任务：`documentPath != null`
- Project 任务：`documentPath == null && agentKey != null`

查询规则：

- 文档视角：按 `documentPath` 查询
- Project 视角：按 `agentKey` 查询直属任务
- 不支持混合聚合查询

任务同步规则：

- 只有带具体日期和时间的任务才允许进入日历同步链路
- `calendarSync` 状态直接保存在 `Task` 对象上，而不是单独维护外部映射表
- 已同步任务通过 `calendarSync.externalEventId` 标识对应的 Google Calendar 事件

#### 3. 任务与日历同步编排

- `ITaskProvider.createTask(task)`
  - 先完成任务持久化
  - 若任务满足同步条件，则调用 `ITaskCalendarSyncService.syncTask(...)`
  - 将同步结果回写到 `Task.calendarSync`
- `ITaskProvider.updateTask(task)`
  - 先完成任务更新
  - 若标题、备注或日期时间发生变化且任务满足同步条件，则调用同步服务
  - 将同步结果回写到 `Task.calendarSync`
- `ITaskProvider.setTaskCompleted(...)`
  - 本次不触发 Google Calendar 更新
- `ITaskProvider.deleteTask(...)`
  - 本次不触发 Google Calendar 删除
- 当同步失败时：
  - 不回滚任务写入
  - 仅更新 `calendarSync.status` 与 `calendarSync.lastError`

#### 4. Google Calendar 接入方式

- 采用 Google Calendar 官方 REST API
- 采用 OAuth 2.0 用户授权流程
- 需要支持离线访问，以持久化 `refresh_token`
- `GoogleCalendarSyncService` 负责：
  - 创建事件
  - 更新已有事件
  - 根据任务时间生成最终提醒集合
  - 对无效提醒和重复提醒做过滤
- 本次仅要求在 Desktop 宿主下实现该能力，不要求 Web 宿主支持
- 不通过 Codex connector、MCP、浏览器自动化或 DOM 抓取方式接入 Google Calendar

#### 5. UI 状态与行为

- `AgentRightPane` 维护当前激活 Tab：`conversations | tasks`
- `AgentTaskPanel` 维护：
  - 未完成列表
  - 已完成折叠区
  - 当前内联编辑态
- 新建任务时，编辑区在右侧 panel 内联展开
- 编辑任务时，可在列表内原位或邻近位置展开轻量编辑区
- 保存后刷新当前作用域任务列表

本次补充需求不要求增加新的 UI 状态控件，仅保持现有任务编辑与保存流转。

#### 6. Provider 实现链路

无论是 Desktop 本地上下文还是 HTTP context 模式，任务能力都应沿用现有 context 接入链路：

- 由 `IContextProvider` 统一暴露 `ITaskProvider`
- 由各具体 provider 实现自身的任务存储、查询与写入逻辑
- 本次建议将 `TaskProvider` 从 `FileSystemContextProvider.ts` 中拆到单独文件中，但不继续细分为更多 task 子文件
- Google Calendar 同步服务由 task provider 在 Desktop 宿主中组合调用

## 影响到的核心类 / 全局类图

可能影响的核心模块：

- `DocumentWorkspaceView`
  - 保持三栏装配层职责
- `AgentPane` / `AgentRightPane`
  - 从单一会话面板承载层，演进为右侧多 Tab 容器
- `AgentConversationPanel`
  - 保持会话专属职责
- `AgentTaskPanel`
  - 新增任务面板组件
- `TaskEditorInline`
  - 新增内联编辑组件
- `IContextProvider`
  - 新增 `getTaskProvider()` 访问入口
- `ITaskProvider`
  - 新增任务域抽象
- `Task`
  - 新增任务领域对象
- `Task`
  - 新增 `calendarSync` 同步状态字段
- `ITaskCalendarSyncService`
  - 新增外部日历同步抽象
- `GoogleCalendarSyncService`
  - 新增 Google Calendar 接入实现
- `FileSystemTaskProvider`
  - 新增独立的 task provider 实现

对全局类图的潜在影响：

- 在 `IContextProvider` 下增加到 `ITaskProvider` 的访问关系
- 在右侧 pane 链路中增加 `AgentTaskPanel` 与 `TaskEditorInline`
- `Task` 作为与 `Conversation` 平行的协作对象进入模型
- `Task` 通过 `calendarSync` 关联外部日历同步状态
- `ITaskProvider` 与 `ITaskCalendarSyncService` 之间增加协作关系
- `AgentConversationPanel` 与任务逻辑保持解耦

## 验收标准

用于后续 e2e 测试验证需求的实现是否完整、正确：

| 动作 | 预期响应 |
|-----|--------|
| 在 Agent 视图右侧查看 panel | 可见“对话”和“任务”两个 Tab |
| 在文档视角切换到任务 Tab | 只显示当前文档的任务 |
| 在 Project 视角切换到任务 Tab | 只显示当前 Project 的直属任务 |
| 点击“新增任务” | 在右侧 panel 内联展开轻量编辑区 |
| 在文档视角新增任务 | 任务默认归属当前文档，保存后立即显示 |
| 在 Project 视角新增任务 | 任务默认归属当前 Project，保存后立即显示 |
| 新增任务时填写日期时间 | 保存后任务列表中能明显看到日期时间信息 |
| 编辑任务标题、备注、优先级、日期时间 | 保存后任务内容即时更新 |
| 标记任务完成 | 任务移入已完成区 |
| 查看任务列表 | 已完成任务默认折叠显示 |
| 展开已完成区 | 可查看已完成任务列表 |
| 对已完成任务执行取消完成 | 任务回到未完成区 |
| 删除任务 | 任务从当前任务视图移除 |
| 查看任务列表项 | 不显示任务归属或来源信息 |
| 新建一个带具体日期和时间的任务 | 任务保存成功，并在 Google Calendar 中创建对应事件 |
| 编辑一个已同步任务的标题、备注或日期时间 | 任务保存成功，并更新对应 Google Calendar 事件 |
| 新建一个只有日期、没有具体时间的任务 | 任务保存成功，但不触发 Google Calendar 同步 |
| 任务时间早于当天 08:00 | 生成的提醒中不包含“当天早上 8:00”这一条 |
| 两个提醒时间重合 | Google Calendar 中最终仅保留去重后的提醒时间点 |
| Google Calendar 同步失败 | 任务仍然保存成功，并记录同步失败状态 |
