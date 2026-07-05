# JARVIS 多端在线化改造计划(Online Refactor)

> 状态:方案定稿,实施中
> 日期:2026-07-03
> 约束:单人使用、最低成本、离线优先、兼容外部工具(Obsidian / git / codex CLI)

## 1. 背景与目标

- **移动端可用**:手机浏览器随时随地访问 JARVIS(会话、任务、文档)。
- **离线优先**:Mac 断网时桌面端完整可用;手机离线可用度按成本渐进提升。
- **多端一致**:文档、任务、会话在 Mac / 手机 / VPS 间自动同步。
- **安全**:server 无鉴权体系(且 `/api/codex` 可执行本机命令),不得裸暴露公网。
- **低成本**:不引入新数据库技术、不写原生 App、尽量复用已有机制(sync 协议、Dropbox)。

## 2. 已完成的工作(2026-07)

| 事项 | 说明 |
|---|---|
| web2 移动端适配 | `useIsNarrowViewport`(≤768px);工作区单栏 + 文件树抽屉(`DocumentWorkspaceView`);对话"列表页↔聊天页"双页流(`ConversationWorkspaceView`);桌面宽度布局不受影响 |
| 同源相对 API | web2 构建须用 `VITE_SYNC_BASE_URL=/api/sync`(相对路径),codex/context base URL 自动派生;否则手机会把默认的 `127.0.0.1` 解析成手机自身导致同步静默失败 |
| server 托管 web2 | server 设 `CHATPRISM_RENDERER_DIST=<web2/dist>` 即托管响应式前端,一个端口 = API + UI |
| 5173 dev 局域网 | web2 `vite.config.ts` 加 `server.host: true` + proxy(`/api`、`/health` → 8787);`.env.local` 改相对 `/api/sync`;手机可连 dev 热重载 |
| 端口结论 | 日常入口 = 8787(生产托管 web2);5173 仅开发热重载;临时 8788 已废弃 |

## 3. 终态架构

```
┌─ Mac 桌面(Electron,无本地 server 进程)──┐      ┌─ VPS(唯一 server,Tailscale 内可达)─┐
│ 文档:  renderer ←IPC→ main → 本地文件      │      │ /api/sync    → SQLite(会话+任务真身)│
│ codex: 走 VPS 的 /api/codex(无本地通道)   │      │ /api/context → VPS 的 Dropbox 文件副本│
│ 会话/任务: IndexedDB ──sync(绝对URL)───────┼────→ │ /api/codex   → VPS 上的 codex CLI     │
│ 本地文件 ←───────── Dropbox ───────────────┼────→ │ web2 静态托管(手机入口)             │
└────────────────────────────────────────────┘      │ Google Calendar 任务同步              │
                                                    └───────────────────────────────────────┘
手机:浏览器访问 VPS(同源),会话/任务有 IndexedDB 副本可离线,文档在线读取
安全:所有设备加入 Tailscale tailnet,server 不暴露公网端口
```

### 3.1 数据域划分(核心设计)

| 域 | 数据 | 本地形态 | 同步机制 | 理由 |
|---|---|---|---|---|
| **文件域** | 文档、附件、Agent 配置 | 磁盘文件(Mac 本地 + VPS 各持 Dropbox 副本) | **Dropbox** | 有 app 之外的消费者:Obsidian、git、codex CLI、人;必须保持纯文件形态 |
| **记录域** | 会话、任务 | 各客户端 IndexedDB 副本 | **自有 sync 协议**(push/pull + cursor + dirty 标记)→ hub SQLite | app 私有、细粒度、高频变更;单文件(tasks.json)易冲突、拆小文件爆炸,故入 DB |

分界线不是数据粒度,而是**"是否存在 app 之外的消费者"**。

### 3.2 记录域:local-first,而非远程数据库

- ❌ 不部署"可远程连接的中心数据库"(Postgres 等):集中与离线天然矛盾;多一个攻击面;需换驱动改代码。
- ✅ **hub SQLite 藏在 `/api/sync` 后面就是中心数据库**;客户端持本地副本离线读写,联网对账。
- 会话层已经是这个架构(IndexedDB + `SyncStorageProvider` push/pull),任务照抄即可。
- SQLite(WAL)**绝不放入 Dropbox 目录**(`-wal`/`-shm` 分别异步同步会损坏数据库);用 `CHATPRISM_SYNC_DB_PATH` 明确放本地盘。

### 3.3 模型 Provider 三通道与落位

| Provider | 接入通道 | 运行位置 | 可用端 |
|---|---|---|---|
| `gemini-api` | 官方 HTTP API + key | 纯客户端(renderer 直接 fetch) | 全部(手机/桌面) |
| `chatgpt-codex` | 本机 `codex` CLI(ChatGPT 订阅) | server 端(spawn 子进程) | 跟随 server;装到 VPS 后手机也可用 |
| `*-dom`(chatgpt/gemini/claude) | 网页版聊天站 + 登录 cookie | Electron controlled-page | 仅桌面(硬边界) |

通道形态决定落位:浏览器不能 spawn 进程(codex 只能在 server),普通网页不能跨域操纵别站 DOM(DOM provider 只能在 Electron)。

### 3.4 真身与投影(Truth vs Projection)

一个贯穿全局的原则:**存储层按存储的需要设计(事务、查询、同步粒度),各消费者看到的是"投影"**——由 app 按需生成、可再生、单写者、非真身,因此零冲突、零 schema 风险。

- **LLM/agent 可见性**不要求任务/对话物理存成文件,由三级投影按需满足:
  1. **动态上下文注入**:对话时 app 把当前文档关联的任务、相关会话摘要拼进 prompt(零文件、永远新鲜);
  2. **链接解析**:文档内引用任务/会话,渲染时动态解析(会话链接 `resolveMarkdownConversationLinkTarget` 已实现,任务链接照抄);
  3. **物化只读摘要**:为 codex 等纯文件消费者生成只读投影文件(如每文件夹任务摘要);会话侧对应物为已有的 `conversationArchive`(会话归档进文档)。
- 外部 agent 需要**写**任务时,走工具通道(MCP/CLI 调 app API)而非直改文件,写入经 normalizer 兜底。
- **搜索索引同样是投影**(见阶段 5):真身在文件还是 DB 与可搜索性无关,索引管道对两者各建 connector 即可。

### 3.5 安全模型:Tailscale 私网

- server 现状:无全局鉴权;`x-sync-key` 只是命名空间;`/api/codex` 等价远程执行命令 → **禁止裸公网**。
- 方案:Mac、手机、VPS 加入 Tailscale tailnet(WireGuard 加密、NAT 打洞、零入站端口、免费);用 MagicDNS 域名访问。
- web2 构建用相对 API 路径,换任何访问域名**无需重新构建**。
- 升级路径(需要公网分享时再说):Cloudflare Tunnel + Access,或 app 级 Bearer 中间件。

## 4. 关键决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 移动端 = 响应式 web2,不做原生 App、不设独立端口 | web2 与桌面共享 `packages/ui`;server 托管即多端可用 |
| D2 | 记录域用 local-first sync,不用远程 DB | 见 3.2;离线的正解是"本地副本 + 同步协议" |
| D3 | tasks 迁入 hub SQLite | tasks.json 单文件在 Dropbox 多写者下必冲突;拆小文件数量爆炸;任务是 app 私有记录 |
| D4 | 文档保持文件域,桌面离线直接读写本地 Dropbox 副本(不经 IndexedDB) | 保住 Obsidian/git/codex 消费;离线可写白送(Dropbox 对账);浏览器 IndexedDB 属缓存级存储不可作主存 |
| D5 | 本地 server 最终退役,桌面文件域走 Electron IPC | 记录域收敛 VPS 后,本地 server 仅剩文件网关/codex/托管三职责,可由 main 进程 IPC 替代;`FileSystemContextProvider` 的 `conversationQueryProvider` 为可选依赖,可传 null,无原生模块(better-sqlite3)ABI 负担 |
| D6 | 公网安全走 Tailscale,不做 app 鉴权(现阶段) | 单人场景;server 从不出现在公网,鉴权缺失不再是风险 |
| D7 | 手机 PWA 代码就绪,但本 change 最终只验收到在线模式 | 保留浏览器 PWA + 离线缓存实现,但真机离线/standalone 验收后移;当前 change 不引入原生 App |
| D8 | 任务/对话**不**物理存成文档旁的小文件;LLM/agent 可见性用投影三件套解决(§3.4) | 文件化的代价:全局查询(今天/计划视图)退化为扫全树、对话流式高频写与 Dropbox 分钟级同步冲突、schema 无 normalizer 兜底;而"给 agent 看"由 JARVIS 按需合成即可,无需物理写入。翻案信号:若"codex 直改任务"成为高频核心工作流可重议任务文件化;对话任何情况下不文件化 |
| D9 | 全局搜索(文档+会话+任务)= hub 上的派生索引,嵌入式方案(FTS5 → sqlite-vec → 混合),不引入独立搜索服务 | 索引是投影,与真身位置无关;DB 侧有精确变更流(sync 咽喉 + updatedAt)和稳定 id,反而比文件更易索引;单人数据量嵌入式绰绰有余,独立服务违背低成本约束 |

## 5. 路线图

> **实施范围:阶段 1–4。阶段 0 已完成(VPS 已部署就绪);阶段 5 明确不实施,仅存档设计。**

### 阶段 0:环境前置(✅ 已完成)

- [x] VPS 就绪,加入 Tailscale;Mac、手机装 Tailscale,启用 MagicDNS。
- [x] VPS 装 Dropbox 客户端,与 Mac 的 `AgentSpace` 双向同步。
- [x] 两端 `CHATPRISM_KNOWLEDGE_ROOT` 指向各自 Dropbox 副本;VPS 的 SQLite 位于 Dropbox **之外**;VPS 托管 web2。
- 注意:AgentSpace 内含 `.git`/`.obsidian`,Dropbox 同步无害,但 **git 操作只在 Mac 端做**。

### 阶段 1:日常流量切到 VPS,本地 server 仅保留为开发模拟器(纯配置)

- [x] hub = VPS。日常使用的会话 sync 全部指向 VPS(手机 web2 同源天然指向;Mac 端经浏览器访问 VPS,或 desktop 以生产态直连 VPS)。
- [x] **Mac 本地 server 不再进入日常使用链路**。本地文件仍保留,经 Dropbox 与 VPS 同步(Obsidian/本地编辑器照常可用)。
- [x] **本地 server 仅保留为开发模拟器**:本地 web2 dev 继续走本地 server,用于模拟 VPS API 与热更新调试。
- [x] **codex API 保留**,由 VPS 的 `/api/codex` 提供(VPS 安装并登录 codex CLI);顺带手机也可用 ChatGPT 订阅。
- 过渡期限制(至阶段 3 恢复):JARVIS 界面在 Mac 离线时不可用;离线改文档走 Obsidian 直接编辑本地文件,Dropbox 联网后对账。
- 效果:全网只有一个 server、一份会话真身;"两个 server 两份 SQLite"问题消解。

### 阶段 2:任务迁入记录域(OpenSpec 中型特性)

- [ ] hub SQLite 建 tasks 表;`/api/sync` 扩展任务资源(或新增端点),按 task id + `updatedAt` LWW 合并。
- [ ] 服务端为 task 建**白名单 normalizer**(教训:新增持久化字段不进 normalizer 会在 reload 后丢失)。
- [x] task-mgr 插件数据层:从"HTTP 现读"改为"IndexedDB 副本 + 同步"(离线可读写任务)。
- 同步节奏(已定):**变更即推 + 启动补推**,启动时增量拉取;不设周期定时器。
- [x] Google Calendar 同步迁至 hub(凭据只配 VPS)。
- [ ] 迁移脚本:tasks.json 一次性导入 DB;`.chatprism/` 从文件域退役。
- 过渡期纪律(阶段 2 落地前):**任务单写者**——日常只经一个 server 改任务,避免 Dropbox 冲突副本。

### 阶段 3:桌面文件域 IPC 化 + 本地 server 退役(OpenSpec 中大型)

- [ ] IPC 版 `IContextProvider`:main 进程持 `FileSystemContextProvider`(`conversationQueryProvider=null`,文档关联会话改由客户端 IndexedDB 查询),contextBridge/preload 暴露全部接口方法。
- [ ] renderer 改本地打包加载(file:// 或自定义协议),不再依赖 server origin。
- [ ] sync 等跨域调用处理:server `corsAllowlist` 补齐,或经 main 代理 fetch。
- [ ] bilibili 导入等 server 路由能力迁 IPC(`packages/node` 代码可直接在 main 运行)。
- [x] codex:保持由 VPS 提供(阶段 1 已迁),桌面无需本地 codex 通道。本期不再单列 5.5 收尾项。
- [x] 桌面恢复离线能力(文档经 IPC 读本地 Dropbox 副本);本地 server 代码保留但不再进入任何流程。
- 顺序依赖:阶段 1、2 先把记录域抽走,本阶段 IPC 面积才最小。
- 已知取舍:文档恢复"两个写者"(Mac 写本地文件、手机写 VPS 文件,Dropbox 合流);单人"同一时刻只在一端"纪律下冲突概率趋近零。

### 阶段 4:手机 web2 / PWA 就绪

- 前提约束: **真机离线/PWA 必须跑在 secure context**。`http://localhost` 仅适用于本机开发例外；`http://dsm918:8787`、`http://100.110.154.91:8787` 这类 HTTP 入口在 iPhone Safari 上不会启用 Service Worker，因此即使线上访问过一次，断网或断开 Tailscale/VPN 后仍会直接出现 Safari 的"无法打开网页"，而不是进入离线壳。
- 当前范围调整: 手机端**在线模式已验收通过**;真机离线与主屏幕 standalone 启动暂时放弃,不再作为本 change 的关闭条件。现有 PWA/service-worker/manifest 实现保留,后续若要重启手机离线能力,建议单独开新 change 并先解决 HTTPS / tailnet HTTPS 入口。
- [x] Service Worker 离线壳:缓存应用静态文件,断网可打开页面 → 解锁 IndexedDB 中会话/任务的离线使用。
- [x] 文档只读缓存:最近浏览过的文档离线可读(缓存非真身,被驱逐无害)。
- [x] 手机端当前验收口径 = 在线模式可用。
- [x] 代码已具备 `manifest.webmanifest` + `display: standalone` 与 Service Worker/缓存逻辑。
- [x] 真机离线 / 添加到主屏幕 standalone 验收已从本 change 范围移除,后续另行推进。

### 阶段 5:全局搜索 / RAG(❌ 明确不实施,设计存档)

**目标**:一个 `/api/search` 同时服务两个消费者——人(搜索框)与 agent(RAG 检索,JARVIS 组装上下文时取 top-k 相关内容注入 prompt)。

- [ ] hub 上建统一索引表 `search_chunks(source_type: doc|conversation|task, source_id, title, chunk_text, embedding, updated_at)`,以稳定 id 关联真身(链接不因文件移动而断)。
- [ ] 三个 connector 增量喂入:
  - 文档:扫描 knowledgeRoot(mtime/hash 比对;覆盖 Obsidian/codex 等 app 外编辑,因其经 Dropbox 流到 hub);
  - 会话/任务:sync push 钩子或 `updatedAt` cursor(变更流精确,索引成本最低)。
- [ ] 检索能力分级实施:① SQLite FTS5 全文(中文用 trigram tokenizer)→ ② sqlite-vec 向量(embedding 调 Gemini API)→ ③ 两路 RRF 混合。
- 定位:`IContextProvider.searchInScope` 的全局化推广;索引可再生,损坏即重建。
- **决策:本阶段不实施**,以上仅作为设计存档,供将来需要时参考。

## 6. 已确认事项(原待确认)

| 事项 | 结论 |
|---|---|
| `chatgpt-codex` provider | **暂不纳入本次迁移验收目标**；当前在线化优先覆盖 sync/context/web2 与 NAS 部署自动化 |
| VPS | **已部署就绪**(阶段 0 完成) |
| 实施范围 | **阶段 1–4 全部实施**;阶段 5 明确不实施 |

## 附录:常用命令

```bash
# web2 生产构建(必须相对 sync 路径)
VITE_SYNC_BASE_URL=/api/sync pnpm --filter web2 build

# web2 生产态 PWA 离线回归
pnpm --filter web2 test:e2e:pwa

# server 托管 web2(日常入口;hub 上运行)
CHATPRISM_KNOWLEDGE_ROOT=<Dropbox>/AgentSpace \
CHATPRISM_SYNC_DB_PATH=<Dropbox之外的本地路径>/sync.sqlite \
CHATPRISM_RENDERER_DIST=<repo>/apps/web2/dist \
pnpm --filter server dev        # 或 build 后 pnpm --filter server start

# web2 开发热重载(局域网/手机可连;需 8787 API 先起)
pnpm --filter web2 dev          # http://<Mac IP>:5173

# desktop 以生产形态直连 VPS（本地 bundle + 真实 hub）
CHATPRISM_DESKTOP_USE_LOCAL_BUNDLE=1 \
CHATPRISM_CONTEXT_BASE_URL=http://100.110.154.91:8787/api/context \
CHATPRISM_SYNC_BASE_URL=http://100.110.154.91:8787/api/sync \
CHATPRISM_CODEX_BASE_URL=http://100.110.154.91:8787/api/codex \
CHATPRISM_SYNC_KEY=dev-local \
pnpm --filter desktop2 dev:host

# NAS Docker 部署（必须保持 amd64 / x86_64）
./scripts/deploy-nas-server.sh

# 查本机局域网 IP
ipconfig getifaddr en0
```
