[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# 架构总览

本文描述 JARVIS 的整体结构：可部署宿主、代码分层与依赖边界、插件系统，以及若干关键设计决策。多种运行形态（浏览器扩展、Web、桌面应用）共享核心工作区 UI 和插件系统契约，但在环境接入和能力暴露上有所不同。

## 1. 可部署单元 / 宿主

可独立运行、部署的单元；它们是运行时外壳，向业务暴露其作为基础设施的能力，不拥有任何业务相关逻辑。

- Browser Extension App

- Web App：浏览器 / PWA 宿主；生产态由 Sync Server 同源静态托管，离线时依赖 Service Worker 预缓存的应用壳与文档只读缓存

- Desktop App

- Sync Server： 暴露会话同步 API、上下文 API 和 provider 配置接口。将共享契约连接到基于文件系统或数据库的持久化实现，是远程上下文与数据同步的后端边界。

## 2. 代码组织与分层边界

各层的模块、职责与依赖方向如下表。原则是：环境接入归宿主，核心基本工作区（节点树+markdown文档）前端归 `packages/ui`，其他领域业务归插件，全局共享契约归 `packages/core`。

| 模块 | 职责分配 | 依赖 |
|---|---|---|
| `apps/*`（宿主）<br/>（web / desktop / extension） | 运行时外壳与组合根：生命周期、bridge、存储、文件系统、浏览器能力等环境接入；在入口点将控制权交给 `ui`，不负责插件的启用与装配 | → `ui` / `core`（不直接依赖 `plugins` / `plugin-system`） |
| `apps/server` | 会话与上下文同步后端：暴露会话同步 API、上下文查询与写入接口；适配文件系统持久化；承载服务端专属外部集成（如日历同步、导入抓取）；是远程 UI 与本地数据的同步边界 | → `core` / `node`；编译期依赖 `@plugins/ai-agent`（暂缓迁移至通用 CRUD API） |
| `packages/ui` | Markdown 文档工作区核心前端层：工作区壳、布局容器、文档树交互、文档打开/编辑/保存、通用展示组件、扩展点渲染；负责装载插件系统 | → `plugin-system` / `core`；可消费宿主暴露的环境事实与 context；不承载 AI / 任务特有的工作流、store 或业务规则 |
| `packages/plugin-system` | 插件系统：插件注册、启用、装配，运行时上下文构建，插件运行时编排 | → `core`；理想情况下不编译依赖 `plugins`，通过动态 / 运行时加载（按 `core` 中的插件契约） |
| `packages/core` | 跨包最小稳定契约、插件契约、宿主无关的通用基础设施 | 不依赖任何上层；不长期保留 AI / 任务的领域契约 |
| `packages/node` | Desktop main 与同步服务复用的 Node-only 适配层与基础设施实现；当前仅承载本地文件上下文链路 | → `core` |
| `plugins/*` | AI / 任务等领域能力：领域模型、工作流、store、业务视图、能力特定规则 | → `core`（实现其插件契约）；过渡期允许复用 `ui` 暴露的稳定渲染层接口，但不应依赖 `ui/src/*` 内部实现；理想情况下不对外暴露 `api`，也不被任何包编译期依赖 |

依赖链为 `apps → ui → plugin-system ⇢ plugins`：宿主在入口点把控制权交给 `ui`，由 `ui` 装载 `plugin-system`，再由 `plugin-system` 在运行时按插件契约动态加载、注册并装配 `plugins`（`⇢` 表示运行时加载，而非编译期依赖）。宿主因此与具体插件解耦，仅依赖 `ui` 与 `core`。


**通用依赖原则：**

- 当运行环境差异会影响上层行为时，宿主应将其暴露为**环境属性、能力句柄或 context**，由上层就地消费，而不是在宿主内部直接编写业务分支。
- 对于受控页、登录页、浏览器自动化这类必须由特定宿主承载的运行时注入点，宿主也只负责暴露**通用容器能力与桥接壳**；provider-specific 的概念、命名、页面桥接协议与业务流程仍归插件所有，不应沉积在宿主层。
- 对容易模糊的运行时概念、bootstrap 结果对象或 UI 壳层对象，默认遵循“**不为未来设计，需要时再重构拆分，否则按简单的来（类越少越好）**”的原则；只有当当前职责已经明显不同，才引入新的独立类型或壳层。
- 宿主不直接依赖 `plugins` / `plugin-system`，也不负责插件的启用与装配；插件的注册与装配由 `plugin-system` 负责。
- 插件之间、以及 `plugin-system` 与具体插件之间的交互均通过 `core` 中定义的插件契约完成；过渡期可复用 `ui` 的稳定公开导出用于渲染集成，但不应依赖 `ui/src/*` 内部实现；理想情况下插件无需对外暴露 `api`，也不应被任何包编译期依赖。
- `packages/core` 不依赖任何上层；属于 AI 或任务能力的领域契约不应沉积在此。
- `packages/node` 只承载真正被多个 Node 宿主复用的基础设施；若某能力仅由 `apps/server` 使用，则应直接归属 `apps/server`，而不是继续沉积在 `packages/node`。
- AI、任务以及未来新增能力的业务逻辑归属于各自插件，不应继续沉积在 `packages/ui` 中。
- 知识资料库即使部署在本地，也仍然被视为外部依赖（见第 5 节）。

## 3. 插件系统

### 3.1 plugin-system 的定位

- `packages/plugin-system` 是插件系统的实现层，负责插件注册、启用与装配、运行时上下文构建，以及插件运行时编排。
- 它由 `packages/ui` 在工作区初始化时装载；宿主不直接依赖它，也不参与插件的启用与装配。
- 它只编译依赖 `packages/core`，理想情况下不在编译期依赖具体 `plugins`，而是在运行时按 `core` 中定义的插件契约动态加载插件，从而成为「核心工作区前端」与「具体领域插件」之间的解耦层。

### 3.6 packages/node 的收敛边界

- `packages/node` 的存在前提是“同一份 Node-only 实现需要被多个 Node 宿主复用”。
- 当前它应只保留本地文件上下文链路，例如本地文件上下文 provider 与其配套的文档身份索引等。
- Google Calendar 同步、Bilibili 字幕抓取这类仅由 `apps/server` 使用的实现，不再放在 `packages/node`，而是直接归属 `apps/server`。任务存储已不再是文件形态——任务与会话一样，以 hub 上的 SQLite 为真值，经同步 API 复制到各端（见 4.4）。
- Desktop 不再为 Bilibili 导入提供 main-process 直连桥；插件统一通过 `apps/server` 暴露的 `/api/import/*` 后端接口完成导入抓取。

### 3.2 插件的定位与边界

- `plugins/*` 拥有领域模型、工作流、store、业务视图以及能力特定规则。
- AI、任务及未来新增的能力均以插件形式承载；其业务状态机与工作流编排不应外泄到宿主或 `packages/ui`。

### 3.3 插件契约与隔离

- 插件通过实现 `core` 中定义的插件契约接入系统，由 `plugin-system` 在运行时发现并加载。
- 理想情况下插件**无需对外暴露 `api`**——没有其他模块需要直接消费插件，交互全部经由契约与运行时 context 完成。过渡期若插件需要复用工作区渲染层能力，应优先依赖 `@packages/ui` 的稳定公开导出，而不是 `@packages/ui/src/*`。
- 插件内部实现完全留在插件目录内部，不被任何包编译期依赖，也不应有人依赖其内部实现路径。

### 3.4 插件与宿主 / UI 的协作

- 插件可以消费宿主暴露（经 `plugin-system` 构建的运行时 context）的环境事实，并据此决定能力相关的行为。
- 即使某些页面桥接能力只能通过宿主进程完成注入，宿主也只应提供通用注入容器；何时注入、注入何种 provider-specific 桥接、以及桥接后的业务行为，均由插件决定。
- 扩展点的渲染层由 `packages/ui` 消费，插件通过扩展点将业务视图注入核心工作区。

### 3.5 启用与装配

- 插件的启用与装配由 `plugin-system` 负责，发生在 `ui` 装载插件系统的阶段，而非宿主组合根。
- 宿主只在入口点把控制权交给 `ui`，并向上暴露环境事实供 `plugin-system` 构建运行时 context；业务判断仍留在插件内部。

## 4. 关键设计决策（ADR）

### 4.1 Markdown 文档编辑策略

markdown viewer（Milkdown / ProseMirror）编辑的是结构化文档树，而文档的真值仍是磁盘上的原始 markdown 字符串。任何"viewer 光标 → 源码字符偏移"的映射在原理上都不稳定——Milkdown 是 WYSIWYG 编辑器，本身不维护"文档树 ↔ 原始字节流"的源映射。

**决策**

viewer 模式下的插入操作（文档工具栏触发的链接 / 会话引用 / 资源嵌入）通过 Milkdown 的 parser 解析为节点，作为原生 ProseMirror transaction 派发；新的 markdown 源由 Milkdown 的 serializer 整篇重新生成。不再尝试任何"viewer → 源码"的坐标换算。

**影响**

- 插入位置在任意块类型上都准确，包括空段落与 raw HTML 邻位。
- 打开文档后的首次插入可能规范化格式（强调标记风格、列表符号、连续空行合并等），产生较大的初始 git diff。后续编辑稳定，因为 serializer 输出是确定性的。
- edit 模式（纯 textarea）继续在源字符串上直接 splice，在需要字节级真值时保留这条路径。
- 这是 `packages/ui` 内部决策，不影响同步服务契约或跨宿主接口。

### 4.2 文档身份标识与节点移动

**概述**

每个 markdown 文档在 YAML frontmatter 中写有一个稳定的 ULID，键名为 `jarvis_id`。无论文件路径如何变化，该 ID 始终是文档的不可变规范标识。

**身份标识分配**

- 首次打开时，内存中的文档身份索引会检查 frontmatter 中是否存在 `jarvis_id`；若不存在则生成并写回。
- 索引仅保留在内存中（`path → id` 与 `id → path` 双向映射）。没有独立的持久化索引文件；源码 frontmatter 才是真值。
- Milkdown 编辑器通过以文档实例为键的 WeakMap 将 frontmatter 在展现层剥离，序列化时再还原。用户不会看到也不会直接编辑 `jarvis_id`。

**移动 / 重命名策略（零成本）**

节点移动或重命名时：

1. 仅更新内存中的文档身份索引。
2. 不写数据库、不改路径列。会话和任务记录中原有的 `documentIds[]` 条目保持不变，依然与文档 frontmatter 中的 ULID 匹配，和文件当前位置无关。
3. 节点移动链路带有跨 Agent 守卫：当另一个 Agent 进程持有文件锁时应拒绝重命名，防止并发访问导致身份标识分裂。

**查询路由**

所有上下文查询均以 **`documentId` 优先**：

- 服务端：有 `documentId` 时优先按稳定文档标识查询；`documentPath` 仅作为早期记录的降级回退。
- 客户端：当前文档关联的会话列表同时接受“路径命中”与“稳定文档标识命中”两类匹配。这一双重匹配守卫处理了移动操作与下一次异步数据重载之间的窗口期，确保重命名后会话依然立即显示。

**出链重写**

工具栏写入文档的链接（会话引用、资源嵌入）使用相对于仓库根目录的标准相对路径。`references/` 目录受保护，其内容不受链接重写操作影响。

### 4.3 Server 单独进程 + Renderer 相对路径 / Hub 直连并存

**概述**

`apps/server` 是独立进程，是上下文 / 同步 / provider 配置 / codex 的唯一后端。Desktop 不内嵌 HTTP server，依赖方向恒为 **desktop → server**：server 编译期与运行期都不感知 desktop，只接收一个通用静态根目录配置（`CHATPRISM_RENDERER_DIST`），将其等同于 nginx 的 `root`。

**决策**

Desktop 存在两种受支持的运行形态：

- **server-origin / dev-server 模式**：renderer 与 API **同源**，所有 `/api/*` 走**相对路径**。
- **local-bundle 模式**：renderer 从本地 bundle 加载，main 进程向 renderer 注入绝对 hub URL；文档工作区通过 IPC 访问 main 进程持有的本地文件上下文能力，而不是把远端 `/api/context` 作为主链路；远程 sync/codex 通过 main 代理链路访问远程 hub（当前部署为 NAS，见 4.4）。

- **dev**：renderer 由本地开发服务器托管，并将 `/api`、`/health` 等请求代理到本地 server。
- **server-origin / prod / e2e**：renderer 由 server 静态托管，renderer 与 API 天然同源；web2 的 PWA / 离线 E2E 也必须跑在这一模式下，才能真实覆盖 Service Worker 预缓存与运行时缓存。
- **local-bundle / desktop 生产模拟**：main 进程直接装载本地 bundle，并通过环境注入向 renderer 提供真实 hub URL。
- 若 main 未注入显式 hub URL，renderer 仍会回退到 `/api/context`、`/api/sync`、`/api/codex`、`/api/provider-configs` 这些相对默认值。
- Desktop 的离线边界分层处理：文档树 / 文档读写 / 节点 CRUD / 作用域搜索依赖本地文件上下文能力；`sync`、`codex`、`provider-configs` 仍属于在线能力，不承诺离线可用。
- 资源 / 附件层与文档正文分开看待：markdown 源文件继续持久化相对路径引用（如 `references/...`）；desktop viewer 可在渲染期将本地资源解析为临时本地 URL（例如 `blob:`）以支持离线访问，但这种运行时 URL 不写回文档，因此不影响 Obsidian、外部 agent、git、Dropbox 等直接读取文件结构的第三方。

**影响**

- 同源模式下彻底消除跨源 CORS；local-bundle 模式下则通过 main 代理 fetch 绕开 renderer 侧 CORS。
- `document-asset` 是一种兼容的 HTTP 资源表达，但不是 desktop 本地资源访问的唯一长期形态；desktop 可直接从本地文件域解析资源，而不要求资源层继续依赖远端或本地 server 的 `/api/context/document-asset`。
- CSP 只需 `img-src 'self'` 即可放行 `document-asset` 图片等本地资源，无需为 `http://127.0.0.1:*` 开特例；desktop 若在渲染期使用 `blob:` 本地资源 URL，则该 URL 仅是 viewer 内部实现细节，不改变文件域真身。
- 相对路径对部署端口 / host 无感知，迁移与打包更稳健。
- Web 宿主的离线边界是"静态壳 + 最近读取文档的只读缓存 + IndexedDB 中的会话/任务副本"；文档真身仍在文件域，不把浏览器缓存提升为主存。

### 4.4 单一 Hub 部署：NAS Server + Dropbox 文件同步 + 数据库记录同步

**概述**

在实际部署的拓扑中，`apps/server` 只有**唯一一个**运行实例——托管于 NAS 上的一个 Docker 容器，而不是每台机器各跑一份。所有需要在线后端的能力都收敛到这一个实例；Mac 本地的 `dev:server` 仅作为同一份代码的开发/调试镜像，从不是第二个生产 hub。

**决策**

- **Server**：唯一的、部署在 NAS 上的 `apps/server` 实例即 hub。Web（桌面与手机浏览器）由该实例同源托管，直接调用其 `/api/*`；desktop 在 local-bundle 模式（见 4.3）下的 `sync`、`codex`、`provider-config` 流量同样指向这一个实例，而文档访问仍走本地 IPC。
- **文件（knowledge root）**：knowledge root 保持纯文件树形态。hub 与各台 desktop 机器之间由 Dropbox 各自独立同步（NAS 侧一个 Dropbox 客户端，Mac 侧另一个）——Dropbox 是同步机制本身，不是 JARVIS 实现的能力。hub 经 `/api/context` 把这棵树提供给 Web/手机；desktop 则通过 4.3 所述的 IPC 版 `FileSystemContextProvider` 读写自己本地的 Dropbox 同步副本，从不经由 hub 的 HTTP context API。
- **记录（会话与任务）**：两者的真值均为 hub 上的 SQLite，存放目录刻意置于 Dropbox 同步的 knowledge root **之外**——文件同步工具不理解 SQLite 的 write-ahead log，若放入同步目录可能导致其损坏。每个客户端（Web、Desktop、Extension）都持有 local-first 副本（IndexedDB），通过同一套同步模式与 hub 对账：变更即推、启动补推、窗口重新获得焦点或变为可见时再补推一次（带节流），按 `updatedAt` 逐记录合并（last-write-wins）。该模式在会话（`SyncStorageProvider`）与任务（`ReplicaTaskService`）上实现完全一致；不再存在基于文件的任务 provider。

**影响**

- 一旦各端都完成过一次同步，会话与任务会在所有设备上收敛为同一状态。手机上完成一个任务后，desktop 要等它的副本下一次 pull 才能看到；若某端窗口始终保持前台且未重新获得焦点，会在下一次同步前一直显示陈旧数据。
- knowledge root 在 hub 与每台 desktop 机器上都仍是一等公民的文件域产物：Obsidian、git、外部 agent 以及 `codex` CLI 都可以直接操作任一侧的 Dropbox 同步副本。
- 把 SQLite 放在同步目录之外，意味着 Dropbox 永远看不到、也碰不到它，消除了当初"记录不能进文件域"这条设计动机所针对的损坏风险。
- `my-README.md` 中"开发态"一节记录的 Mac 本地 server 不属于生产拓扑，它的唯一作用是在变更部署到 NAS 之前，用同一份 server 代码复现与调试问题。

## 5. 运行时与外部依赖链路

- Web、Extension、Desktop 通过共享运行时契约调用外部模型提供方。
- Extension 和 Desktop 还会桥接浏览器控制页面以访问 ChatGPT 和 Gemini 历史。
- Sync Server 与 Desktop 宿主都可以通过文件系统适配层访问知识资料库；知识资料库即使部署在本地也视为外部依赖。在当前部署中，这个文件系统由 Dropbox（见 4.4）在 hub 与各 desktop 机器之间保持一致，这是 JARVIS 之外的外部机制。

## 6. 多模型协作与 DOM 自动化 Provider

### 6.1 整体定位

本节描述两个彼此正交的新增能力（均借鉴自 openteam）：

- **Group Provider**：在一个 JARVIS 会话内让多个模型并发协作应答。
- **DOM 自动化 Provider**（仅 desktop）：直接驱动真实 ChatGPT/Gemini 页面，而非逆向其 HTTP 后端，从而对协议变更更具韧性。

二者均通过实现 `IModelProvider` 契约接入系统，store / 持久化 / 发送主链路**完全不变**。

### 6.2 Group Provider

- **定位**：以一个专用 provider 身份在单个会话内编排多个模型并发协作。
- **编排语义**：
  - 无 `@name`：广播，预设内所有成员并发应答（`Promise.all`）。
  - `@成员名`（可多个）：仅点名成员应答，仍并发；成员名单展示于输入区下方的模型工具区，每个模型统一提供受控窗口链接、选择 checkbox 与 `@name` 快捷链接。
  - 同轮各成员看不到对方「本轮」回复；跨轮可见上一轮合并 transcript（经 `options.history` 传入）。
- **输出**：按成员分段的合并 transcript（`### {成员名}\n{文本}`），作为单条 assistant 消息返回。
- **成员解析**：成员 provider 由统一运行时按 provider 标识解析；Group 侧不保留 provider-specific 特判。
- **本期成员**：仅 DOM 预设 `dom-group`（`chatgpt-dom` + `gemini-dom`），`web_search` option 透传给各成员。
- **注册**：通过统一的 provider 解析入口按需构造，不把这类编排逻辑扩散到宿主层。

### 6.3 DOM 自动化 Provider

- **定位**：DOM 自动化 provider 仅在 desktop 能力可用时启用，由插件主动消费宿主暴露的 `controlled-page` 能力；宿主不拥有 provider-specific 概念或页面逻辑。
- **传输层**：provider 通过通用 `controlled-page` 能力完成开页、注入、求值与事件订阅，自身不依赖宿主内部实现细节。
- **联网开关**：`web_search` 这类模型选项由插件映射到站点原生能力。支持独立搜索开关的站点按其原生开关处理；默认具备搜索能力或将深度研究视为另一套模式的站点，则不把两者混同。
- **流式回传**：provider-specific 页面桥接在受控页内常驻观察器，经 页→主→渲染 IPC 推送带请求边界的事件流；超时后降级为一次性读取。宿主只负责承载通用受控页容器与事件转发，不拥有这些 provider-specific 页面桥接概念本身。
- **会话连续性**：首轮在目标站点开启新对话；后续轮优先复用当前受控页继续追问。

### 6.4 受控页事件订阅能力

受控页能力需要支持按 provider 维度的事件订阅。

链路原则：provider-specific 页面桥接在受控页内产生命令与事件，宿主只负责通用 preload / IPC / 生命周期转发，最终由插件消费该事件流完成业务行为。
