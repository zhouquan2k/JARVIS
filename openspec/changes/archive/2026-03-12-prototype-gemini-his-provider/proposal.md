## Why

当前 ChatPrism 已经具备本地会话、ChatGPT 外部历史预览与导入能力，但 Gemini 官网历史仍然缺席。这会让以 Gemini 为主工作流的用户无法把既有对话沉淀回 ChatPrism，产品也还没有真正形成“多源历史统一收拢”的 PKM 入口。

`phase-9.md` 明确要求把多源历史收拢到同一个工作台，并且针对 Gemini 采用云端规则驱动的 DOM 抓取方案，以降低 Google 页面频繁变动时的维护成本。结合最新 UI 要求，工作台的第一层入口仍保持“本地 / 外部”，在“外部”之下再进一步选择 `ChatGPT / Gemini / 外部文件导入`。因此这次变更需要同时补齐两级切换体验、Gemini 历史提供者和远程规则配置链路。

## What Changes

- 保持共享对话工作台的第一层历史来源为“本地 / 外部”，并在“外部”视图中新增 provider 级入口，用于在 `ChatGPT / Gemini / 外部文件导入` 之间切换。
- 新增 Gemini 历史提供者，使用浏览器扩展的后台页、受控标签页和内容脚本执行 DOM 抓取，并把结果标准化为统一的 `Conversation`。
- 新增远程规则配置能力，由 ChatPrism 服务端提供版本化的 Gemini 选择器 JSON，扩展端按需拉取、缓存并在抓取时使用。
- 为 Gemini 抓取流程增加健康检查、懒加载滚动和规范化错误，避免页面结构变更时直接卡死或把脏数据暴露给 UI。
- 保持导入闭环不变：外部历史详情仍以只读模式预览，导入成功后切回本地活动会话继续追问。

## Capabilities

### New Capabilities
- `gemini-dom-history-provider`: 通过远程规则驱动的 DOM 抓取接入 Gemini 官网历史列表与详情，并将结果转换成统一的 `Conversation` 数据。
- `provider-remote-config`: 为外部历史抓取器提供可版本化、可缓存、可回滚的远程规则配置契约与服务端分发能力。

### Modified Capabilities
- `conversation-workspace`: 保持当前“本地 / 外部”一级切换，并把外部视图扩展为 `ChatGPT / Gemini / 外部文件导入` 的二级 provider 选择与预览导入流转。
- `core-interfaces`: 扩展历史来源元数据与工作台状态契约，支持 `origin` 持久化标识以及多 provider 的历史提供者注册。
- `external-history-provider`: 在现有统一历史抽象上补充 DOM 抓取型 provider 的健康检查、错误规范化和多来源选择能力。
- `extension-host-app`: 扩展宿主初始化外部历史 provider 注册表、远程规则缓存和 Gemini 受控标签页的运行时装配，并接入外部文件导入入口。
- `sync-server`: 在现有服务端能力上增加 Gemini 远程规则配置的分发接口与缓存控制。

## Impact

- 影响代码范围：`packages/core`、`packages/ui`、`apps/extension`、`apps/server`。
- 影响的数据契约：`Conversation.origin`、两级历史工作台状态、Gemini 远程规则 JSON schema、历史提供者错误码。
- 影响的扩展权限：需要为 Gemini 站点增加 `host_permissions` 与内容脚本匹配范围。
- 影响的运行时行为：扩展宿主启动后的历史 provider 注册、切换 Gemini 面板时的规则拉取与标签页调度、服务端新增配置接口。
- 无计划引入破坏性用户迁移；旧的本地会话与 ChatGPT 历史导入数据保持兼容。
