## 1. 核心同步抽象

- [x] 1.1 在 `packages/core` 中补充 `Conversation` 同步元数据类型与 `ISyncTransport` 契约。
- [x] 1.2 实现 `SyncStorageProvider`，组合本地存储、`syncKey` 命名空间和增量 `pull/push` 同步流程。
- [x] 1.3 为 `SyncStorageProvider` 增加 LWW 合并、软删除保留和忽略 `compare` 载荷的单元测试。

## 2. 本地存储与配置接入

- [x] 2.1 调整现有本地存储实现，确保 `dirty`、`deleted`、`syncedAt` 等同步元数据可被无损保存与读取。
- [x] 2.2 增加 `syncKey` 设置读取与校验逻辑，支持开发环境默认值 `0`，并在非开发环境拒绝默认值。
- [x] 2.3 为 `syncKey` 设置与运行时校验补充单元测试。

## 3. Web 与 Extension 宿主接线

- [x] 3.1 在 Web 宿主中改用 `SyncStorageProvider` 初始化聊天存储，并将 `syncKey` 注入同步上下文。
- [x] 3.2 在 Extension 宿主中改用 `SyncStorageProvider` 初始化聊天存储，并绑定同步触发时机与 `syncKey` 校验。
- [x] 3.3 保持 phase 7 的 `compare` 历史仅本地持久化，不纳入 Web/Extension 的远端同步载荷。

## 4. 验证与交付

- [x] 4.1 为 Web/Extension 宿主补充集成测试，覆盖 `syncKey` 校验、普通会话同步初始化和 `compare` 不上报场景。
- [x] 4.2 为 Extension 生成 Playwright e2e 用例，验证同步设置生效与非开发环境拒绝默认 `syncKey=0`。
- [x] 4.3 运行相关测试；Extension e2e 通过后执行 `pnpm --filter extension build`。

## 5. 服务端应用与持久化

- [x] 5.1 新增独立 `apps/server`，完成 Node.js + Hono 基础启动、`/health` 路由和工作区脚本配置。
- [x] 5.2 在 `apps/server` 中落地 SQLite schema、`sync_cursor_state` / `synced_conversations` 表和启动建表逻辑。
- [x] 5.3 实现 `syncRepository` 与 `syncService`，支持按 `syncKey` 隔离的 `push/pull`、服务端游标推进与 LWW 冲突处理。
- [x] 5.4 实现 `/api/sync/push`、`/api/sync/pull`、`OPTIONS` 预检与 CORS 策略，并在服务端侧校验 `syncKey` 和请求体。

## 6. 客户端接真实服务端

- [x] 6.1 为 Web / Extension 增加 `syncBaseUrl` 默认配置与环境变量说明，确保可连接独立 `apps/server`。
- [x] 6.2 调整客户端联调与测试配置，使真实服务端可替代 mock transport 完成同步验证。
- [x] 6.3 确保服务端标准化后仍忽略 `compare`，且客户端拉取的软删除会话维持当前隐藏策略。

## 7. 服务端验证与联调

- [x] 7.1 为 `apps/server` 补充 repository / service / API 测试，覆盖游标、命名空间隔离、LWW、非法请求和 CORS。
- [x] 7.2 为 Web / Extension 增加面向真实服务端的联调用例，覆盖普通会话同步、外部历史导入同步、`compare` 不入库和默认 `syncKey=0` 拒绝。
- [x] 7.3 运行服务端测试、客户端联调测试和 `pnpm --filter server build`，确认同步闭环在仓库内可独立运行。

## 8. 本地未同步数据启动补偿

- [x] 8.1 调整 `SyncStorageProvider` 启动流程，在每次 `hydrate()` 时将缺失同步元数据或仍为 dirty 的普通会话与已导入外部历史标记为待同步并推送到服务端。
- [x] 8.2 为 Web / Extension 宿主补充联调用例，覆盖“每次启动时本地已有未同步记录，会自动补推到服务端”的场景。
- [x] 8.3 为 `SyncStorageProvider` 增加单元测试，覆盖启动补偿、`compare` 不补推以及新建会话继续正常 push 的行为。
