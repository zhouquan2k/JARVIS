## 1. 基础配置与环境变量准备 (静态配置层)

- [x] 1.1 在 `apps/extension/.env` (或对应环境配置文件) 中添加变量 `WXT_GEMINI_API_KEY`。
- [x] 1.2 创建 `packages/core/config.ts` 文件。
- [x] 1.3 在 `APP_CONFIG` 中定义 `providers` 数组，包含 `chat কর্মরতgpt-web` 和 `gemini-api` 两个节点，以及各自对应的 `models` 和 `defaultModel`。

## 2. 核心网络通信接口重构 (接口层)

- [x] 2.1 修改 `packages/core/interfaces/IModelProvider.ts`，将 `sendMessage` 的第二个参数重构为一个 Options 对象类型 `options?: { context?: any, modelId?: string }`。

## 3. Provider 的实现与适配 (核心逻辑层)

- [x] 3.1 创建 `packages/core/providers/GeminiApiProvider.ts` 文件，实现 `IModelProvider` 接口。
- [x] 3.2 在 `GeminiApiProvider` 的 `sendMessage` 中实现从环境变量获取 Key 并通过 Fetch API 访问 Google SSE 模型端点。
- [x] 3.3 修改已有的 `packages/core/providers/ChatGPTWebProvider.ts`，使其 `sendMessage` 接收并消费传入的 `options.modelId` (替换硬编码的 `'auto'`)。

## 4. Background 无状态路由改造 (背景代理层)

- [x] 4.1 修改 UI 至 Background 的请求 payload 结构，确保其发送的数据符合 `{ providerId, prompt, options: { modelId, context } }` (或相应平铺解构) 格式。
- [x] 4.2 更新 `apps/extension/background/messages.ts` (基于 WXT/消息系统)，将其转变为无状态的工厂路由模式。 
- [x] 4.3 在 Background 中根据收到的 `providerId` 动态实例化对应的 Provider（`ChatGPTWebProvider` 或 `GeminiApiProvider`），并将带有 `modelId` 的参数向下透传给真实 Provider 执行。

## 5. UI 级联选择器开发 (UI 与交互层)

- [x] 5.1 创建新的组件 `packages/ui/components/ProviderModelSelector.tsx`。
- [x] 5.2 在组件内实现两个下拉框联动逻辑：一级下拉框读取 `APP_CONFIG.providers`；二级下拉框展示对应 Provider 下的 `models`，并自动设置默认值。
- [x] 5.3 在 `apps/extension/src/App.tsx` (主容器/聊天界面入口) 中集成该新组件，抛弃原先深层或硬编码的设置逻辑。
- [x] 5.4 联动发信逻辑：确保当用户点击“发送”时，正确读取出选择器目前选中的 `providerId` 和 `modelId` 并传递给 Background。
