## Why

JARVIS 目前把 AI 与任务能力直接硬编码在前端宿主中，导致 Markdown 工作区核心难以独立演进，也无法让不同宿主按需启用能力。在继续增加更多横切功能之前，需要先引入一个最小可用的前端插件系统，把核心文档流程与可选功能入口解耦。

## What Changes

- 增加一个仅面向前端的插件系统，使宿主可以注册内置插件、读取全局启用配置，并在启动时只激活被启用的插件。
- 在 `packages/core` 中引入最小共享插件契约，包括插件清单、启用配置、注册 API、只读查询接口，以及首批扩展点的数据结构。
- 在 `packages/plugin-system` 中增加插件系统运行时模块，负责插件激活、贡献注册、重复校验、按插件回收，以及面向宿主的贡献查询。
- 将当前 AI 相关入口收敛到 `ai-agent` 插件，将当前任务相关入口收敛到 `task-mgr` 插件；插件启用时保持现有用户能力不变。
- 调整宿主装配方式，使顶层全局视图与 Agent 右侧 panel tab 由插件贡献驱动，而不是继续依赖硬编码导入。
- 预留一个受控的“文档创建流程”扩展点，为未来围绕 Markdown 文档创建流程增强的插件提供接入位。
- 本期继续排除 `IContextProvider`、任务持久化等后端向能力，不在插件系统内拆分。

## Capabilities

### New Capabilities

- `plugin-system`：定义前端插件清单、启用配置、贡献注册机制，以及全局视图、右侧 panel tab、文档创建流程的宿主装配方式。

### Modified Capabilities

None.

## Impact

- 影响 `packages/core` 中的共享契约，新增一组 type-only 的插件接口。
- 新增 `packages/plugin-system` 前端运行时包。
- 新增 `plugins/ai-agent` 与 `plugins/task-mgr` 插件包。
- `apps/web`、`apps/desktop`、`apps/extension` 需要改为提供内置插件列表、激活已启用插件，并把贡献查询注入共享 UI。
- `packages/ui` 需要改为根据注册贡献渲染全局视图与 Agent 右侧 panel tab。
- 本期不引入新的外部依赖，也不涉及后端协议或存储迁移。
