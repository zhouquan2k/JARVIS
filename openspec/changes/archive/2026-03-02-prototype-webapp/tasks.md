## 1. 核心契约与基础结构搭建 (Core Interfaces)

- [x] 1.1 初始化 `packages/core`, `packages/ui`, `apps/extension` 的 Monorepo 结构
- [x] 1.2 定义并导出 `IModelProvider` 接口 (`packages/core/src/interfaces/IModelProvider.ts`)
- [x] 1.3 定义并导出 `IStorageProvider` 接口 (`packages/core/src/interfaces/IStorageProvider.ts`)
- [x] 1.4 定义基础的 `Conversation` 与 `Message` 数据结构契约

## 2. ChatGPT Web 真实网络引擎实现 (API 逆向参考 ChatGPTBox)

- [x] 2.1 创建 `ChatGPTWebProvider.ts`，定向提取 [ChatGPTBox](https://github.com/josStorer/chatGPTBox) 开源项目的纯函数逻辑
- [x] 2.2 模拟 `GET https://chatgpt.com/api/auth/session` 实现 `checkAuth()` 获取 `accessToken`
- [x] 2.3 (可选) 模拟 `POST .../sentinel/chat-requirements` 接口获取防爬 `token`
- [x] 2.4 构造深层 JSON Payload：使用 `uuid` 生成 V4 格式 `message_id` 以及 `action: 'next'` 等字段
- [x] 2.5 发起 Fetch 请求，并使用 `TextDecoder('utf-8')` 解码 SSE 二进制流数据
- [x] 2.6 按 `\n\n` 分割数据流，剥离 `data: ` 前缀，过滤 `[DONE]` 标记，提取 `parts[0]` 文本全量覆盖回传
- [x] 2.7 实现 `abort()` 请求中断逻辑

## 3. Chrome 插件跨域代理通信层 (Extension Proxy)

- [x] 3.1 在 `apps/extension/entrypoints/background.ts` 中引入并实例化 `ChatGPTWebProvider`
- [x] 3.2 在 Background 脚本中建立 `chrome.runtime.onConnect` 长连接监听器，接收 UI 请求
- [x] 3.3 创建 `BackgroundProxyProvider.ts` (UI 替身)，实现与 `IModelProvider` 一致的接口
- [x] 3.4 在替身 `sendMessage` 中建立与 Background 的长连接，转发 prompt 并监听回传的流式数据
- [x] 3.5 处理代理层的断开连接与错误透传逻辑

## 4. 本地持久化存储适配器实现 (Storage Provider)

- [x] 4.1 引入 `localforage` (或 `dexie.js`) 作为 IndexedDB 封装库
- [x] 4.2 创建 `IndexedDBStorageProvider.ts` 并实现 `saveConversation()` 与 `getConversation()`
- [x] 4.3 实现 `getAllConversations()` 支持列表渲染，及 `deleteConversation()` 删除逻辑

## 5. UI 状态与依赖注入集成 (App Integration)

- [x] 5.1 在 `apps/extension` 的 Pinia 全局状态中注入 `IndexedDBStorageProvider` 和 `BackgroundProxyProvider` 实例
- [x] 5.2 将 UI 层的聊天组件发送事件关联至 `BackgroundProxyProvider.sendMessage`
- [x] 5.3 监听并渲染 SSE 流式文本的回调 (`onUpdate`) 实现打字机效果
- [x] 5.4 对话结束后调用 Storage Provider 的 `saveConversation` 实现本地落盘
- [x] 5.5 初始化时调用 `getAllConversations()` 渲染侧边栏历史记录列表

## 6. Browser Extension 打包与 UI 渲染 (WXT + Vue 3)

- [x] 6.1 初始化 WXT 框架，配置 `package.json` 及相关依赖项 (vue, pinia 等)
- [x] 6.2 在根目录配置 `pnpm-workspace.yaml` 把 `packages/core` 引入 extension 包
- [x] 6.3 配置 `wxt.config.ts`，声明 `host_permissions` 跨域权限 (`*://chatgpt.com/*`) 及打包入口
- [x] 6.4 创建 Vue 界面组件 (`apps/extension/src/App.vue` 或 Sidepanel 结构)，包含聊天输出区和输入框
- [x] 6.5 绑定 `useChatStore`，在界面中循环渲染聊天信息，并提供提交 prompt 交互
- [x] 6.6 跑通本地 `pnpm dev` 服务器热重载环境，打开浏览器面板验证网络及长连接
- [x] 6.7 执行 `npm run build` 命令打包插件，并生成本地构建物文件结构以便侧载安装
