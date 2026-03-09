# ChatPrism Sync Server

开发环境默认监听 `http://127.0.0.1:8787`，并为 Web / Extension 提供真实的 `/api/sync/push`、`/api/sync/pull` 与 `/health`。默认 SQLite 文件会落在 `apps/server/.data/sync.sqlite`。

常用命令：

```bash
pnpm --filter server dev
pnpm --filter server test
pnpm --filter server build
```

环境变量：

- `CHATPRISM_SYNC_DB_PATH`：SQLite 文件路径，默认 `apps/server/.data/sync.sqlite`
- `CHATPRISM_SYNC_ALLOWED_ORIGINS`：生产环境允许的跨域来源，多个值用逗号分隔
- `CHATPRISM_SYNC_BASE_URL`：客户端可复用的同步服务地址，Web / Extension 也支持各自的 `VITE_SYNC_BASE_URL` / `WXT_SYNC_BASE_URL`

服务端会输出每个请求的 method、path、status、耗时、`syncKey` 和 `origin`，可直接用于排查请求是否到达服务端。
