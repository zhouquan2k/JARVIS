## Why

当前任务体验在“全局查看任务”与“回到 workspace 继续处理任务”之间存在明显断层，而且缺少一层轻量的执行状态来表达“正在做什么 / 打算在哪个时间段做什么”。这使得 `/all-tasks` 更像一个聚合列表，而不是适合日常推进和排序的工作入口。

## What Changes

- 扩展全局任务工作区，使用户点击任务后可以回到对应的 workspace 节点，并恢复任务相关的 workspace 上下文。
- 调整共享任务列表的编辑形态，使全局任务编辑在当前 task row 原地展开，而不是跳到面板级编辑区。
- 在 `/all-tasks` 的 `today` 快捷视图中新增任务时，默认填入今天日期，但不强制补具体时间。
- 为任务新增互斥的执行状态字段，支持 `doing`、`morning`、`afternoon`、`evening` 四个值。
- 将执行状态与文档 / agent 归属元信息分开渲染，并让带执行状态的任务整体排在无执行状态任务之前。
- 在 workspace UI 层引入更高层的 `WorkspaceNavigationApi.openNode(path, options)` 桥接，而不是把路由切换语义塞进 `documentWorkspace.openNode()`。
- 在全局任务视图左侧 panel 新增 `已规划` 与 `未规划 / backlog` 过滤入口，其中 `已规划` 基于 `executionState !== null`，`未规划 / backlog` 基于 `dueAt === null && executionState === null`。
- 扩展 Markdown 编辑器的“插入链接”流程，使其可以在当前流程内上传新文件，并把新文件作为链接目标插入当前文档。
- 在 Markdown 编辑区增加“刷新当前文档”按钮，用于重新从文件系统读入当前文档；若当前文档存在未保存修改，刷新前必须先确认。

## Capabilities

### New Capabilities
- 无。

### Modified Capabilities
- `all-tasks-workspace`：全局任务视图需要支持从任务回跳到 workspace、`today` 新建默认今天、row 级稳定的 inline 编辑、执行状态展示，以及执行状态优先排序。
- `agent-task-management`：共享任务编辑器和任务行交互需要支持持久化的执行状态字段，并支持不发生面板级跳动的原地 row 编辑。
- `knowledge-workspace`：workspace 导航需要支持通过更高层导航桥接恢复目标节点，以及任务相关的 tab / detail 上下文。
- `core-interfaces`：共享 `Task` 模型需要把执行状态字段纳入跨宿主持久化契约。
- `all-tasks-workspace`：左侧快捷入口需要新增基于执行状态/无日期组合语义的 `已规划` 与 `未规划 / backlog` 过滤视图。
- `knowledge-workspace`：Markdown 编辑器需要支持“插入链接时上传新文件”以及“刷新当前文档”的文档级操作。

## Impact

- 影响代码：`plugins/task-mgr` 的任务列表与编辑器组件，`packages/ui` 的 workspace host 和导航桥接，以及 `packages/core`、`packages/node` 中的任务契约与持久化链路。
- API 影响：在 workspace UI 层新增 `WorkspaceNavigationApi.openNode(path, options)`，扩展共享 `Task` 实体的执行状态字段，并为任务查询 tag 增加新的过滤语义。
- 持久化 / 模型影响：任务存储需要直接持久化执行状态，而不是再引入独立映射对象。
- 验证影响：需要补任务组件测试、workspace 导航测试、Markdown 编辑器交互测试，以及任务持久化 / bridge 对执行状态字段和新过滤语义的覆盖。
