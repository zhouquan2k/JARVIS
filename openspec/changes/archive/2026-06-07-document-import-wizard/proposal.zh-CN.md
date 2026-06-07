## Why

JARVIS 目前缺少一条结构化路径，把外部资源稳定地转成工作区内可编辑的 Markdown 文档。用户可以收藏链接，但还不能把一个有价值的 B 站视频沉淀成“文字稿 / 总结稿”这类可持续编辑、可检索、可被 Agent 利用的知识资产。

## What Changes

- 在 knowledge workspace 中新增一个通用“文档导入向导”，允许通过插件提供的导入来源，把外部资源导入为 Markdown 文档。
- 落地第一个真实导入来源：B 站视频导入，支持生成文字稿，并可选生成总结稿。
- 将现有 `DocumentCreationFlowContribution` 重命名为 `DocumentImportContribution`，并将其作为导入向导背后的插件扩展点。
- 新增一个共享的 `LanguageModelContribution` 契约，使总结能力由插件提供，而不是写死在宿主或 workspace shell 中。
- 复用现有受保护的 `references/` 资源组织模式，使“有总结稿时的文字稿”可以作为引用资源落盘。
- 在 server 侧新增一个基于 `yt-dlp` 的轻量 B 站文字稿抓取路由，但保持导入编排、总结生成和文档组织仍属于前端插件边界。

## Capabilities

### New Capabilities
- `document-import-wizard`：一个插件驱动的导入向导能力，允许用户选择导入来源、配置来源参数、按阶段执行导入，并在成功后打开生成的主文档。

### Modified Capabilities
- `plugin-system`：插件贡献模型需要通过现有 setup/query 契约暴露 document-import contribution 与共享 language-model contribution。
- `knowledge-workspace`：workspace shell 需要在新建文档入口附近暴露导入入口、承载导入向导流程，并按导入结果组织主文档与 `references/` 引用资源。

## Impact

- 影响代码：`packages/core`、`packages/plugin-system`、`packages/ui`、`packages/node`、`apps/server`、`plugins/ai-agent`，以及新的 `plugins/bilibili-import` 插件。
- API 影响：将 `DocumentCreationFlowContribution` 重命名为 `DocumentImportContribution`，新增 `LanguageModelContribution`，并扩展插件 setup/query 的注册接口。
- 运行时 / 依赖影响：启用 B 站导入的 server 环境需要安装 `yt-dlp`；前端宿主需要将新的 builtin import plugin 纳入启用清单。
- 验证影响：需要覆盖导入向导的 workspace UI 流程、新贡献类型的插件注册、server 侧文字稿抓取，以及“仅文字稿 / 文字稿+总结稿”两条真实导入链路。
