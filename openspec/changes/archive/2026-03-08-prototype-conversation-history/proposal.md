## Why

当前 ChatPrism 已支持聊天、对比和本地历史恢复，但缺少对长对话资产的统一整理入口，用户无法在同一工作台中浏览旧会话、预览外部历史并沉淀到本地知识库。第六阶段需要补齐这条链路，把产品从“聊天工具”进一步推进到“可持续积累的个人知识管理工作台”。

与此同时，当前模型选择器仍完全依赖静态配置中的 `models/defaultModel`。这会导致 ChatGPT 网页版等 provider 的真实可用模型与 UI 展示产生漂移，也让扩展宿主无法根据当前鉴权状态、账号能力或 provider 自身能力动态更新模型列表。

## What Changes

- 在扩展宿主中新增可折叠历史侧边栏，支持在“本地记录”和“外部导入”两个数据源之间切换。
- 新增外部会话预览与导入流程：外部历史以只读模式预览，导入后转为本地活动会话并允许继续追问。
- 在核心层引入独立的历史拉取抽象，避免将外部平台的脏数据结构直接暴露给 UI。
- 扩展代理链路与 ChatGPT 网页接入补充历史列表、历史详情和标准化转换能力。
- 扩展本地存储的会话元数据，保留导入来源和外部标识，支持去重与来源识别。
- 将模型列表来源从静态配置升级为 provider 自发现，并保留静态配置作为失败回退。
- 扩展扩展宿主与 UI store 的模型加载流程，使普通聊天和对比聊天都能消费 provider 返回的动态模型列表。

## Capabilities

### New Capabilities
- `conversation-history-workspace`: 在扩展宿主中提供本地历史浏览、外部历史预览、导入后继续对话的一体化工作台体验。
- `external-history-provider`: 通过独立历史提供者拉取远端会话列表与详情，并在后台将外部树状对话转换为统一的线性 `Conversation` 数据。

### Modified Capabilities
- `core-interfaces`: 新增 `IHistoryProvider` 契约，为 `Conversation` 增加 `sourceType`、`externalId` 等来源元数据，并让 `IModelProvider` 支持 provider 自主返回模型列表。
- `extension-proxy`: 扩展 Proxy/Background 协议，支持历史列表、历史详情与 provider 可用模型查询的转发、关联和返回。
- `storage-provider`: 持久化层在保存和读取会话时保留来源元数据，并支持历史列表识别已导入记录。
- `extension-host-app`: 扩展宿主增加历史侧栏、来源切换、预览态与活动态之间的状态流转，并在初始化时等待 provider 动态模型目录就绪。
- `chatgpt-web-provider`: ChatGPT 网页接入增加历史列表、详情读取和当前账号可用模型探测能力。

## Impact

- 影响代码范围：`packages/core`、`packages/ui`、`apps/extension`。
- 影响的数据契约：`Conversation`、`IModelProvider`、新增 `IHistoryProvider`、Provider Runtime、Proxy 消息协议、外部历史标准化结果。
- 影响的系统行为：扩展宿主启动后的历史加载流程、provider 模型列表刷新、本地/外部会话切换与导入闭环。
- 无预期破坏性 API 变更，但会要求相关实现同步适配新的会话元数据与历史接口。
