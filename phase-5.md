第五阶段：浏览器插件全窗口化适配与后台通信集成
🎯 阶段目标描述
本阶段的唯一目标是将前序阶段完成的“多模型并发与对比分析”功能无缝装载到浏览器插件（apps/extension）宿主中。
无需修改任何 packages/ui 中的组件代码。核心工作聚焦于：更改插件的 Manifest 声明以实现“点击图标开启全屏标签页”，并在插件前端入口注入基于 chrome.runtime.connect 的 BackgroundProxyProvider，打通全屏 UI 与后台 Service Worker 的双轨通信链路。

一、 宿主入口层：全窗口接管机制 (Entry & Manifest)
抛弃侧边栏与弹窗，将扩展图标的点击行为劫持为打开一个独立的全屏 Web 标签页。

1. 清理 Manifest 声明：

在 wxt.config.ts 中，移除所有关于 side_panel 或 default_popup 的配置。

确保已声明 tabs 权限（用于后台创建新标签页）。

2. 劫持 Action 点击事件 (apps/extension/entrypoints/background.ts)：

增加事件监听器，拦截用户点击浏览器右上角插件图标的动作：

TypeScript
chrome.action.onClicked.addListener(() => {
  // 获取插件内 index.html 的绝对路径并打开新标签页
  const extensionUrl = chrome.runtime.getURL('index.html');
  chrome.tabs.create({ url: extensionUrl });
});
二、 依赖注入层：Proxy Provider 的装配 (Dependency Injection)
在扩展的全屏页面（即 index.html 对应的 Vue 应用入口）中，我们无需改动 CompareChatView 的内部逻辑，只需在调用它时，从外部把代理 Provider 传进去。

1. 实例化并发代理：

在全屏页面的业务层，实例化两个用于跨环境通信的替身：

TypeScript
// 使用第一阶段建好的 Proxy 类
const providerA = new BackgroundProxyProvider({ id: 'proxy-a' });
const providerB = new BackgroundProxyProvider({ id: 'proxy-b' });
2. 属性下发 (Props Passing)：

将这两个实例直接作为 Props 传给现成的 UI 组件：

HTML
<CompareChatView 
  :providerA="providerA" 
  :providerB="providerB" 
/>
三、 后台执行层：双轨路由与分析引擎集成 (Background Routing)
Background Service Worker 需要升级其消息处理枢纽，以同时应对两条并行的请求流和一个分析请求流。

1. 并发请求路由隔离：

Background 监听 chrome.runtime.onConnect。

根据 UI 传来的 modelId（如 chatgpt-web 或 gemini-api），读取 chrome.storage.local 中的凭证，分别实例化真实的 Provider 进行真实的网络请求。

通过 Port 通道将两份 SSE 流独立回调给对应的 Proxy 实例。

2. 分析引擎的后台穿透：

当 UI 侧的双模型均输出完毕触发分析时，通过 Proxy 发送特定指令（例如 action: 'ANALYZE_COMPARISON'）及 outputA、outputB 给 Background。

Background 内部实例化 ComparisonAnalyzer 和真实的 GeminiApiProvider 执行总结。

将生成的 JSON 结构化数据通过 Port 送回前端 UI，直接驱动已存在的 3 行 2 列网格渲染。

四、 存储层适配：复合对话结构落盘 (Storage Integration)
由于全屏应用依然运行在浏览器环境中，直接复用第一阶段的 IndexedDBStorageProvider 即可，只需确保数据结构的兼容。

1. 数据契约扩展：

确保全局的 Conversation 接口已支持双模型字段（modelA_response, modelB_response）以及分析结果（analysisResult 对象）。

全屏页面在获取到最终分析结果后，直接调用 storage.saveConversation(currentChat) 写入 IndexedDB，供侧边历史记录栏读取恢复。