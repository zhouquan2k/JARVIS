[English](proposal.md) | 中文

## Why(为什么)

JARVIS 目前每台机器都要跑一个本地 server;会话存在各 server 独立的 SQLite 里、永不合并;全部任务挤在单个 `tasks.json` 中,在多端文件同步下极易冲突。移动端(响应式 web2)访问已经就绪,现在需要一个新拓扑:由一台常开的 hub 独占全部记录数据(会话 + 任务),文档保持纯文件形态由 Dropbox 同步,桌面端离线完整可用——同时不把无鉴权的 server(`/api/codex` 可执行本机命令)暴露到公网。

完整架构与决策记录见 `docs/online-refactor.md`(D1–D9)。阶段 0(VPS + Tailscale + Dropbox)**已部署完成**。本 change 实施路线图阶段 1–4;阶段 5(全局搜索/RAG)**明确不实施**(设计存档备查)。

## What Changes(改什么)

- **阶段 1 —— 日常流量全面切到 VPS;本地 server 仅保留为开发模拟器(纯配置)**:手机 web2 与浏览器访问都使用唯一 VPS server(经 Tailscale 可达)承载会话与文档。desktop 以模拟生产的方式直接指向 VPS,而 **Mac 本地 server 不再进入任何日常使用链路**。本地 server 仍保留给开发环境使用,尤其用于 web2 热更新与 API 调试时模拟 VPS。本地文件仍保留,经 Dropbox 与 VPS 同步(Obsidian/本地编辑器照常可用)。本阶段的验收重点是 sync/context 收敛与 NAS 上的 amd64 server 部署自动化,`codex` 迁移暂时不纳入目标。过渡期限制(至阶段 3):Mac 离线时 JARVIS 界面不可用,离线改文档走 Obsidian 直接编辑本地文件。
- **阶段 2 —— 任务迁入记录域**:任务从 `tasks.json`(文件域)迁入 hub SQLite,按既有 sync 协议模式同步到客户端(IndexedDB 副本、cursor + dirty 标记、按 `updatedAt` 的单任务 LWW 合并)。包含服务端任务白名单 normalizer、一次性 `tasks.json` → DB 迁移、Google Calendar 同步迁至 hub。任务视图在所有端离线可用。
- **阶段 3 —— 桌面文件域 IPC 化,恢复离线能力**:Electron renderer 改由本地打包加载(不再依赖 server origin);文档经 IPC 版 context provider 访问(main 进程持 `FileSystemContextProvider`,`conversationQueryProvider=null`),读取本地 Dropbox 副本;sync HTTP 经 main 代理 fetch;bilibili 导入迁 IPC;codex 保持走 VPS(无本地通道)。桌面启动流程 **BREAKING**(完全无本地 server)。
- **阶段 4 —— 手机 web2 / PWA 就绪**:保留 Service Worker 离线壳、最近浏览文档只读缓存与 manifest 代码能力,但本次 change 的最终验收只要求手机**在线模式**可用;真机离线与主屏幕 standalone 启动延后到后续 change(需先具备 HTTPS / secure-context 入口)。
- 范围外:阶段 5(全局搜索/RAG——明确不实施)、投影物化(D8 第 3 级)、应用级鉴权。

## Capabilities(能力)

### 新增能力

- `task-record-sync`:任务以记录形态存于 hub 数据库并复制到客户端——hub 侧任务存储与同步端点、客户端 IndexedDB 副本(离线读写)、单任务 LWW 冲突解决、`tasks.json` 一次性迁移、Calendar 同步落 hub。

### 修改能力

- `sync-server`:sync API 从仅会话扩展到任务资源(push/pull + 独立 cursor),含与会话 normalizer 同约定的任务白名单 normalizer(delta 为纯新增——会话行为不变)。
- `desktop-host-app`:桌面无本地 server 进程运行——renderer 本地打包加载、文档经 IPC 交付的 context provider、记录 sync 经 main 代理 fetch 到远程 hub(delta 为纯新增——既有机制无关的 context provider 契约不变)。
- `web2-host-app`:web2 增加 PWA 行为与在线移动端能力——保留 Service Worker 应用壳离线启动、文档只读缓存、可安装 manifest 这些新增代码,但本次验收口径收敛到手机在线模式可用。

说明:`sync-storage-provider` 与 `task-provider-contract` 不动——任务副本是 `task-record-sync` 内的新组件(设计决策 D-2),`TaskService` 契约保持不变。

## Impact(影响)

- **Server**(`apps/server`):sync 路由/repository/schema 新增任务表 + 端点 + normalizer;Calendar 同步接线随 hub 配置。
- **插件**:`plugins/task-mgr` 数据层切换为副本型 provider;`plugins/ai-agent` 同步传输不变(目标 URL 按构建可配)。
- **桌面**(`apps/desktop2`):renderer 加载方式、context provider 与导入的 preload/IPC 面;移除 server-origin 依赖。
- **Packages**:`packages/node` 的 `FileSystemContextProvider` 复用于 Electron main(`conversationQueryProvider` 已支持 null);`packages/core` 的 hub URL 配置。
- **文档/运维**:`my-README.md` 启动流程、NAS 的 amd64 部署脚本;`docs/online-refactor.md` 保持为架构事实源。
- **数据迁移**:`tasks.json` 一次性导入 hub SQLite;会话无需迁移(hub 指定是配置行为)。
