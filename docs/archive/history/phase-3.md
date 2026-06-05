第三阶段：纯 Web 宿主拓展与宿主注入架构实现
阶段目标： 在 Monorepo 中新增 apps/web 独立工程，复用已有 UI 组件与 Provider 抽象能力，在普通浏览器网页中完成对话，打造一个开箱即用的 Web 聊天站。由于普通网页受严格的同源策略限制，无法跨域携带 ChatGPT 官网 Cookie，第一阶段的 ChatGPTWebProvider 无法在纯 Web 端运行。因此第三阶段采用“宿主装配 + 接口注入”方式：Web 端只展示宿主可用 Provider（初始可用集合可仅包含 Gemini API），但宿主代码不直接依赖具体 Provider 实现类。

🚀 第三阶段：核心开发任务分解
1. 工程基建：新增 Web 宿主应用
利用 Vite 快速初始化一个新的 Vue 3 单页应用。

创建目录： 在 apps/ 目录下新建 web/ 文件夹。

初始化： 使用 Vite 模板初始化一个 Vue 3 + TypeScript 工程（pnpm create vite web --template vue-ts）。

引入内部依赖： 在 apps/web/package.json 中，将你自己的核心包添加进依赖列表：

JSON
"dependencies": {
  "@your-workspace/core": "workspace:*",
  "@your-workspace/ui": "workspace:*"
}
环境变量配置： 在 apps/web/.env 中配置宿主运行所需的 Provider 密钥（由宿主装配层读取并映射）：
VITE_LLM_API_KEY="AIzaSy..."

2. UI 视图复用：零成本挂载聊天界面
我们在 packages/ui 中沉淀的聊天气泡、输入框、下拉选择器终于迎来了跨端复用的高光时刻。

复用组件： 在 apps/web/src/App.vue 中，直接引入 packages/ui 里的核心聊天界面组件（如 <ChatContainer /> 或 <CascadingSelector />）。

裁剪配置字典： 从 packages/core/config.ts 中读取 APP_CONFIG.providers。在 Web 端渲染下拉列表前，按 `runtimeMode` 进行过滤：

TypeScript
// 网页端只展示 runtimeMode=web 且可用的 Provider
const availableProviders = APP_CONFIG.providers.filter(
  p => p.supportedRuntimeModes?.includes('web') && p.enabled !== false
);
3. 核心驱动层：宿主装配并注入 Provider（不直接依赖具体实现）
核心原则是“面向 IModelProvider 接口编程”。UI 组件不需要知道具体是哪家模型，只依赖统一接口；宿主负责根据配置选择并注入具体 Provider。

实例化引擎：
当用户在 Web 页面点击发送时，根据下拉框选择的 providerId/modelId，通过宿主装配层获取对应 Provider：

TypeScript
import { createProviderRuntime } from '@your-workspace/core';

// 宿主读取环境变量并传给运行时装配层
const runtime = createProviderRuntime({
  runtimeMode: 'web',
  credentials: {
    geminiApiKey: import.meta.env.VITE_LLM_API_KEY
  }
});

// 根据用户选择拿到 IModelProvider，不在页面层直接 new 具体 Provider
const provider = runtime.getProvider(providerId);

// 直接调用并监听流式回调，驱动 UI 渲染
await provider.sendMessage(
  prompt,
  { modelId, context },
  (chunk) => {
    // 直接更新 Vue 的响应式状态，打字机效果输出
    currentMessage.value = chunk;
  }
);
4. 数据持久化：Web 端的 IndexedDB
我们的 IStorageProvider 在此时也体现了极强的兼容性。

挂载存储模块： 在 apps/web 的入口文件（main.ts 或 Store 中），依然直接实例化第一阶段写好的 IndexedDBStorageProvider（基于 localforage）。

因为不管是在浏览器扩展页面，还是普通的 Web 网页，IndexedDB 都是浏览器原生支持的标准 API。你的数据保存、历史记录读取逻辑一行代码都不用改。
