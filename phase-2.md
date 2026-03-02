# 第二阶段：Gemini API 接入与级联模型选择 (极简配置文件版)

阶段目标： 通过静态配置文件注入 API 密钥，零 UI 设置面板。在聊天界面实现“Provider”与“Model”的二级联动选择，并跑通 Gemini Pro API 链路。

📌 保持不变的基建 (继承自第一阶段)
Monorepo 物理结构不变： packages/core, packages/ui, apps/extension 三层结构。

核心契约不变： IModelProvider 等接口定义不变（但发消息时需允许传入具体的 modelId）。

通信代理架构不变： UI -> Background -> 真实 Provider。

数据持久化不变： IndexedDB 存储对话记录。

🚀 第二阶段：核心开发任务分解
1. 静态配置层：配置文件定义 (放在 packages/core 或独立 config 目录)
用一个纯 TypeScript 文件来定义你支持的 Provider 和 Model 的树形结构，方便 UI 层直接读取渲染。API 密钥则通过 .env 环境变量注入。

创建 config.ts (Provider 与 Model 的映射字典)：

TypeScript
export const APP_CONFIG = {
  providers: [
    {
      id: 'chatgpt-web',
      name: 'ChatGPT (Web)',
      models: [
        { id: 'gpt 5.2 thinking', name: 'GPT 5.2 Thinking (默认)' },
        { id: 'gpt-4o', name: 'GPT-4o' }
      ],
      defaultModel: 'gpt 5.2 thinking'
    },
    {
      id: 'gemini-api',
      name: 'Gemini (API)',
      models: [
        { id: 'gemini pro 3 thinking', name: 'Gemini Pro 3 Thinking (默认)' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
      ],
      defaultModel: 'gemini pro 3 thinking'
    }
  ]
};
API 密钥管理 (.env)：
在 apps/extension/.env 文件中配置：
WXT_GEMINI_API_KEY="AIzaSyYourApiKeyHere..."

2. UI 交互层：二级联动选择器 (放在 packages/ui & apps/extension)
完全抛弃繁琐的“设置中心”，所有的交互都在聊天主界面完成。

新增：Provider 与 Model 级联选择器 (Cascading Selectors)

下拉框 1 (Provider 选择)： 读取 APP_CONFIG.providers，让用户选择 ChatGPT (Web) 或 Gemini (API)。

下拉框 2 (Model 选择)： 根据下拉框 1 的选择动态变化。

如果 Provider 选了 ChatGPT，下拉框 2 默认选中 gpt 5.2 thinking。

如果 Provider 选了 Gemini，下拉框 2 默认选中 gemini pro 3 thinking。

发送行为更新：
用户点击发送（或回车）时，UI 组件将当前的 providerId、modelId 和 prompt 打包，通过长连接 Proxy 传给 Background。

3. 核心网络层：实现与适配 (放在 packages/core)
Provider 必须支持接收指定的 modelId 并发起请求。

实现 GeminiApiProvider：

密钥获取： 初始化时，直接从环境变量（如 import.meta.env.WXT_GEMINI_API_KEY）中读取 Key。

动态模型端点： 在 sendMessage 方法中，接收传入的 modelId，构造请求 URL：
https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}

SSE 解析： 使用 TextDecoder 和 \n\n 分割，提取 candidates[0].content.parts[0].text。

微调 ChatGPTWebProvider (适配模型选择)：

在构造向 backend-api/conversation 发送的 Payload 时，将写死的 model: 'auto' 替换为 UI 传过来的 modelId (即 gpt 5.2 thinking)。

4. 后台路由层：无状态分发引擎 (放在 apps/extension/background)
Background 不再需要去 chrome.storage 里辛苦地翻找配置了，逻辑极度简化。

监听与路由：
Background 收到 UI 的消息包 { providerId, modelId, prompt, context }。

工厂模式直接实例化：

如果 providerId === 'chatgpt-web'：实例化 ChatGPTWebProvider。

如果 providerId === 'gemini-api'：实例化 GeminiApiProvider（Key 已通过 .env 打包在代码中）。

执行并透传： 调用对应的 sendMessage(prompt, context, modelId)，将流数据吐回给 UI。
