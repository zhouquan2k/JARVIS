## Context

当前系统已经具备 Provider/Model 级联选择能力，但模型目录只包含 `id` 和 `name`，`sendMessage` 只支持 `modelId`、上下文、附件和历史消息，缺少“模型功能选项”的统一表达。普通聊天 store 将 `currentProviderId` 和 `currentModelId` 保存在运行时状态中，但不会把它们写入 `Conversation`，因此会话重开后无法恢复某个会话当时使用的模型功能配置。

phase-11 已经明确本次范围：
- 仅覆盖普通聊天
- 选项按会话记忆
- UI 使用独立 toggle，而不是单选模式
- 当前首批功能项为 ChatGPT 的 `web_search`、`deep_research` 和 Gemini 的 `deep_research`

这意味着本次设计既是 UI 增量，也是跨 `core / ui / provider / storage` 的数据契约变更。

## Goals / Non-Goals

**Goals:**
- 为模型目录提供统一的功能选项定义，支持 UI 动态渲染。
- 为消息发送链路增加 `modelOptions` 参数，并保持 Web 与 Extension 运行时协议一致。
- 为普通聊天会话持久化当前 `providerId`、`modelId` 与已启用选项，保证会话恢复后行为一致。
- 在切换模型时自动处理不兼容选项，并确保发送给 Provider 的选项集合合法。
- 让 ChatGPT 与 Gemini Provider 能消费首期模型选项。

**Non-Goals:**
- 不改造 Compare 流程。
- 不为每条历史消息记录“发送当时”的模型功能快照。
- 不支持布尔开关以外的复杂参数类型。
- 不在本期引入设置页或全局默认项管理。

## Decisions

### 1. 扩展 core 契约，统一描述模型功能选项

需要修改的文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/config.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IModelProvider.ts`

需要调整/新增的签名：
```ts
interface ModelOptionDefinition {
  key: string;
  label: string;
  type: 'boolean';
  description?: string;
  conflictsWith?: string[];
  defaultValue?: boolean;
}

interface ModelConfig {
  id: string;
  name: string;
  options?: ModelOptionDefinition[];
}

interface SendMessageOptions {
  context?: { parentMessageId?: string; conversationId?: string };
  modelId?: string;
  attachments?: MessageAttachment[];
  history?: ProviderContextMessage[];
  modelOptions?: Record<string, boolean>;
}
```

变更说明：
- `ModelConfig` 直接携带 `options`，让静态配置、动态模型目录和 UI 共享同一份结构。
- `SendMessageOptions` 增加 `modelOptions`，避免在 Provider 内部再做 UI 状态读取或硬编码。
- `ProviderModelCatalog` 维持现有形态，只是其中的 `models` 元素扩展为带 `options` 的 `ModelConfig`。

选择原因：
- 把功能选项挂在模型级别，比挂在 provider 级别更精确，便于未来同一 provider 下不同模型支持不同功能。
- 沿用 `SendMessageOptions` 可直接复用 extension proxy 协议别名，减少跨端协议分叉。

备选方案：
- 将功能项定义放到独立 registry：可复用但需要额外映射，不适合当前小范围首期。
- 把选项直接做成 provider 私有参数：实现快，但会让 UI 和 provider 强耦合，后续难以扩展。

### 2. 会话持久化采用 Conversation 级模型配置，而不是全局设置

需要修改的文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`

需要调整/新增的签名：
```ts
interface ConversationModelSelection {
  providerId: string;
  modelId: string;
  modelOptions: Record<string, boolean>;
}

interface Conversation {
  id: string;
  backendId?: string;
  title: string;
  origin?: ConversationOrigin;
  externalId?: string;
  messages: ConversationMessage[];
  updatedAt: number;
  sync?: ConversationSyncState;
  modelSelection?: ConversationModelSelection;
  compare?: { ... };
}
```

```ts
setCurrentModelProvider(providerId: string, modelId?: string): Promise<void>
setCurrentModel(modelId: string): void
setCurrentModelOption(key: string, enabled: boolean): void
sendDraft(): Promise<void>
startNewConversation(): Promise<void>
```

变更说明：
- `Conversation.modelSelection` 作为会话级配置快照，保存当前普通聊天会话的 Provider、模型和启用选项。
- `startNewConversation()` 初始化新会话时写入当前选择。
- `setCurrentModelProvider()`、`setCurrentModel()`、`setCurrentModelOption()` 在状态变化后同步回写 `currentConversation.modelSelection`。
- 恢复本地会话时，如果会话存在 `modelSelection`，则优先用它恢复当前选择；如果字段缺失，则回退到当前默认 Provider/Model 行为。
- 切换模型后，保留仍被新模型支持的已启用选项，移除不存在或冲突的选项，再补上新模型 `defaultValue=true` 的项。

选择原因：
- 需求明确要求“按会话记忆”，因此不能只放在全局 UI 状态。
- 将 `modelSelection` 放在 `Conversation` 顶层可以让所有存储实现天然无损保存，不需要新增侧表。

备选方案：
- 使用全局最近一次模型设置：实现简单，但不能满足会话级恢复。
- 为每条消息保存选项快照：信息最完整，但超出当前范围，也会放大会话体积和渲染复杂度。

### 3. UI 保持 Provider/Model 选择器不变，新增独立功能开关区

需要修改/新增的文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/ProviderModelSelector.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/ModelOptionToggleGroup.vue`（新增）

需要调整/新增的签名：
```ts
// 新组件建议 props / emits
options: ModelOptionDefinition[]
value: Record<string, boolean>
disabled?: boolean

emit('change', { key: string, enabled: boolean })
```

变更说明：
- `ProviderModelSelector.vue` 继续只负责 provider/model 选择，不把功能 toggle 混进原有双下拉组件。
- `NormalChatView.vue` 在现有 Provider/Model 选择器同一行渲染新的 `ModelOptionToggleGroup`，保持输入工具栏紧凑。
- 当模型没有任何 `options` 时，不渲染该区域。
- 正在生成、未鉴权、模型目录加载中时，toggle 与模型选择器一并禁用。
- 每个 toggle 默认展示图标与开关；功能名称与补充说明通过 hover/focus tooltip 与 `aria-label` 暴露，而不是始终常显文字。
- ChatGPT 的 `web_search` 与 `deep_research` 通过 `conflictsWith` 表示冲突；用户打开其中一个时，store 自动关闭冲突项并刷新 UI。

选择原因：
- 不改动 Compare 的 A/B 选择组件结构，避免本次范围外连锁修改。
- 将功能 toggle 与模型选择放在同一行，可以减少输入区垂直占用，同时保留独立组件边界，避免 Compare 视图被卷入本次改动。

备选方案：
- 把 toggle 塞进 `ProviderModelSelector.vue`：组件更重，且会直接波及 Compare 视图。
- 用单选模式切换“标准/搜索/研究”：与已确认的独立 toggle 交互不一致。

### 4. Provider 层只做选项翻译，合法性由 store 先行保证

需要修改的文件：
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/ChatGPTWebProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/GeminiApiProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/utils/proxyProtocol.ts`

需要调整/新增的签名：
```ts
sendMessage(
  prompt: string,
  options: SendMessageOptions,
  onUpdate: (update: ProviderStreamUpdate) => void
): Promise<ProviderSendResult>
```

变更说明：
- `SendMessageOptions` 扩展后，Background Proxy 直接沿用 `ProviderSendOptions = SendMessageOptions`，无需单独定义新的传输结构。
- `chat.ts#sendDraft()` 负责把当前会话的 `modelOptions` 一并传给 provider。
- `ChatGPTWebProvider` 根据 `modelOptions.web_search`、`modelOptions.deep_research` 构造请求负载；若二者同时存在，以 store 预处理后的合法结果为准。
- `GeminiApiProvider` 根据 `modelOptions.deep_research` 切换相应请求行为；若当前模型不支持该项，则忽略该标记。

选择原因：
- 把合法性校验前置到 store，能避免 Provider 各自重复实现冲突解析。
- Proxy 侧沿用核心接口别名，可以保证 web/extension 两端一致。

备选方案：
- 每个 Provider 自己校验冲突：更分散，行为更难统一测试。
- 让 UI 组件自己处理冲突：可见行为正确，但存储和发送链路仍可能收到脏数据。

### 5. specs 只修改现有 capability，不新增独立 capability

涉及的 capability：
- `core-interfaces`
- `conversation-workspace`
- `storage-provider`
- `chatgpt-web-provider`
- `gemini-api-provider`

变更说明：
- 本次不是引入新的业务域，而是为现有模型契约、会话工作区和 provider 能力补齐“模型选项”维度。
- 这样 specs 阶段可以直接为现有能力追加 delta，避免出现一个“模型选项”新 capability 再横切修改多个旧 spec 的双重维护。

## Risks / Trade-offs

- [动态模型目录与静态配置不一致] → 对动态加载到的模型采用“有 `options` 则渲染，没有则视为无功能项”，避免阻塞现有模型可用性。
- [旧会话不含 `modelSelection`] → 恢复时回退到当前默认 Provider/Model，并在首次用户修改后补写该字段。
- [ChatGPT / Gemini 真实请求参数与当前假设不完全一致] → Provider 实现阶段先在现有请求构造上做最小增量，若目标平台不接受某选项则返回明确错误，不 silent fail。
- [toggle 冲突逻辑分散] → 冲突解析统一收敛到 chat store，UI 只展示结果，Provider 只消费结果。
- [功能项未来可能不止 boolean] → 本次 `ModelOptionDefinition` 先锁定 `type: 'boolean'`，后续若引入枚举/数值项，再在同一结构上扩展。

## Migration Plan

1. 先扩展 core 契约和会话模型，保证新字段可被存储实现无损保存。
2. 再调整 chat store，使会话恢复、模型切换和 `modelOptions` 透传行为可用。
3. 最后接入普通聊天 UI 与 Provider 请求翻译。
4. 回滚时可先移除 UI 和 Provider 行为，再保留 `modelSelection` 字段作为向后兼容的冗余数据，不会破坏旧会话读取。

## Open Questions

- ChatGPT Web 与 Gemini 当前各自的“Deep Research”请求参数字段，需要在实现阶段基于现有 provider 请求结构做一次最小验证；若目标接口没有稳定字段，需要决定是走显式报错还是临时隐藏该功能项。
