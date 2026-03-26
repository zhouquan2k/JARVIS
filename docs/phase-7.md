# ChatPrizm 多端数据同步架构设计文档

## 一、 需求背景与目标

**1. 业务背景**
ChatPrizm 旨在成为重度 AI 用户的个人知识管理 (PKM) 工具。随着本地历史记录功能的完善，用户在多设备（浏览器插件、Web 端、未来的 App 端）之间无缝切换、共享聊天记录存储成为了核心刚需。

**2. 核心目标**
* **多端一致性**：实现跨设备的 Conversation 和 Message 数据的双向同步。
* **极致性能体验**：拒绝传统的“云端优先 (Remote-First)”带来的网络 Loading 延迟，采用 **“本地优先 (Local-First)”** 架构，确保 UI 响应的毫秒级体验。
* **离线与弱网可用**：在网络不佳或离线状态下，用户依然可以完整进行历史记录的搜索、查看和后续提问。

---

## 二、 核心架构设计 (Local-First 演进)

基于系统现有的分层架构，我们不改变 UI 层和核心业务逻辑，而是通过升级 `IStorageProvider` 来实现静默的云端同步。

### 1. `SyncStorageProvider` 代理模式
在 `packages/core` 中，我们将原有的本地存储实现升级为 `SyncStorageProvider`。
* **对上层 (UI/Runtime)**：它完美实现了 `IStorageProvider` 接口。UI 层“以为”自己只是在操作一个极速的本地数据库，无需处理任何网络 Loading 或重试状态。
* **对底层**：它内部封装了两个核心模块：
  1. **本地数据库 (Local DB)**：如 IndexedDB，负责承接所有实时的读写请求。
  2. **同步引擎 (Sync Engine)**：在独立线程（如浏览器插件的 Background 脚本 或 Web Worker）中运行，负责在后台默默地与 Remote 服务端进行增量数据的 Push 和 Pull。

原有的 StorageProviders 继续专注于把 IndexedDB 的读写性能做到极致。
新的 SyncStorageProvider 专注于处理 dirty 标记、时间戳比对和网络请求的调度。两者互不干扰。

---

## 三、 数据模型升级 (Data Model)

为了支持增量同步和冲突解决，需要对现有的 `Conversation` 和 `Message` 实体 引入以下同步元数据字段：

| 字段名 | 类型 | 作用域 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | 全局 | **必须**由前端在创建时生成全局唯一 ID，脱离数据库自增主键限制。 |
| `updated_at` | Timestamp | 全局 | **核心：时间戳游标**。每次修改数据时更新，用于增量同步和判断冲突。 |
| `dirty` | Boolean | 本地专用 | **核心：脏数据标记**。`true` 表示该条目已在本地创建或修改，但尚未成功推送到云端。 |
| `deleted` | Boolean | 全局 | **软删除标记**。真实的物理删除会导致其他端无法感知删除动作，必须使用软删除来广播状态。 |

---

## 四、 同步引擎与状态机机制

同步引擎负责在客户端（本地）和服务端之间流转数据，核心策略为 **增量游标 + Last-Write-Wins (最后写入胜出)**。

### 1. 上报工作流 (Push - 解决本地变更上云)
* **触发机制**：UI 产生新数据写入本地后，标记 `dirty: true`。同步引擎通过防抖（Debounce）或定时轮询被唤醒。
* **执行动作**：
  1. 引擎从本地数据库查询所有 `dirty === true` 的记录（Conversation 或 Message）。
  2. 将这些记录打包为批量请求发送给服务端的 Push API。
  3. 收到服务端成功 ACK 后，将本地这些记录的 `dirty` 标记重置为 `false`。

### 2. 拉取工作流 (Pull - 解决云端变更下发)
* **触发机制**：应用启动时、恢复网络连接时、或长连接收到服务端变更通知时。
* **执行动作**：
  1. 引擎读取本地记录的最后一次成功同步的时间戳 `last_sync_timestamp`。
  2. 携带该游标请求服务端的 Pull API。
  3. 服务端仅返回 `updated_at > last_sync_timestamp` 的记录。
  4. 引擎将获取到的增量数据写入本地数据库，并更新 `last_sync_timestamp`。触发本地事件总线，通知 UI 层响应式刷新。

### 3. 冲突解决策略 (Conflict Resolution)
* 遇到同一 `id` 在多端被同时修改的情况时，无论客户端还是服务端，均严格遵循 **LWW (Last-Write-Wins)** 原则。
* 即：直接比较 `updated_at`，保留时间戳更晚（更新）的数据版本。

---

## 五、 服务端 API 设计参考

服务端需提供轻量级的 RESTful API 以配合增量同步：

* **`POST /api/sync/pull`**
  * **请求体**: `{ "cursor": 1700000000000 }` (客户端最新的 `last_sync_timestamp`)
  * **响应体**: `{ "conversations": [...], "messages": [...], "next_cursor": 1700000500000 }`
* **`POST /api/sync/push`**
  * **请求体**: `{ "conversations": [...], "messages": [...] }` (包含了客户端所有 `dirty: true` 的全量对象)
  * **响应体**: `{ "success": true, "processed_ids": [...] }`

---

## 六、 实施路径计划

建议按以下三个步骤逐步落地：

**Phase 1：数据基建改造**
* **前端**：升级本地 IndexedDB 表结构，加入 `id` (UUID 化)、`updated_at`、`dirty`、`deleted` 字段。改造现有 UI 的写入逻辑，适配新字段。
* **后端**：设计并建立对应的云端数据库表结构，实现 `/api/sync/pull` 和 `/api/sync/push` 接口。

**Phase 2：抽象 Provider 与同步引擎挂载**
* 在 `packages/core` 中实现 `SyncStorageProvider`。
* 在 Extension 宿主中，将同步引擎实例化在 Background 脚本内；在 Web 宿主中实例化在主线程或 Web Worker 中。

**Phase 3：多端鉴权打通与联调**
* 确保 Extension 的 Background 脚本能正确携带 Web 端 OAuth 登录的凭据（Cookie/Token）请求后端 API。
* 进行断网写入、恢复网络上报、多端同时写入等边界场景的测试联调。