## Why

当前外部聊天记录导入仍然只有“最近一页历史列表”这一种入口，用户想导入较早的 ChatGPT 或 Gemini 对话时，只能依赖列表缓存命中，无法通过关键词直接定位目标会话。这使得“先搜索再导入”的高频路径缺失，也迫使系统未来为“找旧会话”去补分页抓取全量历史，成本高且链路不稳定。

## What Changes

- 为外部历史工作台新增搜索能力，并采用“共享同一份搜索关键词”的方式：`chatgpt-web` 与 `gemini-web` 复用同一个搜索框组件和同一份 query，用户切换 provider 时沿用当前关键词重新加载对应结果。
- 扩展 `IHistoryProvider.getHistoryList(...)` 契约，使历史列表查询支持可选关键词参数；空关键词继续返回最近会话，非空关键词返回 provider 原生搜索结果。
- 在 `packages/ui` 的工作台 store 与侧边栏中引入共享搜索关键词状态，使用户在 ChatGPT 和 Gemini 间切换时，无需重新输入关键词即可对当前 provider 重新搜索。
- 在 ChatGPT Web provider 中接入对话历史搜索；在 Gemini DOM history provider、desktop preload、extension content script 和远程配置中补齐 Gemini 搜索链路。
- 同步扩展 desktop / extension 的历史代理协议与 host 转发逻辑，使 renderer 可以向历史 provider 透传 `query`。

## Capabilities

### New Capabilities
- 无新增 capability；本次变更以既有能力扩展为主。

### Modified Capabilities
- `external-history-provider`: 将历史列表能力从“仅最近一页”扩展为“最近列表 + 可选关键词搜索”的统一契约。
- `conversation-workspace`: 为外部历史侧栏增加共享搜索框、共享关键词状态以及切换 provider 后沿用同一 query 重查结果的交互。
- `chatgpt-web-provider`: 为 ChatGPT Web 历史 provider 增加原生搜索能力，并继续输出统一的摘要列表与详情模型。
- `gemini-dom-history-provider`: 为 Gemini DOM 历史 provider 增加搜索请求透传、搜索结果 DOM 抽取和搜索态稳定等待逻辑。
- `extension-proxy`: 扩展 `GET_HISTORY_LIST` 协议，使扩展 renderer 到 background 的历史列表请求支持 `query`。
- `desktop-provider-proxy`: 扩展桌面 renderer 到 host 的历史列表请求，使 `GET_HISTORY_LIST` 支持 `query` 并保留请求关联语义。

## Impact

- 影响代码范围：`packages/core`、`packages/ui`、`apps/web`、`apps/desktop`、`apps/extension`、`apps/server` 及相关测试。
- 影响的主要接口：`IHistoryProvider`、`ExternalHistoryProviderEntry`、`ChatGPTWebProvider.getHistoryList(...)`、`GeminiHistoryBridge.getHistoryList(...)`、desktop / extension `GetHistoryListRequest`。
- 影响的运行时行为：ChatGPT 与 Gemini 在外部历史工作台中将共享同一个搜索关键词；切换 provider 时会沿用当前 query 对新 provider 重新查询；空关键词仍回到最近会话列表；`external-file` 保持现状，不显示搜索框。
- 无计划引入对最终用户可见的破坏性能力删除；变更主要集中在外部历史查询契约和工作台状态管理的扩展。
