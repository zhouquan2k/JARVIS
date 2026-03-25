## 1. Core contracts and persistence

- [x] 1.1 扩展 `packages/core/config.ts` 中的模型目录类型，为 `ModelConfig` 增加模型功能选项元数据结构，并补齐静态 Provider 配置中的首批 option 定义
- [x] 1.2 扩展 `packages/core/src/interfaces/IModelProvider.ts` 与相关 runtime/catalog 逻辑，使 `SendMessageOptions` 支持 `modelOptions` 并在模型目录加载流程中保留 option 元数据
- [x] 1.3 扩展 `packages/core/src/interfaces/IStorageProvider.ts` 及对应序列化/克隆逻辑，为 `Conversation` 增加 `modelSelection` 并保证旧会话兼容读取

## 2. Chat store and normal-chat UI

- [x] 2.1 在 `packages/ui/src/store/chat.ts` 中新增模型功能选项状态管理与规范化逻辑，包括默认值装配、冲突项裁剪、会话级持久化和会话恢复
- [x] 2.2 新增普通聊天模型功能控件组件，并在 `packages/ui/src/views/NormalChatView.vue` 中集成，使其随当前模型动态显示、隐藏和禁用
- [x] 2.3 调整普通聊天会话切换、新建会话和发送链路，确保 `providerId`、`modelId` 与 `modelOptions` 在当前会话中正确恢复并随发送请求透传

## 3. Provider and transport integration

- [x] 3.1 更新 `packages/core/src/providers/ChatGPTWebProvider.ts`，把 `web_search` 与 `deep_research` 选项翻译为 ChatGPT Web 请求行为，并保持多模态发送和流式解析兼容
- [x] 3.2 更新 `packages/core/src/providers/GeminiApiProvider.ts`，把 `deep_research` 选项翻译为 Gemini 请求行为，并保持现有普通聊天路径可回退
- [x] 3.3 校准 Web/Extension 运行时透传链路，包括 runtime catalog、Background Proxy 协议别名和 Provider 解析器，确保 `modelOptions` 在两个宿主中都能完整传递

## 4. Tests and verification

- [x] 4.1 补充 core/store/provider 单测，覆盖模型目录 option 元数据、会话恢复、模型切换时的冲突裁剪、存储兼容性以及 Provider 请求透传
- [x] 4.2 使用 Playwright 为普通聊天补充 e2e 用例，验证模型功能控件的展示、切换、持久化恢复和发送行为；若覆盖 extension 宿主，则按 MV3 要求使用 `channel: 'chromium'`
- [x] 4.3 完成相关测试回归；若执行了 extension e2e，则在通过后运行 `pnpm --filter extension build`
