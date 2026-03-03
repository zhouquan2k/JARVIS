## Why

当前工程主要面向浏览器扩展宿主，缺少可直接部署的纯 Web 入口，导致演示、验收和非扩展场景接入成本偏高。与此同时，普通网页无法跨域携带 ChatGPT 官网 Cookie，`chatgpt-web` Provider 在纯 Web 环境不可用，因此需要一个“宿主装配并注入 Provider”的 Web 架构，在保持接口统一的前提下支持 Web 端可用模型能力。

## What Changes

- 在 Monorepo 新增 `apps/web`（Vite + Vue 3 + TypeScript）作为独立 Web 宿主应用，并接入工作区内部包。
- 在 Web 宿主复用现有聊天 UI 组件，保持对话界面和交互体验一致。
- Web 端 Provider 列表按 `runtimeMode` 过滤，隐藏依赖 Cookie 的 `chatgpt-web`，仅展示 Web 宿主可用 Provider（初始可用集合可仅包含 Gemini）。
- 在 Web 宿主引入 Provider 运行时装配层，通过 `IModelProvider` 接口注入实例，不在页面层直接依赖具体 Provider 类。
- 在 Web 宿主挂载现有 `IndexedDBStorageProvider`，复用会话持久化与历史读取能力。
- 调整配置与鉴权注入约定，使密钥由宿主统一读取并注入装配层，核心 Provider 逻辑不绑定具体环境变量命名。

## Capabilities

### New Capabilities
- `web-host-app`: 定义独立 Web 宿主应用的初始化、依赖接入与运行要求。
- `runtime-mode-provider-injection`: 定义基于运行模式的 Provider 运行时装配与 `IModelProvider` 注入机制，确保 UI 层与具体 Provider 解耦。

### Modified Capabilities
- `provider-model-selector`: 增加按宿主环境过滤 Provider 的要求，Web 宿主不得展示 `chatgpt-web`。
- `static-config`: 扩展静态配置约定，使 Provider 可声明 `supportedRuntimeModes` 与装配元数据，供运行时过滤与注入。

## Impact

- Affected code:
  - `apps/web/**`（新增）
  - `packages/ui/**`（宿主接入与组件挂载）
  - `packages/core/config*`、Provider 运行时装配层与相关适配代码
- APIs: 不引入对外 HTTP API 变更；主要为宿主内运行时行为调整。
- Dependencies: 新增 Web 宿主构建链路依赖（Vite/Vue 工程依赖）与 workspace 引用。
- Systems: 从“扩展代理转发”扩展为“扩展 + 纯 Web（宿主注入）”双宿主运行模型。
