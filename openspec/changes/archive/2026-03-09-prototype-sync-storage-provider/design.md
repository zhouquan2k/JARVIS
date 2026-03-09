## Context

当前仓库中的持久化路径仍是“宿主直接注入本地存储实现”。Web 宿主在 [apps/web/src/App.vue](/Users/quanzhou/Workspace/ChatPrism/apps/web/src/App.vue) 中直接为 `useChatStore` 注入 [packages/core/src/providers/IndexedDBStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/IndexedDBStorageProvider.ts)，扩展宿主也沿用相同思路。这个模型能满足单端会话恢复，但它无法把对话资产同步到其他宿主，更无法支撑 `phase-7.md` 里要求的“离线可用 + 多端一致 + 本地优先”的 PKM 体验。当前阶段远端不采用完整账号系统，而是使用设置中的 `syncKey` 作为数据命名空间标识；默认值 `0` 仅允许开发环境使用，生产环境必须由用户显式配置。

仓库当前的数据模型以 `Conversation` 为持久化单位，消息仍内嵌在 [packages/core/src/interfaces/IStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts) 的 `Conversation.messages` 数组里，没有独立 Message 表。设计上如果直接按 `phase-7.md` 原文切成 `Conversation` / `Message` 双实体，会让本次 change 从“为现有系统补同步层”膨胀成“重做整个存储模型”。因此本设计保留现有聚合模型，让 `Conversation` 成为同步单元；同步引擎仅对聚合对象做增量 Push/Pull 和冲突处理。

当前仓库虽然已经有 [packages/core/src/providers/FetchSyncTransport.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/FetchSyncTransport.ts) 这样的客户端 transport 入口，但并没有任何真实的服务端工程、数据库 schema 或 `/api/sync/*` handler。继续只保留 HTTP contract 会让本次变更停留在“客户端结构先行”的半成品状态，无法完成 Web / Extension 的真实联调，也无法验证 `syncKey` 命名空间、CORS、软删除回放与游标推进这些关键行为。因此本次设计将服务端实现纳入交付范围，在仓库中新增独立 `apps/server`，使用 Node.js + Hono + SQLite 提供同步 API 与持久化能力。

## Goals / Non-Goals

**Goals:**

- 在 `packages/core` 中引入一个对上层仍表现为 `IStorageProvider` 的 `SyncStorageProvider`，实现 Local-First 读写体验。
- 保留 `Conversation` 作为当前阶段的同步单元，不拆分现有 `messages` 持久化结构。
- 为同步链路定义最小可用的数据元信息、Push/Pull API 契约和冲突合并规则。
- 在仓库内新增独立 `apps/server` 服务端应用，落地 `/api/sync/push` 与 `/api/sync/pull` 的真实实现，并以 SQLite 持久化会话数据。
- 让 `apps/extension` 与 `apps/web` 都能挂载同一套同步存储抽象，只在调度方式和宿主注入层有所差异。
- 明确远端同步接口、同步游标和数据落库都以 `syncKey` 为隔离边界。
- 保证离线时本地读写不阻塞 UI，联网后再通过后台引擎补齐同步。
- 保证每次启动同步时，本地已有但尚未同步的普通会话与已导入外部历史会被自动识别并补推到远端。

**Non-Goals:**

- 不把消息拆成独立 `Message` 表，也不在本次变更中引入复杂的 CRDT 或 Operational Transform。
- 不改动 `packages/ui` 的视图结构、聊天交互或历史工作台布局。
- 不把 `compare` 结果历史纳入首版同步范围；`compare` 字段继续只做本地持久化，后续单独设计同步策略。
- 不在本阶段引入完整登录系统；用户隔离暂由 `syncKey` 配置承担。
- 不在这一步解决全文检索、分桶归档、加密同步、团队协作权限控制或 Postgres / ORM / migration framework 等生产级基础设施演进。

## Decisions

### 决策 1：在核心层新增 `SyncStorageProvider`，通过组合本地存储与同步引擎保持 `IStorageProvider` 接口不变

**选择**

在 `packages/core` 中新增一个同步存储实现，它继续实现现有 `IStorageProvider`，但内部不直接依赖单一本地后端，而是组合三个部分：

1. 一个现有本地存储实现，例如 `IndexedDBStorageProvider`
2. 一个负责 Push/Pull 的 `SyncEngine`
3. 一个保存同步游标与同步状态的轻量状态仓库

建议新增文件与签名：

```ts
// /Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/ISyncTransport.ts
export interface SyncPullResult {
  conversations: Conversation[];
  nextCursor: number | null;
}

export interface SyncPushResult {
  processedIds: string[];
  nextCursor?: number | null;
}

export interface ISyncTransport {
  pull(cursor: number | null): Promise<SyncPullResult>;
  push(conversations: Conversation[]): Promise<SyncPushResult>;
}
```

这里的 `pull/push` 调用都隐含当前 `syncKey` 上下文。服务端必须基于 `syncKey` 隔离数据，客户端不得请求或接收其他命名空间下的会话集合与同步游标。

```ts
// /Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.ts
export interface SyncStorageProviderOptions {
  localStore: IStorageProvider;
  transport: ISyncTransport;
  syncKey: string;
  initialCursor?: number | null;
}

export class SyncStorageProvider implements IStorageProvider {
  constructor(options: SyncStorageProviderOptions);

  saveConversation(chat: Conversation): Promise<void>;
  getConversation(id: string): Promise<Conversation | null>;
  getAllConversations(): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;

  hydrate(): Promise<void>;
  syncNow(): Promise<void>;
}
```

**涉及文件**

- [packages/core/src/interfaces/IStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts)：补充同步元数据类型。
- [packages/core/src/interfaces/ISyncTransport.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/ISyncTransport.ts)：新增远端同步 transport 契约。
- [packages/core/src/providers/SyncStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.ts)：新增 Local-First 存储实现。
- [packages/core/src/index.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/index.ts)：导出新的同步接口与 provider。
- [packages/core/config.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/config.ts)：补充 `syncKey` 配置项或其运行时读取入口。

**原因**

- 上层 `useChatStore` 和历史工作台逻辑已经稳定依赖 `IStorageProvider`，保持接口不变可以把同步能力压缩在底层。
- `phase-7.md` 的核心不是让 UI 感知“正在同步”，而是让 UI 永远面对一个快速可用的本地存储，再由后台引擎默默对齐远端状态。
- 用 `syncKey` 做命名空间比完整登录系统更轻，适合当前阶段快速验证多端同步链路。

**备选方案**

- 方案 A：直接扩展 `IStorageProvider`，让每个宿主自己处理 `pull/push/sync`。缺点是同步复杂度上浮到 UI/宿主层，违背“静默同步”的目标。
- 方案 B：只做一个远端优先的 `RemoteStorageProvider`。缺点是在线请求会直接进入会话保存与读取关键路径，无法满足 Local-First 体验。

### 决策 2：保留 `Conversation` 聚合模型，把同步元数据附着在会话级别，而不是立即拆成独立 Message 实体

**选择**

在当前阶段，沿用现有 `Conversation` 结构，把同步元数据定义为会话级字段；消息仍然存放在 `messages` 数组中。新增或调整的类型建议如下：

```ts
export interface ConversationSyncState {
  dirty?: boolean;
  deleted?: boolean;
  syncedAt?: number | null;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: Array<{ role: 'user' | 'assistant', content: string, id: string }>;
  sync?: ConversationSyncState;
  // 现有 backendId/sourceType/externalId 继续保留
}
```

删除流程不再立即物理移除，而是先写入 `sync.deleted = true` 并更新时间戳；只有在远端确认并且本地清理策略满足时才允许物理裁剪。
`compare` 字段在本阶段继续允许保留于本地对象中，但同步引擎 MUST 忽略该字段，不将其纳入 Push/Pull 载荷。

**涉及文件**

- [packages/core/src/interfaces/IStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts)：为 `Conversation` 增加同步元数据。
- [packages/core/src/providers/IndexedDBStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/IndexedDBStorageProvider.ts)：适配新字段持久化。
- [packages/ui/src/store/chat.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts)：在读取列表时过滤或识别软删除状态。

**原因**

- 当前仓库所有持久化和导入逻辑都围绕“完整 Conversation 对象”工作，继续以聚合对象作为同步单位改动最小。
- `phase-7.md` 中的 `Message` 独立实体更适合后续大规模同步和精细冲突处理，但不是落地首版 Local-First 的必要前提。

**备选方案**

- 方案 A：立即拆出 `Message` 表。优点是更细粒度；缺点是几乎会重做整个存储、渲染和导入链路。
- 方案 B：完全不引入 `dirty/deleted` 元数据，只靠内存队列同步。缺点是页面刷新或断网恢复后无法可靠判断哪些本地修改未上云。

### 决策 3：同步引擎采用“本地脏标记 + 游标拉取 + LWW”机制，先解决可用性与一致性

**选择**

同步引擎遵循 `phase-7.md` 的主策略，但落到当前仓库时只同步 `Conversation` 聚合：

- `saveConversation`：先写本地，再把 `sync.dirty = true`、`updatedAt = now()` 写回
- `deleteConversation`：改为写软删除标记并置脏
- `hydrate()`：在每次启动时扫描本地会话，将普通聊天会话与已导入外部历史中“缺失同步元数据”或“仍为 dirty”的记录统一纳入待推送集合，再执行 push/pull
- `syncNow()` Push：查询全部 `sync.dirty === true` 的会话，剔除 `compare` 载荷后发送到当前 `syncKey` 的远端 `/api/sync/push`
- `syncNow()` Pull：读取当前 `syncKey` 下的本地 `lastSyncCursor`，调用 `/api/sync/pull` 拉取 `updatedAt > cursor` 的增量会话
- 冲突策略：同一 `id` 的会话使用 `updatedAt` 做 LWW 合并，时间更晚的一方覆盖较早版本

这里的“启动时扫描未同步 backlog”是本次需求新增的补偿机制：

- 若本地会话 `compare` 存在，则继续只做本地持久化，不参与 backlog 补推
- 若本地会话缺失 `sync` 字段，系统 MUST 将其视作“尚未同步”并在初始化时标记为 dirty
- 若本地会话已经带有 `sync.deleted = true`，系统 MUST 继续按软删除语义参与 push，而不是跳过
- 若本地会话已经有 `sync.dirty = false` 且存在有效 `syncedAt`，系统 MAY 视其为已同步记录，不做重复补推

建议新增内部方法：

```ts
private markDirty(chat: Conversation): Conversation;
private markPendingUnsyncedConversations(): Promise<void>;
private mergeRemoteConversation(remote: Conversation): Promise<void>;
private listDirtyConversations(): Promise<Conversation[]>;
```

**涉及文件**

- [packages/core/src/providers/SyncStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.ts)：实现 Push/Pull/LWW 与游标推进。
- [packages/core/src/providers/IndexedDBStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/IndexedDBStorageProvider.ts)：支持查询和保存带同步状态的会话。
- [packages/core/src/providers/SyncStorageProvider.test.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.test.ts)：补同步单测。

**原因**

- 游标 + LWW 是和 `phase-7.md` 一致的最小闭环，足以覆盖断网写入、恢复联网、双端冲突这几类关键场景。
- 如果不在每次启动时补推本地未同步数据，接入真实服务端后会出现“用户本地已有会话长期停留在单机、不进入远端”的行为缺口，不符合多端连续性的目标。
- 当前产品以单用户个人知识库为主，LWW 在首版原型里比 CRDT 更容易解释、测试和上线。
- 暂不同步 `compare` 历史可以降低载荷体积与冲突复杂度，先把普通会话同步链路做稳。
- `syncKey` 方案不依赖完整账号系统，能更快打通跨端同步原型。

**备选方案**

- 方案 A：实时双向 WebSocket 同步。优点是低延迟；缺点是当前宿主和后端都没有这套基础设施。
- 方案 B：手动“点击同步”模式。优点是简单；缺点是违背 Local-First 下的无感同步目标。

### 决策 4：宿主层只负责提供调度与 transport，不让 UI 直接感知同步线程和网络协议

**选择**

`apps/extension` 与 `apps/web` 都注入 `SyncStorageProvider`，但调度位置按宿主能力区分：

- Web 宿主：先在主线程中实例化 `SyncStorageProvider`，后续可平滑迁移到 Worker
- Extension 宿主：首版在扩展宿主运行时中实例化 provider，并通过定时器、可见性变化或网络恢复事件触发 `syncNow()`；若后续需要更稳定调度，再迁移到 Background
- 两个宿主在初始化 `SyncStorageProvider` 后 MUST 调用包含“本地未同步记录补偿”语义的 `hydrate()`，确保每次启动时仍遗留在本地的未同步数据会被补推到服务端
- 两个宿主都从设置读取同一个 `syncKey`，并在初始化时执行校验：开发环境可接受默认值 `0`，非开发环境若仍为 `0` 则 MUST 阻止同步初始化并提示用户配置。

远端 API 契约保持与 `phase-7.md` 一致：

```http
POST /api/sync/pull
{ "cursor": 1700000000000 }

POST /api/sync/push
{ "conversations": [...] }
```

虽然请求体不一定显式携带 `syncKey` 以外的身份信息，但服务端 MUST 基于当前 `syncKey` 将数据、游标和删除广播限制在单个命名空间中。

**涉及文件**

- [apps/web/src/App.vue](/Users/quanzhou/Workspace/ChatPrism/apps/web/src/App.vue)：改为注入 `SyncStorageProvider`。
- [apps/extension/src/App.vue](/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/App.vue)：改为注入 `SyncStorageProvider` 并绑定宿主级同步触发器。
- [apps/web/src/providerRuntime.ts](/Users/quanzhou/Workspace/ChatPrism/apps/web/src/providerRuntime.ts)：如需补远端 transport 依赖注入入口。
- [apps/extension/src/providerRuntime.ts](/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/providerRuntime.ts)：为扩展宿主构造同步 transport 与调度器。
- [packages/ui](/Users/quanzhou/Workspace/ChatPrism/packages/ui)：补设置界面或设置状态对 `syncKey` 的读取与提示。

**原因**

- 这样可以把“存储语义”和“宿主调度能力”分开，核心层只关心同步规则，宿主层才关心在哪个线程、何时触发同步。
- 考虑到当前仓库还没有成熟的 Worker/Background 同步基建，首版先允许主宿主实例化，能以最小风险验证同步语义。
- 把 `syncKey` 放在设置里可以让用户显式决定加入哪个同步命名空间，同时避免把开发默认值带入生产。

**备选方案**

- 方案 A：强制第一版就把扩展同步引擎放到 Background、Web 放到 Worker。优点是更接近最终形态；缺点是当前工程跨度过大，验证成本明显增加。
- 方案 B：让 UI store 直接发 HTTP 调用同步接口。缺点是 UI 和网络耦合，离线与本地优先语义会被破坏。

### 决策 5：在仓库内新增独立 `apps/server`，使用 Node.js + Hono + SQLite 落地同步服务端

**选择**

本次变更新增一个独立的服务端应用 `apps/server`，采用 Node.js + Hono 作为 HTTP 层，SQLite 作为原型持久化介质。服务端提供：

- `POST /api/sync/push`
- `POST /api/sync/pull`
- `GET /health`

并承担以下职责：

- 校验 `x-sync-key` 与请求体结构
- 在非开发环境拒绝默认 `syncKey=0`
- 以 `syncKey` 为命名空间隔离数据
- 使用服务端单调递增 `server_cursor` 作为增量同步游标
- 依据客户端 `updatedAt` 执行 LWW 冲突处理
- 忽略 `compare` 字段，即使客户端误传也不入库
- 处理 Web / Extension 到独立服务端的 CORS 预检

SQLite 数据模型继续围绕 `Conversation` 聚合对象构建，不拆 `Message` 表，单条记录持久化一整份标准化 conversation payload 与 `messages_json`。游标不依赖客户端 `updatedAt`，而由服务端每次成功接收 push 时在事务内递增生成，以避免客户端时钟漂移导致漏同步。

**涉及文件**

- `apps/server/package.json`
- `apps/server/tsconfig.json`
- `apps/server/src/index.ts`
- `apps/server/src/app.ts`
- `apps/server/src/config.ts`
- `apps/server/src/db.ts`
- `apps/server/src/schema.ts`
- `apps/server/src/routes/health.ts`
- `apps/server/src/routes/sync.ts`
- `apps/server/src/repositories/syncRepository.ts`
- `apps/server/src/services/syncService.ts`
- `apps/server/src/types/sync.ts`
- `apps/server/tests/sync-api.test.ts`
- `apps/server/tests/sync-repository.test.ts`

**原因**

- 当前客户端已经具备同步抽象，但没有真实服务端会导致 `syncKey` 命名空间、增量游标、CORS 和持久化行为无法验证。
- 新增独立 `apps/server` 能让 Web 与 Extension 共用同一 API，而不把静态宿主与同步后端耦合到同一工程里。
- Hono + SQLite 足够支撑本次原型需求，改动面和维护成本都明显小于一开始就引入 Postgres、ORM 和迁移系统。

**备选方案**

- 方案 A：把 API 嵌入 `apps/web`。优点是少一个 app；缺点是静态宿主和同步服务端耦合过深，不利于 Extension 复用。
- 方案 B：只继续保留 mock transport。优点是实现快；缺点是本次 change 无法交付真实同步闭环，也无法验证服务端隔离与持久化。

## Risks / Trade-offs

- [会话聚合同步导致单次 Push 载荷较大] → 首版接受以 `Conversation` 为同步单位，并暂不同步 `compare` 字段；后续若数据规模成为瓶颈，再演进到消息级拆分。
- [启动时补推本地旧数据可能触发较大 backlog Push] → 接受补推成本，但仅针对普通聊天会话与已导入外部历史；`compare` 继续排除在外。
- [LWW 会覆盖并发编辑较早的一端] → 在 PKM 单用户场景下先接受该策略，并保留后续升级冲突提示的空间。
- [软删除要求 UI 和列表逻辑配合过滤] → 在 `chatStore` 层统一处理，避免散落在多个视图组件里。
- [扩展与 Web 的同步调度能力不完全一致] → 保持调度器注入式设计，让宿主差异停留在组合层而不是核心存储契约中。
- [`syncKey` 默认为 `0` 被误用于生产] → 运行时必须按环境校验，只有开发环境允许 `0`，否则阻止同步初始化并提示用户配置真实 `syncKey`。
- [服务端隔离失误会造成跨命名空间数据泄漏] → 在 API contract 和联调用例中显式校验“同一 `syncKey` / cursor 仅返回当前命名空间数据”，并拒绝匿名共享游标设计。
- [`better-sqlite3` 原生依赖在某些环境下编译失败] → 本次固定采用 SQLite 原型实现；若环境编译失败，按环境问题处理，不在这次变更中引入 ORM 或改换数据库。
- [独立服务端的跨源访问失败] → 将 CORS 与 `OPTIONS` 预检作为服务端实现的一部分，并在 Web / Extension 联调用例中显式覆盖。
- [若直接复用 `updatedAt` 作为增量游标会导致漏同步] → 明确分离 `updatedAt` 与服务端 `server_cursor`：前者只用于 LWW，后者只用于增量同步。

## Migration Plan

1. 先修订 OpenSpec 工件，明确服务端实现属于本次变更交付范围。
2. 在核心层补齐同步类型、transport 抽象和 `SyncStorageProvider`，并用 mock transport 建立单测闭环。
3. 新增独立 `apps/server`，用 Hono + SQLite 落地 `/api/sync/push`、`/api/sync/pull`、`/health` 及其测试。
4. 在 IndexedDB 本地持久化路径中引入 `dirty/deleted/cursor` 所需的元数据持久化。
5. 让 Web 宿主和 Extension 宿主分别切换到 `SyncStorageProvider`，并接到真实服务端的 `syncBaseUrl`。
6. 为 `SyncStorageProvider` 增加启动补偿逻辑，确保本地已有但未同步的普通会话与已导入外部历史会在每次启动时自动补推到服务端。
7. 最后补齐 Web / Extension 与真实服务端之间的联调验证，覆盖 `syncKey` 隔离、CORS、断网恢复、多端冲突、软删除回放和本地旧数据补推。

## Open Questions

当前设计中的关键实现决策已经固定：

- `lastSyncCursor` 按 `syncKey` 维度持久化，不额外引入 workspace 分区。
- `syncKey` 继续走当前静态配置 / 运行时读取入口，不单独新增设置系统。
- Extension 首版继续在宿主页内调度同步，后续若需要再迁移到 Background。
- 当远端返回 `deleted = true` 的会话时，当前 UI 维持隐藏策略，不在本次变更中引入回收站视图。

因此本次变更没有阻塞实现的开放问题。
