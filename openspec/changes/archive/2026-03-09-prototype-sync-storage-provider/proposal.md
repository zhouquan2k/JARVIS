## Why

当前 ChatPrism 已具备本地历史记录和外部历史导入能力，但这些数据仍然被宿主内的本地存储孤立在单设备、单运行时中，用户无法在浏览器插件、Web 端以及未来 App 端之间无缝延续自己的对话资产。`phase-7.md` 提出的目标是把系统推进到真正可持续积累的 PKM 基础设施，因此现在需要为存储层补上 Local-First 的同步能力，而不是继续停留在“每个宿主各存各的”阶段。

## What Changes

- 新增 `sync-storage-provider` 能力，在不改变上层聊天与历史工作台调用方式的前提下，为 `IStorageProvider` 增加“本地数据库 + 同步引擎 + 远端同步接口”的组合实现。
- 新增 `sync-server` 能力，在仓库内落地一个独立的同步服务端应用，使用 Node.js + Hono + SQLite 提供真实的 `pull/push` 持久化能力。
- 修改 `core-interfaces`，为当前 `Conversation` 聚合模型补充同步元数据约束，例如脏标记、软删除与同步游标所需字段，同时保持现有 `Conversation.messages` 结构不被拆散。
- 修改 `storage-provider`，要求存储实现支持 Local-First 语义：本地写入优先、后台异步 Push/Pull、增量同步与冲突合并。
- 修改 `storage-provider`，要求存储实现在 Local-First 语义之外，能够在每次启动时检查并补推“本地已存在但尚未同步”的普通会话与已导入外部历史到远端。
- 修改 `extension-host-app` 与 `web-host-app`，让两个宿主都通过统一的同步存储 provider 装配聊天与历史工作台，并在各自运行时中挂载同步引擎。
- 修改配置能力，约定 `syncKey` 作为远端命名空间标识，由设置项提供；默认值 `0` 仅允许开发环境使用。
- 明确远端同步 API 契约与宿主边界：服务端在本仓库内提供按 `syncKey` 隔离的 `pull/push` 增量接口，客户端遵循基于游标与 LWW 的同步策略。
- 为 Web / Extension 宿主补充面向真实服务端的默认接线、CORS 联调和环境变量配置，使本地开发不再依赖 mock transport 才能验证同步闭环。
- 将 `compare` 历史同步显式排除在本阶段范围之外，首版仅同步普通聊天会话与已导入外部历史。

## Capabilities

### New Capabilities
- `sync-storage-provider`: 通过 Local-First 架构在客户端本地存储之上叠加后台同步引擎和远端增量同步协议，实现多端一致的会话持久化能力。
- `sync-server`: 通过独立服务端应用为 `sync-storage-provider` 提供真实的 `POST /api/sync/push` 与 `POST /api/sync/pull` 能力，并以 `syncKey` 为命名空间将会话持久化到 SQLite。

### Modified Capabilities
- `core-interfaces`: `Conversation` 与存储相关接口需要支持同步元数据和软删除语义，保证同步引擎能够识别本地变更、远端回放和冲突状态。
- `storage-provider`: 现有存储能力从“单机本地持久化”升级为“本地优先 + 可后台同步”的统一契约。
- `static-config`: 系统配置需要新增 `syncKey` 读取与校验规则，并区分开发默认值和生产要求。
- `extension-host-app`: 扩展宿主需要挂载同步存储 provider，并在扩展运行时中调度同步引擎。
- `web-host-app`: Web 宿主需要复用同一同步存储 provider，并在主线程或 Worker 中完成同步任务调度。

## Impact

- 影响代码范围：`packages/core`、`apps/server`、`apps/extension`、`apps/web`，以及与之配套的测试代码。
- 影响的数据契约：`Conversation`、`IStorageProvider` 的实现集合、`syncKey` 配置、同步游标与远端同步载荷结构。
- 影响的数据迁移语义：每次启动时都需要识别并补推本地已有但尚未写入远端的普通会话与已导入外部历史。
- 影响的基础设施：新增 SQLite 数据文件、服务端启动配置、跨源访问策略以及本地开发环境变量。
- 影响的系统行为：本地普通会话与已导入外部历史的保存、删除、恢复流程将引入 dirty/soft-delete/后台同步等新语义，但 UI 调用方式保持不变。
- 影响的外部系统：本次变更将直接引入一个按 `syncKey` 隔离数据命名空间的远端同步服务，提供 `POST /api/sync/pull` 与 `POST /api/sync/push` 作为增量同步后端。
