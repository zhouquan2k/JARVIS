# 模型特定功能选项方案

## Summary
为普通聊天页增加“随模型动态变化的功能选项”能力，首期覆盖 `ChatGPT` 和 `Gemini`，并按你的选择采用：
- 仅普通聊天支持
- 选项按会话记忆
- UI 以独立开关呈现，而不是单选模式

目标是让用户在选择模型后，只看到该模型支持的功能项，并把当前会话的模型与功能设置一起保存，后续消息默认沿用。

## Key Changes
### 1. 扩展模型目录元数据，给每个模型声明可用功能项
核心落点：
[packages/core/config.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/config.ts)
[packages/core/src/interfaces/IModelProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IModelProvider.ts)

建议把现有 `ModelConfig` 从只有 `id/name`，扩成“模型 + 可选功能项定义”：
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
```

同时扩展发送参数：
```ts
interface SendMessageOptions {
  context?: { parentMessageId?: string; conversationId?: string };
  modelId?: string;
  attachments?: MessageAttachment[];
  history?: ProviderContextMessage[];
  modelOptions?: Record<string, boolean>;
}
```

首期能力映射建议：
- `chatgpt-web`
  - `web_search`
  - `deep_research`
  - 两者通过 `conflictsWith` 标为互斥；UI 仍是 toggle，但打开一个时自动关闭冲突项
- `gemini-api`
  - `deep_research`

这样数据模型仍是“独立开关”，但不会把实现逼成不合法组合。

### 2. 把当前会话的模型配置持久化
核心落点：
[packages/core/src/interfaces/IStorageProvider.ts](/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts)
[packages/ui/src/store/chat.ts](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts)

因为你要求“按会话记忆”，会话对象需要保存当前聊天配置。建议在 `Conversation` 顶层增加：
```ts
interface ConversationModelSelection {
  providerId: string;
  modelId: string;
  modelOptions: Record<string, boolean>;
}

interface Conversation {
  ...
  modelSelection?: ConversationModelSelection;
}
```

聊天 store 的行为固定为：
- 新建会话时，用当前全局选择初始化 `conversation.modelSelection`
- 切 provider / model / option 时，立即同步写回当前会话
- 打开历史会话时，恢复 `providerId + modelId + modelOptions`
- 若某个已保存选项在当前模型下已不存在，自动忽略并在下次保存时清理
- 这些设置只影响“后续发送”，不回写旧消息

需要新增或调整的 store 行为：
- `setCurrentModelProvider(providerId: string, modelId?: string)`：切模型时重算可用选项
- `setCurrentModel(modelId: string)`：切模型时载入该模型的默认 option，并合并会话内已保存值
- 新增 `setCurrentModelOption(key: string, enabled: boolean)`
- `sendDraft()`：把 `modelOptions` 一并传给 provider

### 3. 普通聊天页增加动态功能区
核心落点：
[packages/ui/src/views/NormalChatView.vue](/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue)

UI 建议放在现有 provider/model 选择器下方，作为第二行“模型功能”区域：
- 当前模型无功能项：不展示该区域
- 当前模型有功能项：展示 toggle 列表
- toggle 文案直接使用模型元数据里的 `label`
- 有 `description` 时用简短辅助说明或 tooltip
- 打开某个与其他项冲突的选项时，自动关闭冲突项，并给轻量提示
- 正在生成时禁用切换，和当前模型选择器保持一致

交互规则固定为：
- 切 provider：重算模型目录与默认模型，再恢复该会话下能兼容的 option
- 切 model：保留仍然兼容的 option，移除不兼容项；若新模型声明 `defaultValue=true` 的项，则自动补上
- 用户手动修改 option 后，当前会话后续消息默认继承

### 4. Provider 适配层只负责“翻译选项”，不做产品态决策
实现边界：
- `chatStore` 保证传出去的是合法 `modelOptions`
- 每个 provider 自己把 `modelOptions` 转成对应请求参数
- provider 不认识的 option 直接忽略，并在测试中覆盖
- 本期不扩展 compare、不扩展历史导入、不做消息级 option 回显

## Test Plan
需要覆盖的场景：
- 普通聊天页选择不同 provider / model 时，功能区按模型动态显示
- `chatgpt-web` 显示 `web_search` 和 `deep_research`，且互斥逻辑正确
- `gemini-api` 仅显示 `deep_research`
- 无功能项模型不显示功能区，发送链路不受影响
- 在同一会话中切换功能项后，下一条消息继续沿用
- 关闭应用或切换会话后重新进入，能恢复该会话的 `provider/model/options`
- 已保存 option 在新版本模型目录中不存在时，恢复流程不报错，并自动清理
- `sendDraft()` 最终向 provider 传入正确的 `modelOptions`
- 正在生成时，provider/model/options 均不可编辑

## Assumptions
- 首期只做普通聊天页，不进入 Compare 流程
- 首期 UI 只支持布尔型 toggle，不做下拉、数值等复杂参数
- “按会话记忆”是保存当前会话的最新配置，不做“每条消息单独记录当时开了什么”
- `ChatGPT` 的联网搜索与 `Deep Research` 视为冲突能力；虽然 UI 是独立开关，但不能同时生效
- 若后续要扩到 compare，沿用同一套 `ModelOptionDefinition + modelOptions` 协议即可，不需要重做底层抽象
