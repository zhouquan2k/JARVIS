## Context

在目前第一阶段（phase-1）中，ChatPrism 仅硬编码接入了 ChatGPT Web 端的功能。用户的提供商（Provider）和模型配置依赖于浏览器存储（`chrome.storage`）且往往与实际请求高度耦合。这导致系统扩展性差，难以快速接入如 Google Gemini API 等其他服务，同时用户在切换不同模型时缺乏直观、高效的界面指引（需依赖“设置中心”等隐藏较深的菜单，或者完全没有）。第二阶段旨在引入一套极简的静态配置方案，并在聊天主界面实现 Provider 与 Model 的二级联动选择机制，通过打通 Gemini Pro API 来验证这套更具灵活性的扩展架构。

## Goals / Non-Goals

**Goals:**
- **配置即数据**：通过 `APP_CONFIG` 常量统一定义全局支持的 Provider 和 Model 清单；
- **配置解耦与无状态后台**：Background 层负责纯粹的消息路由和对象实例化，不再管理或查询用户偏好配置。每一次请求均自带充足上下文（`providerId`, `modelId` 等）；
- **动态 UI 适配**：实现无需设置面板的即时联动下拉菜单（Cascading Selectors）；
- **落地验证**：开发并实装能处理 SSE 数据流的 `GeminiApiProvider`；
- **安全验证**：密钥信息不进代码库，由 `.env` 安全注入并由打包工具按需注入到运行时（Vite/WXT 环境）。

**Non-Goals:**
- 将配置信息存入数据库或允许用户自定义编辑、添加 Provider（本阶段采用硬编码的 TypeScript 静态结构）；
- 兼容旧的 `chrome.storage` 模型配置（全面转向请求携带配置模式）；
- 实现复杂的密钥配置面板（暂只考虑通过环境变量内置或开发者手动配置 `.env`）。

## Decisions

### 1. 采用结构化静态常量管理模型级联树
- **Rationale**: 静态 `config.ts` 可以轻松提供 TypeScript 的类型约束及智能提示，性能开销极小。这避免了过早引入复杂的配置管理或数据库系统。同时，能直接作为前端二级联动下拉框的数据源，大大简化了 UI 与系统的同步成本。
- **Alternative**: 将配置存入 `IndexDB` 或通过云端接口获取。考虑到当前项目仍在试点及早期迭代阶段，引入额外的网络请求设计会增加复杂度。
- **Files Changed**:
  - `[NEW] packages/core/config.ts`
- **Change Description**:
  - 创建全局常量 `APP_CONFIG`，包含 `providers` 列表。每个 provider 定义支持的 `models` (包含 `id` 和 `name`) 和 `defaultModel`。

### 2. UI 组件化“二级联动选择器”
- **Rationale**: 主界面上方直接暴露当前选择的系统状态，所见即所得。用户先选 Provider，触发次级（Model）选择器的默认项重置和列表更新。
- **Alternative**: 放在深层的偏好设置页面中。但这需要开发完整的表单、增加模块耦合性。
- **Files Changed**:
  - `[MODIFIED] apps/extension/src/App.tsx` (主聊天界面入口)
  - `[NEW] packages/ui/components/ProviderModelSelector.tsx` (级联选择器组件)
- **Change Description**:
  - 在主界面聊天区域引入级联下拉框。下拉框 1 读取 `APP_CONFIG.providers` 获取列表。下拉框 2 根据选项展示对应的 `models` 列表并选中 `defaultModel`。用户发送信息时打包提交 `{ providerId, modelId }`。

### 3. Background 无状态工厂路由模式及核心接口升级
- **Rationale**: extension 的 background 空闲时容易休眠。直接把模型信息作为请求 Payload 传给 Background 充当分发器，可以获得最高的吞吐和确定性，避免隐式依赖。
- **Alternative**: Background 层维护用户模型状态，每次有发消息请求时，先去查状态再去构建网络请求。但这破坏了纯洁性。
- **Files Changed**:
  - `[MODIFIED] packages/core/interfaces/IModelProvider.ts`
  - `[MODIFIED] apps/extension/background/messages.ts` (基于背景消息路由代理)
- **Function/Method Signatures Changed**:
  - `IModelProvider.sendMessage` 将额外的可选参数封装成对象类，如：`sendMessage(prompt: string, options?: { context?: any, modelId?: string }): Promise<void> | AsyncGenerator<string>`，使接口演进更清晰。
  - UI 至 Background 的请求 payload 结构变为 `{ providerId, modelId, prompt, context }`。
- **Change Description**:
  - 更新 `IModelProvider` 接口以支持 `modelId`。在 Background 层修改消息接收器，应用工厂模式：若 `providerId` 等于 `'chatgpt-web'` 则实例化 `ChatGPTWebProvider`；若等于 `'gemini-api'` 实例化 `GeminiApiProvider`，再将带有 `modelId` 的请求透传执行。 

### 4. 采用 SSE 原生解析实现 `GeminiApiProvider` 
- **Rationale**: 为实现流式返回体，原生 `fetch` 搭配 `TextDecoderStream` 足以完成，无需庞大的 SDK。
- **Files Changed**:
  - `[NEW] packages/core/providers/GeminiApiProvider.ts`
  - `[MODIFIED] packages/core/providers/ChatGPTWebProvider.ts`
- **Function/Method Signatures Changed**:
  - 两者 `sendMessage` 实现增加 `modelId` 入参消费。
- **Change Description**:
  - 编写 `GeminiApiProvider`，从环境变量（或预编译的 `.env` 中 `WXT_GEMINI_API_KEY`）读取关键信息，组装到 `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`，解析 SSE 流。
  - 微调 `ChatGPTWebProvider`：在向 `backend-api/conversation` 发送时，将硬编码 `model: 'auto'` 替换为前端传来的 `modelId`。
## Risks / Trade-offs

- **[Risk] 硬编码 API Key 在 .env 中可能因构建配置不当而意外打入前端包被提取** → **Mitigation**: 深入了解和限制打包工具对 `process.env` 或 `import.meta.env` 的暴露范围。确信在 Extension 项目中（有 background 与 content scripts 的隔离），只在安全层（例如 Background 进程）读取和使用这些凭据，或只提供个人用户级的密钥进行内部验证，而不作为公网流通版本。
- **[Risk] SSE 流式解析时数据包截断 (Chunk Fragmentation)** → **Mitigation**: 不要假设一次读取的 chunk 刚好是一个完整的 JSON 块。需要实现一个基于 `\n\n` 甚至是特定模式的缓冲区解析器（Buffer Parser），以从流中可靠重装和解析出有效的对象。
- **[Risk] 无状态的 Background 在 Provider 需复杂初始化时可能有性能损耗** → **Mitigation**: 若初始化成本极高（例如启动长连接服务器），可以引入短生命周期的内存缓存机制来复用 Provider 实例对象，同时仍保持单次请求数据包结构的隔离独立性。
