## Why
目前 ChatPrism 仅支持单一的聊天模型，为了扩展其能力，我们需要接入基于 API 的大语言模型，并首选 Gemini Pro 作为试点。同时，之前缺乏在一个界面上方便地切换不同 AI 提供商（Provider）及其对应模型（Model）的机制。本阶段旨在通过极简的静态配置方式，零 UI 设置面板地引入 Gemini API，并在聊天主界面实现 Provider 与 Model 的二级联动选择，从而为未来接入更多模型打下坚实的基础。

## What Changes
- **新增配置驱动架构**：引入静态的 `config.ts` 文件，树形定义支持的各个 Provider（如 ChatGPT (Web)、Gemini (API)）及其可选的 Model，并使用 `.env` 环境变量注入 Gemini API 密钥。
- **UI 交互更新**：在聊天主界面中抛弃繁杂的设置中心，全面采用 Provider 与 Model 级联选择器（Cascading Selectors）。当选择不同的 Provider 时，Model 下拉框会动态更新，并设有默认选项。
- **网络层重构**：实现新的 `GeminiApiProvider` 以对接 Google 原生接口，支持 SSE 流式解析；微调原有的 `ChatGPTWebProvider` 以支持动态接收 `modelId`；保证发消息时均携带具体的 `{ providerId, modelId, prompt, context }`。
- **后台路由无状态化**：重构 Background 层为无状态分发引擎，收到 UI 消息后根据 `providerId` 动态实例化对应的 Provider，并直接透传实现，不再强依赖持久化存储去查找复杂配置。

## Capabilities

### New Capabilities
- `gemini-api-provider`: 实现对 Gemini API 的接入，包括环境变量读取和向 Google Generative API 的流式请求投递及解析。
- `provider-model-selector`: 在 UI 层实现 Provider 与 Model 的二级联动选择器能力，并将用户的选择传递给底层网络请求。
- `static-config`: 静态配置层的抽象，用于获取支持的 providers 和 models 树形结构。

### Modified Capabilities
- `core-interfaces`: 更新 Provider 等核心接口，允许发送消息时指定具体的 `modelId`。
- `chatgpt-web-provider`: 修改请求 payload 构造逻辑，从写死的模型标识改为动态接收 `modelId`。
- `extension-proxy`: 简化后台路由逻辑为无状态分发引擎，根据 `providerId` 动态构造 provider 并透传请求。

## Impact
- `packages/core`: 涉及 `IModelProvider` 接口规范更新、新增 `APP_CONFIG` 全局配置、新增 `GeminiApiProvider` 实现、微调 `ChatGPTWebProvider`。
- `apps/extension/background`: 核心网络代理层（路由）的简化。
- `packages/ui` & `apps/extension`: 聊天输入区及头部新增级联选择 UI 组件。
- `apps/extension/.env`: 引入新的环境变量 `WXT_GEMINI_API_KEY`。
