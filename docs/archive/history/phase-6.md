# 第六阶段: 历史对话边栏和导入

一、 用户交互与界面设计 (UX/UI)
我们将采用经典的“主从视图 (Master-Detail)”布局，并引入一个轻量级的“状态机”来管理导入逻辑。

1. 左侧边栏 (Sidebar) 逻辑
展示与收起：提供一个控制按钮（如汉堡菜单或侧边栏 Toggle 键），支持全局展开/收起，保证沉浸式长文本阅读体验。

数据源切换 (Source Toggle)：在侧边栏顶部放置一个 Segmented Control（分段控制器），包含两个选项：“本地记录” 和 “外部导入”。

列表项展示：

本地记录：显示标题、时间，如果是对比对话，增加一个特殊的“双发/对比” Icon 以作区分。

外部导入：显示外部对话标题，如果该对话之前已经导入过，显示一个“已导入”的 Checkmark 标识，避免用户重复操作。

2. 右侧主视图状态机 (Main View State Machine)
当用户点击左侧边栏的某条记录时，右侧区域根据数据源进入不同状态：

状态 A：本地对话模式 (Active Mode)

触发：点击“本地记录”列表项，或完成了一次外部导入。

界面：渲染历史对话气泡。底部显示正常的输入框。

行为：用户可以接着上下文继续提问，或者发起新的对比聊天。

状态 B：外部预览模式 (Preview Mode)

触发：点击“外部导入”列表项。

界面：高度复用现有的聊天渲染组件，但使其处于只读状态。

行为：底部原本的文本输入框被替换为一个醒目的操作栏，包含一个主按钮：[ ↓ 导入到 ChatPrizm 本地知识库 ]。在这个状态下，不允许继续对话。

流转：点击导入后，触发数据保存，完成后自动将当前视图平滑切换至 状态 A，恢复底部输入框，用户顺畅地开始基于导入内容的追问。

二、 架构设计与核心层扩展
为了保持你现有架构的整洁，我们需要在 packages/core 中增加适配器，坚守“UI 层不感知外部脏数据”的原则。

1. 核心抽象扩展 (packages/core)
新增 IHistoryProvider 接口：
由于 IModelProvider 专注于发消息和收流式结果，我们需要独立出 IHistoryProvider。它应该包含两个核心方法：

getHistoryList(): 返回远端对话的摘要列表。

getHistoryDetail(externalId): 返回完整的单条对话数据。

扩展 Conversation 实体：
在现有的 Conversation 数据模型 中，增加两个字段：

sourceType: 标识来源（如 local, chatgpt_web）。

externalId: 存储 ChatGPT 原本的 conversation_id。这样在再次拉取远端列表时，系统可以通过比对 externalId 来判断该记录是否已被导入。

2. 宿主装配与数据转换 (apps/extension -> core)
由于你使用了 Proxy + Background 架构，数据流转如下：

防腐层 (Anti-Corruption Layer)：ChatGPT 接口返回的对话数据通常是复杂的树状节点（包含用户的多次重新生成分支）。千万不要把这个树状结构直接扔给 packages/ui。

转换位置：在 Background 代理获取到 ChatGPT 的详情 JSON 后，必须在转交回 Proxy 之前，将其“压平”解析为你统一定义的 Conversation 结构（即线性的 Message 数组）。

单一事实来源：UI 层在渲染“外部预览模式”时，拿到的数据结构和渲染本地数据时是完全一致的，这就实现了你期望的“显示界面复用”。

3. 存储层对接 (IStorageProvider)
当用户在“状态 B”点击“导入”时，UI 层直接调用现有的 IStorageProvider.saveConversation(conversation)，将刚才预览的标准化 Conversation 对象持久化到本地（如 IndexedDB）。因为数据在 Background 已经被清洗过了，这一步会非常顺滑。

三、 迭代执行清单 (Checklist)
你可以按照以下顺序在一个迭代内完成拼装：

核心扩展：在 packages/core 定义 IHistoryProvider 接口，并更新 Conversation 类型。

UI 骨架：在 packages/ui 实现左侧边栏（可折叠）、顶部 Toggle、以及右侧主视图的两种状态（输入框态 vs 导入按钮态）。

本地打通：将 IStorageProvider 接入左侧边栏的“本地记录”列表，点击后在右侧渲染并支持继续对话。

插件通信：扩展现有的 Proxy -> Background 消息通道，支持透传 getHistoryList 和 getHistoryDetail 指令。

外部打通：在 Background 中编写 ChatGPT 数据解析逻辑（树转线性），接入测试。完成预览 -> 导入 -> 继续提问的全闭环。

整个设计的核心在于 “界面高度复用，数据严格隔离与清洗”。

Note：
使用平面方式表达Conversation，考虑并不需要针对某个节点的内容文问题，而是针对整个上下文问问题。
平面方式更加简单。