第一阶段：跨端架构搭建与 WebApp 模式 MVP 实现 (最终修订版)
阶段目标： 产出一个以浏览器插件形式运行的聊天原型。要求网络通信与数据存储双重解耦，成功劫持网页版鉴权，并实现打字机效果的持久化对话。

1. 跨端工程物理结构设计 (Monorepo)
为确保代码能同时支持浏览器插件（Web App）和纯客户端（Desktop），工程严格解耦：

构建工具： 使用 pnpm workspaces 或 Turborepo。

packages/core/ (纯业务逻辑与契约层)：

存放所有的接口定义（Interfaces）、大模型通信实现、本地存储实现。

绝对禁区： 严禁包含任何 DOM 操作、Vue 组件或特定宿主的 API（如 chrome.* 或 Tauri API 的直接裸调）。

packages/ui/ (纯视图组件层)：

包含 Vue 3 组件（聊天框、Markdown 渲染器）。只负责“接收数据渲染”和“触发事件”。

apps/extension/ (浏览器插件宿主)：

使用 WXT 框架。负责组装 core 和 ui，注入特定的环境依赖（如实例化 IndexedDB 存储、建立 Background 长连接）。

2. 双核抽象设计 (Provider Pattern)
在 packages/core/src/interfaces/ 中定义两大核心契约，UI 层只认契约，不认实现。

A. 网络通信契约：IModelProvider
TypeScript
export interface IModelProvider {
  id: string; // 如：'chatgpt-web'
  checkAuth(): Promise<boolean>;
  sendMessage(
    prompt: string,
    context: { parentMessageId?: string, conversationId?: string },
    onUpdate: (chunk: string) => void
  ): Promise<{ text: string, conversationId: string, messageId: string }>;
  abort(): void;
}
B. 数据持久化契约：IStorageProvider (新增核心设计)
TypeScript
export interface Conversation {
  id: string;
  title: string;
  messages: Array<{ role: 'user' | 'assistant', content: string, id: string }>;
  updatedAt: number;
}

export interface IStorageProvider {
  id: string; // 如：'indexeddb-storage', 'sqlite-storage'
  saveConversation(chat: Conversation): Promise<void>;
  getConversation(id: string): Promise<Conversation | null>;
  getAllConversations(): Promise<Conversation[]>;
  deleteConversation(id: string): Promise<void>;
}
3. WebApp 模式的网络通信架构 (规避 CORS)
采用 “真实 Provider + UI 替身 (Proxy)” 架构解决跨域与流式传输问题：

真实的请求引擎 (packages/core/src/providers/ChatGPTWebProvider.ts)： 纯粹的 Fetch 机器，负责拼接 Payload、发起请求、解析 SSE 流。

宿主后台环境 (apps/extension/entrypoints/background.ts)： 实例化真实的 ChatGPTWebProvider（利用其跨域特权），监听 UI 长连接，代理转发 Prompt 和 SSE 流。

UI 层的替身 (apps/extension/src/utils/BackgroundProxyProvider.ts)： 伪装成大模型给 UI 调用，内部负责建立 connect 连通后台。

4. API 逆向实现设计 (定向参考开源源码)
编写 ChatGPTWebProvider.ts 时，定向提取（但不直接引用）开源项目如 ChatGPTBox 的纯函数逻辑：

鉴权： 模拟 GET https://chatgpt.com/api/auth/session 获取 accessToken。

防爬 (可选)： 模拟 POST .../sentinel/chat-requirements 获取 token。

Payload： 使用 uuid 生成 V4 格式 message_id，构造包含 action: 'next' 的深层 JSON。

SSE 流解析： 使用 TextDecoder('utf-8') 解码二进制块，按 \n\n 分割，剥离 data:  前缀，过滤 [DONE]，全量覆盖解析出的 parts[0] 文本。

5. 数据持久化的具体落位 (Storage 适配器)
利用我们设计的 IStorageProvider，实现第一阶段的存储方案：

底层实现 (packages/core/src/providers/IndexedDBStorageProvider.ts)：

引入 localforage 或 dexie.js，实现 IStorageProvider 的所有方法。

架构意义： 未来开发 Tauri 桌面端时，只需新建一个 SqliteStorageProvider.ts 实现相同接口，UI 层零感知。

状态层接入 (Pinia / UI 侧)：

在 apps/extension/ 的全局状态中注入 IndexedDBStorageProvider 实例。

用户每次对话结束（或接收完完整的 SSE 流）后，调用 storage.saveConversation(currentChat) 落盘。

插件启动时，调用 storage.getAllConversations() 渲染侧边栏历史记录。