## Context

当前实现的核心限制比较明确：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IModelProvider.ts` 的 `sendMessage` 仅接收 `prompt`、`context` 与 `modelId`，无法表达附件。
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts` 中的 `Conversation.messages` 只有 `{ role, content, id }`，无法持久化附件与渲染注解。
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/utils/proxyProtocol.ts` 与 `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/utils/BackgroundProxyProvider.ts` 只支持纯文本代理，无法在插件场景转发多模态负载。
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue`、`/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/ConversationSidebar.vue` 与 `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/ConversationWorkspaceView.vue` 仍是浅色、有边框、表单式布局，不符合 phase-8 目标中的暗色沉浸与极简线程风格。
- 共享 UI capability 已重命名为 [conversation-workspace/spec.md](/Users/quanzhou/Workspace/ChatPrism/openspec/specs/conversation-workspace/spec.md)，后续文档与实现都应以新名称为准。

这次变更同时涉及数据模型、provider 协议、浏览器插件消息转发和共享 UI，是典型的跨模块改动；如果没有设计文档约束数据形态，后续 specs 很容易各自定义不同的附件结构和渲染语义。

## Goals / Non-Goals

**Goals:**

- 在 `core -> provider -> host -> UI -> storage` 全链路中引入统一的附件模型，支持图片与通用文件。
- 在 provider 层完成响应标准化，避免 `cite`、`image_group` 等私有标记泄漏到 UI 渲染层。
- 让 Web 与 Extension 共用一套暗色极简聊天工作区（类似与Chatgpt）、附件输入体验与消息渲染方式，并统一挂在 `conversation-workspace` capability 下。
- 保证历史恢复、导入和同步链路可以兼容带附件/注解的新消息结构。

**Non-Goals:**

- 不处理 10MB 以上文件的分片、断点续传或服务端文件托管。
- 不在本阶段引入独立后端文件存储服务；Gemini 与插件代理均采用内联编码传输。
- 不重做 compare 工作流本身，只保证普通聊天工作区与共享样式体系可与 compare 共存。
- 不追求覆盖所有 provider 的复杂富媒体协议，仅覆盖本仓库现有的 ChatGPT Web 与 Gemini API。

## Decisions

### 1. 以“结构化消息”替代匿名消息对象，附件与注解都进入核心模型

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IModelProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/IndexedDBStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/IndexedDBStorageProvider.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.test.ts`

建议签名：

```ts
export interface MessageAttachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  size: number;
  base64Data?: string;
  previewBase64?: string;
}

export interface MessageAnnotation {
  kind: 'cite' | 'image_group';
  start?: number;
  end?: number;
  label?: string;
  payload: Record<string, unknown>;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: MessageAttachment[];
  annotations?: MessageAnnotation[];
}

export interface Conversation {
  // ...
  messages: ConversationMessage[];
}
```

变更说明：

- 把消息对象从匿名内联类型提取为稳定接口，后续 specs 可以直接围绕 `ConversationMessage` 写 requirement。
- 用户消息保存附件，助手消息保存标准化注解；两者都进入存储层，以支持历史恢复与跨端同步。
- `base64Data` 仅用于当前会话发送与本地恢复；对于图片预览额外保存 `previewBase64`，避免 UI 渲染时再次读取原文件。
- 旧会话兼容策略为“字段可选 + 读取时补默认值”，不做强制迁移脚本。

备选方案：

- 直接保存 `File`/`Blob` 被拒绝，因为 Extension Background 消息转发和持久化都不适合保留原始对象。
- 只在 UI store 暂存附件、不写入 `Conversation` 被拒绝，因为历史恢复后会丢失多模态上下文。

### 2. Provider 输出统一为“文本 + 注解”的流式更新，不让 UI 解析厂商私有 token

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IModelProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/ChatGPTWebProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/GeminiApiProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createProviderRuntime.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/testing/createMockRuntime.ts`

建议签名：

```ts
export interface SendMessageOptions {
  context?: { parentMessageId?: string; conversationId?: string };
  modelId?: string;
  attachments?: MessageAttachment[];
}

export interface ProviderStreamUpdate {
  text: string;
  annotations?: MessageAnnotation[];
}

export interface ProviderSendResult {
  text: string;
  conversationId: string;
  messageId: string;
  annotations?: MessageAnnotation[];
}

sendMessage(
  prompt: string,
  options: SendMessageOptions,
  onUpdate: (update: ProviderStreamUpdate) => void
): Promise<ProviderSendResult>;
```

变更说明：

- `ChatGPTWebProvider` 负责把附件组装进 ChatGPT Web 请求体，并在解析 SSE 时把 `cite`、`image_group` 等私有结构转成 `MessageAnnotation[]`。
- `GeminiApiProvider` 负责把图片/文件映射为 Gemini `inlineData`/`parts` 结构，文本仍走 SSE 流式返回；如果 Gemini 没有额外注解，`annotations` 可为空。
- `onUpdate` 从单纯字符串升级为结构化更新，避免 UI 后续再做 provider-specific 正则清洗。

契约细化如下：

这里的核心约定是：

- `text` 是最终可渲染、可持久化的正文基底。
- `annotations` 不是独立正文内容，而是附着在 `text` 上的结构化语义映射。
- `annotations` 的作用是为“正文中的一段文本”或“正文中的某个渲染位置”补充额外语义，从而支持引用、图片组等增强渲染。
- 这个模型与 ChatGPT Web 一类 provider 的真实返回形态一致：provider 往往同时给出正文内容和额外元数据，前端负责把二者组合成最终 UI，而不是直接消费一棵完整 AST。

```ts
export type MessageAnnotation =
  | CiteAnnotation
  | ImageGroupAnnotation;

export interface AnnotationRange {
  start: number; // 基于 text 的 UTF-16 offset，闭区间起点
  end: number;   // 基于 text 的 UTF-16 offset，开区间终点
}

export interface CiteAnnotation {
  kind: 'cite';
  range: AnnotationRange;
  payload: {
    refId: string;
    label: string;        // UI 展示用，如 "[1]"
    title?: string;
    url?: string;
    snippet?: string;
  };
}

export interface ImageGroupAnnotation {
  kind: 'image_group';
  range: AnnotationRange | null; // 若图片组不嵌入文本，可为 null
  payload: {
    groupId: string;
    images: Array<{
      id: string;
      mimeType: string;
      alt?: string;
      previewBase64?: string;
      remoteUrl?: string;
      width?: number;
      height?: number;
    }>;
  };
}
```

Provider 必须遵守以下规则：

- `text` 是“当前完整可渲染快照”，不是增量 patch。consumer 每次收到更新都用它覆盖当前 assistant 文本。
- `annotations` 仅用于增强 `text` 的语义，不得承载脱离正文存在的第二份主内容。
- `annotations` 与 `text` 属于同一快照，所有 `range` 都必须以该次 `text` 为基准计算，不允许引用原始 provider 响应中的偏移。
- Provider MUST 在发出更新前清洗掉厂商私有 token；例如 `cite`、`image_group` 这类标记不能直接泄漏到 `text`。
- Provider MUST 保证 `annotations` 按视觉出现顺序排序；同一 `range` 上若存在多个注解，排序必须稳定。
- `cite` 的 `range` 必须指向 `text` 中实际可见的一段正文，通常是引用占位文本如 `[1]`；若 provider 无法稳定映射文本位置，则不得伪造 offset，而应退化为普通文本输出。
- `image_group` 若作为独立块渲染，可设置 `range: null`；这表示它不是“修饰某一段文本”，而是挂在当前正文快照的某个块级渲染位置，由 UI 按块级内容渲染。
- `onUpdate` 的最后一次快照 SHOULD 与 `ProviderSendResult` 一致；若存在差异，以最终返回的 `ProviderSendResult` 为准，并覆盖前一次快照。
- Provider SHOULD 尽量保持 `text` 单调扩展；若因 token 清洗或 markdown 归一化导致尾部重写，重写范围必须局限在尚未稳定的尾段，不得大范围回退已确认内容。
- 对于 provider 无法结构化表达的特殊内容，优先保留为普通文本；不要生成半完整的 `annotations`。

Consumer 侧约束也需要固定下来：

- `packages/ui` 与 proxy 层只消费标准化后的 `text + annotations`，不得再依赖 provider 私有正则。
- UI 对 `annotations` 的理解必须遵循“正文增强”模型：内联注解修饰正文中的一段文本，块级注解修饰正文中的一个渲染位置。
- 存储层持久化 assistant 消息时，必须把最终 `text` 与最终 `annotations` 一并保存，保证历史恢复结果与实时渲染一致。
- mock runtime 和测试桩也必须按相同契约返回结构化快照，避免测试仍停留在纯文本模型。

备选方案：

- 在 UI 层做正则清洗被拒绝，因为这会把 provider 私有协议泄漏到视图层，且 Web/Extension 需要重复实现。
- 仅用 Markdown 占位符表达引用和图片组被拒绝，因为悬浮引用与图片组渲染仍需要结构化元数据。

### 3. Extension 继续以 Background 作为真实请求边界，但代理协议升级为附件感知

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/utils/proxyProtocol.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/utils/BackgroundProxyProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/entrypoints/background.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/providerRuntime.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/testing/createMockRuntime.ts`

建议签名：

```ts
export interface ProviderSendOptions {
  context?: { parentMessageId?: string; conversationId?: string };
  modelId?: string;
  attachments?: MessageAttachment[];
}

export interface UpdateResponse extends ProxyResponseBase {
  type: 'UPDATE';
  chunk: ProviderStreamUpdate;
}
```

变更说明：

- UI 侧统一把附件转成 `base64Data` 后再进入 proxy 协议，Background 只做无状态路由与流式回传，不承担文件持久化。
- `requestId/channelId` 相关联机制保持不变，避免普通聊天、对比分析和附件发送互相串流。
- 这样 Web 与 Extension 共享 `IModelProvider` 语义，只是 Extension 多了一层序列化/反序列化。

备选方案：

- 直接在 UI 侧调用 provider 并跳过 Background 被拒绝，因为插件环境仍受 CORS 和权限限制。
- 在 proxy 中传 `ArrayBuffer` 而不是 Base64 暂不采用，因为当前 phase 目标优先是打通链路和持久化一致性，而不是极致传输效率。

### 4. 共享 UI 采用统一暗色主题变量，并把输入、附件预览和富消息渲染拆成独立组件

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/ConversationWorkspaceView.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/ConversationSidebar.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/MarkdownContent.vue`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/App.vue`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/App.vue`
- 新增文件建议：
  - `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/AttachmentComposer.vue`
  - `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/MessageAttachmentStrip.vue`
  - `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/MessageAnnotationLayer.vue`
  - `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/theme/chatgpt-dark.css`

建议状态与方法：

```ts
interface ChatState {
  // ...
  draftAttachments: MessageAttachment[];
  attachmentError: string | null;
  lightboxImages: MessageAttachment[];
  lightboxIndex: number;
}

queueAttachments(files: File[]): Promise<void>
removeDraftAttachment(attachmentId: string): void
clearDraftAttachments(): void
sendMessage(prompt: string): Promise<void>
```

变更说明：

- `chat.ts` 新增“草稿附件”状态，统一处理点击上传、拖拽和粘贴图片三种入口。
- `NormalChatView.vue` 只负责组合交互：暗色输入区、附件卡片、拖拽高亮、发送/停止按钮和图片预览入口。
- `MarkdownContent.vue` 继续负责正文 markdown，新增的注解层单独渲染引用上标、图片宫格和暗色预览遮罩，避免把所有富媒体逻辑塞进 markdown 组件。
- `ConversationSidebar.vue` 改为更紧凑的扁平历史列表，默认隐藏非关键操作按钮，仅在 hover/focus 时显示；历史项只保留标题，不展示“本地”或日期等冗余信息。
- 左上角“新建聊天”采用分裂按钮：主按钮点击即普通新建，右侧下拉仅负责选择“普通聊天/对比聊天”；菜单在点击外部区域后自动关闭。
- “聊天/导入”来源切换按宿主控制：Extension 显示，Web 默认隐藏，以保证两端主流程一致且信息噪声可控。
- 对比模式沿用与普通模式一致的模型选择组件和暗色输入组件，避免出现两套视觉不一致的选择器实现。
- 消息线程采用角色对齐表达语义：用户输入靠右并使用强调色气泡，助手内容靠左按正文渲染，不再显示 `YOU/ASSISTANT` 标签。
- 引用渲染改为正文内联可点击链接；消息底部不再依赖纯编号按钮列表作为唯一入口。
- 主题变量集中到 `chatgpt-dark.css`，由 Web/Extension 宿主统一引入，避免两个宿主各自维护一套颜色和间距。
- OpenSpec capability 层面，上述共享 UI requirement 统一落在已改名后的 `conversation-workspace` 下，不再拆回宿主 spec。

备选方案：

- 只改 `NormalChatView.vue` 样式被拒绝，因为 sidebar、workspace shell 和宿主容器也需要统一深色变量。
- 把附件选择逻辑直接写死在宿主 `App.vue` 被拒绝，因为共享 UI 包才是 Web/Extension 的共同实现面。

### 5. 以“增量兼容”方式落地测试与迁移，先确保旧数据可读，再补多模态 E2E

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/ChatGPTWebProvider.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/GeminiApiProvider.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/tests/e2e/normal-chat.spec.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/tests/e2e/extension-host.spec.ts`

变更说明：

- 单测先覆盖旧会话兼容、附件序列化、provider 注解标准化和 chat store 的附件草稿状态。
- Web E2E 验证拖拽/粘贴上传、附件卡片、暗色线程和历史恢复。
- Extension E2E 验证 Base64 附件经 Background 转发后能正确发送并恢复；由于沙盒限制，执行时需要提权并使用 `channel: 'chromium'`。
- Extension E2E 通过后执行 `pnpm --filter extension build`，把这一步作为 phase-8 完成条件之一。
- specs 书写策略上，直接在 `conversation-workspace` 下表达新的共享 UI 边界；宿主 spec 仅描述接入与运行时约束。

## Risks / Trade-offs

- [附件使用 Base64 会放大存储体积] -> 通过 10MB 上限、图片缩略图与未来可替换的持久化策略控制风险。
- [ChatGPT 私有响应结构可能持续变化] -> 规范化逻辑集中在 provider 层，UI 只消费稳定的 `MessageAnnotation`。
- [富消息渲染会拉高共享 UI 复杂度] -> 将 markdown、附件条和注解层拆分为独立组件，降低耦合。
- [旧会话与新会话结构并存] -> 采用可选字段和读取时归一化，避免一次性迁移失败阻断用户数据。
- [Extension 多模态 E2E 易受浏览器环境影响] -> 固定使用 `channel: 'chromium'` 并在验证通过后立即执行构建，减少环境漂移。

## Migration Plan

1. 先在 `packages/core` 引入附件/注解接口，并让存储层对旧数据保持向后兼容读取。
2. 再改造 `ChatGPTWebProvider`、`GeminiApiProvider` 与 Extension proxy 协议，确保运行时能产生结构化更新。
3. 随后在 `conversation-workspace` spec 与 `packages/ui` 中同步引入草稿附件状态、暗色主题变量与富消息渲染组件。
4. 再让 `web-host-app` 与 `extension-host-app` 只声明各自对 `conversation-workspace` 的宿主接入要求。
5. 最后补 Web/Extension 测试并执行 Extension 构建验证。

回滚策略：

- 若 provider 侧多模态链路不稳定，可保留结构化消息模型，但临时禁用上传入口和注解渲染。
- 若 UI 改版造成体验回退，可仅回滚 `packages/ui` 主题与组件层，核心协议仍保持向后兼容。
- 若改名后的 capability 与历史归档文档存在表述差异，以当前 `conversation-workspace` spec 为准，不再回退到旧命名。

## Open Questions

- 非图片文件在 UI 中是仅显示文件卡片，还是需要为特定类型（如 PDF）提供轻量预览？
- 多端同步场景下是否需要为大体积附件消息增加额外清理策略，避免 IndexedDB 与同步载荷增长过快？
