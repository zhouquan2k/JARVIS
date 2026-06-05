## Why

JARVIS 目前仍在现有 `apps/web` 上做渐进式剥离，但这个宿主仍承载了较多历史耦合，导致每次想简化 app 层时，都必须一边解耦旧入口、一边继续维持它作为现役宿主可运行，成本很高。

现在新增一个全新的 `apps/web2` 更合适：直接从目标架构出发建立新的 Web 宿主，让它在 app 层只依赖 `packages/core` 与 `packages/ui`，通过共享 bootstrap surface 复用既有 packages/plugins，而不是继续在旧宿主上做原地减法。

## What Changes

- 新增 `apps/web2` Web 宿主，使其能够像当前 web app 一样启动并运行核心 workspace 流程，同时让 app 层不再承载任务相关逻辑或插件装配逻辑。
- 在 `packages/ui` 中新增或收敛宿主 bootstrap surface，使 Web 宿主可以初始化 builtin workspace runtime，并渲染共享 host shell，而不需要在 app 层直接依赖 `packages/plugin-system`。
- 在共享 bootstrap 逻辑迁入 `packages/ui` 后，继续保持现有 `apps/web` 可运行、行为不回退。
- 第一阶段只处理 app 层剥离；`packages/ui` 内仍然存在的业务逻辑暂不在本 change 中继续拆分，后续再单独推进。
- `apps/web2` 默认采用不包含任务宿主逻辑的组合方式，避免新 app 在宿主层嵌入 task 特定逻辑。

## Capabilities

### New Capabilities

- `web2-host-app`: 一个新的 Web 宿主 app，通过 `packages/ui` 启动共享 workspace，在核心运行表现上对齐当前 web app，并将 app 层依赖严格限制在 `packages/core` 与 `packages/ui`。

### Modified Capabilities

None.

## Impact

- 在 `apps/web2` 下新增独立 app 包及其 Vite、typecheck、单测、e2e 入口。
- 在 `packages/ui` 中增加共享 bootstrap 入口，使宿主 app 可以在不直接 import `plugin-system` 的情况下拿到 builtin workspace runtime。
- 可能需要在 `packages/core` 与 `packages/ui` 中新增少量类型或 helper 导出，用于支撑新的宿主边界。
- 不删除 `apps/web`；在引入 `web2` 期间，现有 web app 必须持续可运行且行为保持完整。
- 本阶段不涉及 server API、存储 schema 或插件能力模型的重设计。
