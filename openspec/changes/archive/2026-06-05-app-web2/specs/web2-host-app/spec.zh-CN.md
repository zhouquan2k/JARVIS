## ADDED Requirements

### Requirement: Web2 host app MUST keep app-layer workspace dependencies limited to core and ui
`apps/web2` 宿主 MUST 将其 direct workspace-package imports 严格限制在 `@packages/core` 与 `@packages/ui`。app 层 MUST NOT 直接 import `@packages/plugin-system`、`plugins/*`，也 MUST NOT 直接依赖 task 特定的宿主组合模块。

#### Scenario: App-layer imports remain within the target dependency boundary
- **WHEN** 对 `apps/web2` 源文件的 direct workspace-package imports 进行分析
- **THEN** app MUST 只从 `@packages/core` 与 `@packages/ui` 导入 workspace packages
- **AND** app MUST NOT import `@packages/plugin-system`
- **AND** app MUST NOT import `plugins/*` 下的任何路径

### Requirement: Web2 host app MUST bootstrap shared workspace runtime through ui-owned surfaces
`apps/web2` 宿主 MUST 通过 `packages/ui` 导出的 bootstrap surface 初始化 builtin workspace runtime，而不是在宿主内自行装配 plugin runtime。该共享 bootstrap surface MUST 接收 host facts 与 runtime options，并 MUST 返回 `WorkspaceHostApp` 所需的 contribution query 与 runtime context。

#### Scenario: Web2 host boots through a ui bootstrap surface
- **WHEN** `apps/web2` 启动并挂载根 app
- **THEN** app MUST 调用 `packages/ui` 提供的 bootstrap 入口来初始化 builtin workspace runtime
- **AND** 根 app MUST 使用返回的 contribution query 与 runtime context 渲染共享 workspace host shell

### Requirement: Web2 host app MUST support the normal web workspace flow without default task composition
`apps/web2` 宿主 MUST 支持当前 Web 正常运行所需的 knowledge workspace 与 chat 相关宿主 surface，同时默认采用不包含 task 特定 app 逻辑和 task workspace 入口的组合方式。

#### Scenario: Web2 host starts with knowledge and chat surfaces but no task entry
- **WHEN** 用户打开默认的 `apps/web2` 运行时
- **THEN** 宿主 MUST 允许进入 knowledge workspace
- **AND** 宿主 MUST 暴露正常 Web 使用所需的 chat 相关 workspace surface
- **AND** 默认 top-level workspace options MUST NOT 包含 task workspace 入口

### Requirement: Shared bootstrap extraction for web2 MUST preserve legacy web host availability
任何为了 `apps/web2` 而抽取到 `packages/ui` 或 `packages/core` 的共享 bootstrap 或 helper，MUST 保持现有 `apps/web` 宿主仍然能够启动、构建并渲染当前运行面。

#### Scenario: Legacy web host remains available after shared bootstrap extraction
- **WHEN** 引入 `apps/web2`，并将共享 bootstrap 逻辑从 `apps/web` 抽走
- **THEN** 现有 `apps/web` 宿主 MUST 仍然能够完成其支持的 typecheck 与 build 步骤
- **AND** 现有 `apps/web` 宿主 MUST 仍然能够渲染 workspace shell，且不丢失当前运行面
