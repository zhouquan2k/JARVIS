# Group 对话增强（二）：DOM 会话隔离、窗口超时关闭与历史恢复

> 本文是 [group-conversation-enhance.md](group-conversation-enhance.md) 的第二阶段补充设计，聚焦 **DOM provider 在多本地会话下的上下文隔离**，以及由此引出的 **窗口生命周期管理** 与 **历史恢复**。本文不改动 group 的 UI 结构、Tab 呈现和总结信息架构，只补强 DOM 会话的运行时承载方式。

## 原始问题

当前 group 对话中的 DOM 成员（如 `chatgpt-dom`、`gemini-dom`、`claude-dom`）通过受控页窗口与真实站点交互。现有实现中，受控页窗口与持久化 partition 的复用粒度是 **`providerId`**，不是 **本地 conversation**。

这带来两个直接问题：

1. **多本地会话串线**
   - 对话 A 和对话 B 只要都使用 `gemini-dom`，就会共用同一个 Gemini 受控页。
   - 当用户在多个本地会话之间切换并继续发送时，DOM provider 往往是在继续当前受控页里的远端 thread，而不是继续与该本地 conversation 对应的远端 thread。

2. **窗口常驻才能维持远端上下文**
   - 当前 DOM 连续性的核心载体是“活着的受控页窗口”。
   - 一旦窗口销毁，系统并没有可靠的“本地 conversation -> 远端 DOM thread”恢复机制；本地 history 目前主要只参与 `reset` 判定或 prompt 补充，不能真正还原远端网页对话。

因此，第二阶段的目标不是继续依赖“窗口常驻”，而是把“历史真值”从受控页窗口中剥离出来，让窗口变成可回收、可恢复的执行载体。

## 用户价值

- **避免多会话串线**：同一 provider 在多个本地 conversation 之间不再互相污染远端上下文。
- **降低资源占用**：不要求所有 DOM 窗口永久常驻；空闲窗口可自动关闭。
- **可从历史继续聊**：即使窗口被回收，用户重新打开历史 conversation 时仍能恢复上下文，而不是从零开始。

## 设计目标

### 目标范围

- 让 DOM provider 的受控页实例从“按 `providerId` 复用”演进为“按 conversation / session key 隔离”。
- 引入 DOM 受控页的空闲超时自动关闭逻辑。
- 为每个本地 conversation 持久化足够的 DOM 会话元数据，以支持恢复。
- 为恢复失败场景提供基于本地历史的兜底续聊策略。

### 非目标

- 不改变 group 的 Tab UI、成员编排、总结结构。
- 不要求所有站点都必须 100% 恢复原远端 thread；允许恢复失败后退化到本地历史续聊。
- 不在本期引入复杂的跨设备远端 DOM 会话同步。

## 关键设计原则

### 1. 窗口只是执行载体，不是历史真值

DOM 受控页窗口可以被创建、隐藏、关闭、重建；真正需要持久化的是：

- 本地 conversation 历史
- DOM 会话元数据
- 恢复所需的摘要与索引

### 2. 本地历史为主，远端 thread 恢复为辅

系统应优先尝试恢复原远端 thread；但如果失败，仍需能基于本地历史和摘要继续聊下去，而不是因为远端 thread 丢失而阻断用户。

### 3. 会话隔离优先于 provider 复用

对于 DOM provider，正确的隔离粒度应是“本地 conversation 对应的 DOM session”，而不是“整个应用里该 provider 只有一个活动窗口”。

## 推荐实现方案

### 0. 阶段性落地策略

在完整的 conversation 级 DOM 会话隔离实现之前，先落一个临时方案：

- 为 group 总结链路引入一个单独的 `gemini-dom-summary` 专用窗口
- 所有总结轮次先复用这同一个 Gemini 总结对话
- 暂不处理“多个 group 对话并发/交替时，共用同一个总结对话导致串线”的问题

这样可以先把总结从普通成员的 Gemini DOM 会话中分离出来，避免成员回答和总结回答互相污染；但它仍然不是最终的 conversation 级隔离方案。

### 一、DOM 会话隔离模型

当前模式：

- `providerId = gemini-dom`
- 受控页窗口 key = `providerId`
- Electron partition key = `providerId`

推荐改为：

- `providerId`：仍表示逻辑 provider 类型，例如 `gemini-dom`
- `sessionKey` / `pageKey`：表示某个本地 conversation 对应的 DOM 会话实例，例如 `gemini-dom:<conversationId>`

由此产生两层标识：

- **逻辑 provider 标识**
  - 用于模型目录、UI 展示、preload 选择、能力类型判断
- **运行时会话标识**
  - 用于受控页窗口索引
  - 用于 DOM 事件订阅路由
  - 用于 partition 隔离

这意味着：

- 对话 A 的 `gemini-dom` 和对话 B 的 `gemini-dom` 是同一种 provider，但对应不同的受控页实例
- summarizer 如果使用 Gemini DOM，也应拥有独立的 `sessionKey`，避免与普通成员会话共用远端 thread

### 二、窗口管理：超时自动关闭

#### 2.1 目标

在不破坏历史连续性的前提下，避免大量隐藏 DOM 窗口无限常驻。

#### 2.2 生命周期状态

每个 DOM 会话实例应具备以下状态：

- `active`
  - 当前正在发送、流式接收，或刚完成交互
- `idle`
  - 当前未活跃，但窗口仍存在，正在等待超时回收
- `closed`
  - 受控页窗口与 webContents 已销毁，仅保留会话元数据
- `restoring`
  - 用户重新进入历史 conversation 后，系统正在尝试恢复远端 thread 或重建本地上下文

#### 2.3 回收策略

推荐最小可用策略：

- 当前活跃 conversation 对应的 DOM 窗口不回收
- 非活跃窗口进入 idle 计时
- 超过预设空闲阈值后自动关闭窗口
- 关闭动作仅销毁 `BrowserWindow/webContents`，不删除持久化元数据

可选增强策略：

- 保留最近 `N` 个最常用 DOM 会话实例，减少频繁恢复成本
- 在内存压力较高时提前回收最久未使用窗口

#### 2.4 关闭前保存内容

窗口关闭前需要确保以下内容已持久化：

- 本地 conversation 全量消息
- 对应 provider 的 DOM 会话元数据
- 最近一次可恢复的远端 thread 标识（若有）
- 滚动摘要或最近若干轮消息索引

### 三、历史恢复

#### 3.1 需要区分的两类历史

**A. 本地历史**

- JARVIS conversation 中保存的消息
- 可长期保存，是真正稳定的历史真值

**B. 远端网页历史**

- ChatGPT / Gemini / Claude 页面中的真实 thread
- 依赖远端站点页面结构、thread 标识和当前登录态，恢复成功率天然不是 100%

#### 3.2 当前实现的不足

当前 DOM provider 对 `history` 的使用方式较弱：

- 普通 DOM provider 主要用 `history.length > 0` 来判断 `reset` 与否
- group provider 会从上一轮 transcript 中提取“其他成员发言”，拼成 prompt 上下文

这两者都不是“恢复远端 DOM thread”。

#### 3.3 推荐恢复顺序

从历史 conversation 继续聊时，恢复顺序建议如下：

1. **优先恢复原远端 thread**
   - 若存在可用的 `remoteThreadUrl`、`remoteConversationId` 或等价站点标识，则优先打开并恢复原受控页语境

2. **恢复失败则新建远端 thread**
   - 若原 thread 不可达、页面结构变化、认证失效或恢复脚本失败，则创建新的远端对话

3. **将本地历史以摘要 + 近期消息形式回灌**
   - 把本地滚动摘要、最近若干轮问答、必要的系统上下文重新组织后注入新 thread
   - 目标不是字面复刻网页 thread，而是尽量恢复语义连续性

#### 3.4 建议持久化的数据结构

每个本地 conversation 下，按 provider 维度保存一份 DOM 会话元数据，例如：

- `providerId`
- `sessionKey`
- `remoteThreadUrl` 或 `remoteConversationId`
- `lastKnownTitle`
- `lastActiveAt`
- `lastRestoreStatus`
- `rollingSummary`
- `recentTurnsSnapshot`

说明：

- `rollingSummary` 用于长历史压缩，避免每次恢复都重放全部历史
- `recentTurnsSnapshot` 用于恢复时补齐最近几轮细节
- `lastRestoreStatus` 用于区分“上次恢复成功/失败/需重新建会话”

#### 3.5 恢复失败兜底

即便原远端 thread 完全无法恢复，也应满足：

- 用户仍可在该本地 conversation 上继续聊
- 系统自动创建新的 DOM thread
- 使用本地摘要 + 最近几轮消息构造恢复 prompt
- 在 UI 或日志中标记这是一次“降级恢复”，而不是默默切换为全新上下文

## 架构影响

### 影响边界

本设计主要影响以下几层：

- `ControlledPageCapability`
  - 需要支持从单一 `providerId` 路由演进为 `providerId + sessionKey/pageKey`

- desktop controlled page 基础设施
  - `controlledPageManager`
  - `controlledPageIpc`
  - `sessionManager`

- DOM provider runtime
  - 需要在 provider 类型与实例 key 之间建立映射
  - 允许对同一逻辑 provider 创建多个会话隔离实例

- conversation 持久化结构
  - 增加 DOM 会话元数据持久化
  - 为恢复与超时关闭提供状态基础

### 与现有 group 设计的关系

本设计不改变以下内容：

- `groupMembers` / `groupSummary` 的消息结构
- `GroupMessageTabs` 的 UI 呈现
- `MultiModelGroupProvider` 的并发成员编排语义

它只改变 group 在调用 DOM 成员 provider 时，底层受控页实例是如何被创建、复用、关闭与恢复的。

## 后续任务

- 将当前单一 `gemini-dom-summary` 总结窗口，升级为按本地 conversation 隔离的总结 DOM 会话
- 消除多个 group 对话交替发送时，共用同一个总结对话而导致的串线风险
- 把普通 DOM 成员 provider 也从“按 `providerId` 复用窗口”演进到“按 conversation / session key 隔离”

## 风险与取舍

### 风险 1：资源与复杂度上升

按 conversation 隔离 DOM 窗口后，受控页数量会增加，内存占用和管理复杂度也会上升。

**缓解：**

- 引入空闲超时回收
- 可选保留最近 `N` 个活跃实例
- 把窗口视为可回收资源，而非永久常驻对象

### 风险 2：远端 thread 恢复并不总是可靠

站点可能调整 URL 结构、thread 标识、页面跳转行为或认证要求，导致恢复失败。

**缓解：**

- 设计上明确“本地历史为主，远端恢复为辅”
- 保证恢复失败时仍能基于本地摘要继续聊

### 风险 3：摘要质量影响恢复连续性

若滚动摘要失真，恢复后的新 thread 可能偏离原语义。

**缓解：**

- 摘要作为高层压缩信息，最近若干轮消息仍保留原文快照
- 对关键会话可保留更长的近期窗口

## 验收标准

用于验证第二阶段设计是否落地完整、行为正确：

| 动作 | 预期响应 |
| --- | --- |
| 在本地会话 A 中使用 `gemini-dom` 发起对话，再切到本地会话 B 中继续使用 `gemini-dom` | A 与 B 对应不同 DOM 会话实例，不共享同一个远端 thread |
| 多个 group 对话交替发送消息 | 各自成员 provider 使用各自的 conversation 级 DOM 会话，不发生串线 |
| group summarizer 使用 DOM provider | summarizer 使用独立 DOM 会话实例，不与普通成员会话复用同一远端 thread |
| 某个 DOM 会话长时间空闲 | 对应受控页窗口自动关闭，但 conversation 本地历史与 DOM 会话元数据仍保留 |
| 用户重新打开已被回收窗口的历史 conversation | 系统尝试恢复原远端 thread；成功则继续原 thread |
| 原远端 thread 恢复失败 | 系统自动新建 DOM thread，并基于本地摘要 + 最近若干轮消息恢复上下文后继续聊天 |
| 应用重启后重新打开历史 conversation | 若存在可用持久化元数据，系统仍能走同样的恢复流程，而不是丢失全部上下文 |

## 总结

第二阶段的核心不是“让 DOM 窗口一直活着”，而是：

- 让 DOM provider 的运行时实例按 conversation 隔离
- 让窗口成为可回收的执行载体
- 让历史连续性建立在本地 conversation 与可恢复的 DOM 元数据之上

这样才能同时解决：

- 多会话上下文串线
- 隐藏窗口无限常驻
- 历史会话无法可靠继续聊
