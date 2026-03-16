## Context

当前共享工作台由 `packages/ui/src/views/ConversationWorkspaceView.vue` 负责承载左侧历史侧边栏和右侧聊天内容区，右侧普通聊天视图落在 `packages/ui/src/views/NormalChatView.vue`。现状已经支持多模态输入、流式中断、外部历史预览与导入，但仍有几个明显缺口：

- 会话内没有“问题级大纲”，只能按消息流线性滚动，长对话定位成本高。
- `packages/ui/src/views/NormalChatView.vue` 当前把 `Enter` 直接绑定为发送，无法自然输入多段落提示词，也没有 `Ctrl/Cmd + Enter` 的显式发送规范。
- `packages/ui/src/store/chat.ts` 的 `abort()` 只会中断 provider 并清理 `isGenerating`，不会把刚发出的提示词回填回来，因此“停下来修改后重发”的闭环不完整。
- `packages/ui/src/components/ConversationSidebar.vue` 当前本地历史项只有切换入口，没有删除能力，临时会话会持续堆积在左侧列表中。
- `packages/core/src/interfaces/IStorageProvider.ts` 里的 `ConversationMessage` 目前只有 `id / role / content / attachments / annotations`，无法表达 phase-10 所需的问题分组、星标、软删除和时间戳等元数据。
- Web 宿主实际使用 `SyncStorageProvider`，其服务端校验位于 `apps/server/src/types/sync.ts`；如果消息模型增加字段但同步层不跟进，多端恢复后会出现元数据丢失。
- `packages/core/src/providers/SyncStorageProvider.ts` 当前 `deleteConversation()` 对普通聊天会话采用 `sync.deleted = true` 的 tombstone 语义并保留本地记录等待同步，这和本次“左侧删除即本地与服务器侧都做硬删除”的目标不一致。

这次变更跨越核心消息模型、Local-First 持久化、聊天 store、共享 UI 以及同步校验，是一个典型的跨模块增量改造，适合先用设计文档把状态边界与数据流固定下来。

## Goals / Non-Goals

**Goals:**

- 在现有 `conversation-workspace` 中增加右侧问题索引面板，让用户可以按问题而不是按整段消息流管理长对话。
- 为每组“用户问题 + 紧随其后的助手回复”建立稳定的分组标识，并支持星标与软删除状态持久化。
- 让右侧索引、主线程渲染和本地持久化都围绕同一份核心会话数据工作，避免派生状态各自维护。
- 在左侧本地历史列表中增加仅 hover 可见的会话删除入口，让用户可以直接清理整条会话，并把删除同步到服务器侧。
- 把输入交互调整为桌面端生产力习惯：`Enter` 换行，`Ctrl/Cmd + Enter` 发送，停止生成后恢复草稿并聚焦。
- 保证新增元数据在本地存储、同步传输与会话恢复链路中无损保留，同时让整会话删除以硬删除而不是长期 tombstone 的方式跨端收敛。

**Non-Goals:**

- 不在本阶段实现全文搜索、标签体系、问题摘要生成或自动聚类。
- 不改变 compare 工作流的交互边界；右侧问题索引只服务于普通聊天线程。
- 不引入新的远端表结构或专门的“问题索引表”；问题索引信息仍附着在现有会话消息结构内。
- 不在本阶段实现“撤销删除”UI；问答对删除继续使用软删除语义，以保留后续扩展空间。
- 不为左侧整会话删除提供回收站、撤销或批量删除能力；确认删除后即按硬删除处理。

## Decisions

### 1. 用共享 `questionId` 和消息级状态字段表达问答对，而不是额外维护独立索引表

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/IndexedDBStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/types/sync.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/IndexedDBStorageProvider.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.test.ts`

建议签名：

```ts
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
  questionId?: string;
  starred?: boolean;
  deleted?: boolean;
  attachments?: MessageAttachment[];
  annotations?: MessageAnnotation[];
}
```

变更说明：

- 每次发送新问题时，用户消息和随后生成的助手消息共享同一个 `questionId`，把它们视为一个“问答对”。
- `starred` 只对用户问题有业务意义，但为了简化同步结构，字段仍可存在于任意消息节点；UI 只读取用户消息上的该状态。
- `deleted` 在软删除时会同时写到同一 `questionId` 下的用户/助手消息；渲染层与上下文构建层统一据此过滤。
- `createdAt` 用于稳定排序、滚动定位和后续 ScrollSpy 的观察目标回退，不再完全依赖数组顺序推断时间。
- 旧会话缺失这些字段时按未星标、未删除、无分组处理；首次编辑该会话时再补齐字段即可，不做离线迁移。

备选方案：

- 维护单独的 `QuestionIndexEntry[]` 侧表被拒绝，因为它会与 `messages[]` 形成双写，刷新、同步和删除时很容易漂移。
- 仅在 UI store 临时维护星标/删除状态被拒绝，因为刷新或多端同步后会丢失状态。

### 2. 问题索引列表作为 `chatStore` 的派生状态生成，删除过滤只作用于本地可见线程与持久化状态

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue`

建议状态与方法：

```ts
type QuestionIndexFilter = 'all' | 'starred';

interface QuestionIndexItem {
  questionId: string;
  title: string;
  starred: boolean;
  deleted: boolean;
  messageId: string;
}

questionIndexFilter: QuestionIndexFilter;
activeQuestionId: string | null;
pendingScrollQuestionId: string | null;
draftPrompt: string;
lastSubmittedPrompt: string | null;

questionIndexItems(state): QuestionIndexItem[]
visibleMessages(state): ConversationMessage[]
setQuestionIndexFilter(filter: QuestionIndexFilter): void
toggleQuestionStar(questionId: string): Promise<void>
softDeleteQuestionPair(questionId: string): Promise<void>
requestScrollToQuestion(questionId: string): void
setActiveQuestion(questionId: string | null): void
```

变更说明：

- `questionIndexItems` 从当前会话的用户消息派生而来，只提取未被过滤条件排除的用户问题，不额外持久化摘要列表。
- `visibleMessages` 基于 `deleted !== true` 规则构建，用于驱动主线程渲染、问题索引和本地可见状态；既有远端会话上下文保持 provider 当前续聊语义，不在本阶段重建。
- 删除操作按 `questionId` 一次性标记一组问答对；若旧消息缺失 `questionId`，则退化为“当前用户消息 + 紧随其后的第一条助手消息”。
- 每次切换星标、删除或发送成功后，store 负责统一保存整条 `Conversation`，而不是由组件直接操作存储层。
- 对依赖远端 `conversationId` 续聊的 provider，软删除不会尝试回写远端历史；如果后续需要“过滤后继续聊”的能力，应以“从可见消息重建新分支上下文”另立变更实现。

备选方案：

- 在 `QuestionIndexPanel.vue` 内部单独维护索引数组被拒绝，因为滚动联动、本地可见过滤和持久化都需要共享状态，组件私有状态会失真。

### 3. 把输入草稿提升到 store，统一实现快捷键发送和“停止后回填”

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue`

建议签名：

```ts
interface ChatState {
  draftPrompt: string;
  lastSubmittedPrompt: string | null;
}

setDraftPrompt(prompt: string): void
sendDraft(): Promise<void>
abortGeneration(): void
```

变更说明：

- 现有 `NormalChatView.vue` 中的本地 `inputPrompt` 状态迁移到 store，避免“组件里有草稿、store 里不知道”的分裂。
- 发送时把当前 `draftPrompt` 复制到 `lastSubmittedPrompt`，随后清空 `draftPrompt` 并进入生成态。
- `abortGeneration()` 在调用 provider `abort()` 后，把 `lastSubmittedPrompt` 回填到 `draftPrompt`，并由视图层在下一个 tick 聚焦输入框。
- 输入框键盘规则改为：裸 `Enter` 插入换行，`Ctrl+Enter` / `Meta+Enter` 触发 `sendDraft()`；UI 通过 placeholder 或提示文案展示快捷键。

备选方案：

- 保持输入框完全为组件本地状态被拒绝，因为停止生成的动作在 store 层，无法可靠地跨层恢复草稿。

### 4. 右侧问题索引作为独立组件接入 `ConversationWorkspaceView`，用 store 传递滚动与高亮信号

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/ConversationWorkspaceView.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/QuestionIndexPanel.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/theme/chatgpt-dark.css`

建议结构：

```vue
<section class="workspace-shell">
  <ConversationSidebar />
  <div class="workspace-main">
    <NormalChatView />
    <QuestionIndexPanel />
  </div>
</section>
```

变更说明：

- `QuestionIndexPanel.vue` 负责“全部 / 仅看星标”切换、条目 hover 操作、内联删除确认和点击滚动。
- `NormalChatView.vue` 为每个用户问题根节点输出 `data-question-id` 锚点，并在滚动容器上使用 `IntersectionObserver` 或节流滚动监听更新 `activeQuestionId`。
- 面板点击条目时只写入 `pendingScrollQuestionId`；主线程视图观察到该值后执行 `scrollIntoView({ behavior: 'smooth' })`，避免兄弟组件直接互持 DOM 引用。
- 主线程删除动画和索引列表移除动画由 CSS 过渡处理，但数据层先写软删除状态，再让渲染层基于可见消息列表收缩消失。

备选方案：

- 把右侧面板直接塞进 `NormalChatView.vue` 被拒绝，因为它属于工作台级布局，不应与具体聊天视图强耦合。
- 直接在组件间传递 DOM ref 被拒绝，因为这会让 workspace、面板和消息视图形成脆弱的双向依赖。

### 5. 同步层按“扩展消息 schema、保留全量会话”处理，不单独为问答索引引入新同步协议

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/types/sync.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/tests/sync-api.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/tests/sync-service.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/sync.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/sync.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/routes/sync.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/services/syncService.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/repositories/syncRepository.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/tests/sync-repository.test.ts`

变更说明：

- `SyncConversation.messages[*]` 的校验器接受 `createdAt`、`questionId`、`starred`、`deleted` 等新增可选字段，并在标准化时保留下来。
- 问答对级别的星标与软删除仍继续附着在整条 `Conversation` 上同步，不新增“部分消息补丁”协议，避免放大冲突合并复杂度。
- 左侧会话级删除不再继续复用 `conversation.sync.deleted` 作为长期 tombstone，而是新增独立的删除事件载荷并沿用现有 push / pull 通道传播。
- 服务端在接收到会话删除事件后，必须物理移除当前 `syncKey` 下对应的会话聚合，同时写入带游标的删除事件，使其他客户端 pull 时也能删除本地副本而不是把 tombstone 当作普通会话恢复出来。
- 这样可以让 Web 和 Extension 在现有同步拓扑下直接共享问题索引状态，同时把左侧整会话删除实现为真正的跨端硬删除。

备选方案：

- 为问题索引单独设计一条同步 API 被拒绝，因为它会与整会话同步形成两套事实来源，收益不足。

### 6. 左侧本地历史删除采用 hover-only 入口和整会话硬删除，而不是列表常驻操作或消息级软删除

涉及文件：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/ConversationSidebar.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/ConversationWorkspaceView.vue`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/IndexedDBStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/SyncStorageProvider.test.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/types/sync.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/services/syncService.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/repositories/syncRepository.ts`

建议签名：

```ts
// packages/ui/src/components/ConversationSidebar.vue
(event: 'delete-local', id: string): void;

// packages/ui/src/store/chat.ts
deleteLocalConversation(id: string): Promise<void>

// packages/core/src/interfaces/IStorageProvider.ts
deleteConversation(id: string): Promise<void>

// apps/server/src/types/sync.ts
interface SyncDeletedConversation {
  id: string;
  updatedAt: number;
}

interface PushRequestBody {
  conversations: SyncConversation[];
  deletedConversations?: SyncDeletedConversation[];
}

interface SyncPullResponse {
  conversations: SyncConversation[];
  deletedConversations: SyncDeletedConversation[];
  nextCursor: number;
}
```

变更说明：

- `ConversationSidebar.vue` 的本地历史项默认只展示标题；当条目进入 hover 或键盘 focus 态时，右侧才显示“删除”按钮，避免在紧凑列表里常驻破坏阅读节奏。
- 点击“删除”后使用轻量二次确认，再由 `ConversationWorkspaceView.vue` 把删除事件交给 `chatStore.deleteLocalConversation(id)`，而不是由组件直接碰存储层。
- `deleteLocalConversation()` 只作用于左侧本地历史，不对外部历史预览列表暴露同样的删除入口；如果删除的是当前活动会话，store 必须优先切换到剩余最近一条本地会话，否则创建一条新的空白会话，避免右侧主线程悬空。
- `IndexedDBStorageProvider.deleteConversation()` 对本地会话执行真正的物理删除，不在本地保留 tombstone 记录。
- `SyncStorageProvider.deleteConversation()` 需要拆成“两步”：先把会话从本地正常会话集合中移除，再把一条 `deletedConversations` 删除事件放入本地待同步队列；删除事件一旦被服务端确认即可清理，不再把已删除会话继续留在本地列表中。
- 服务端同步仓库把“会话聚合”和“删除事件”作为两类数据管理：收到删除事件时删除 `synced_conversations` 中对应记录，并把删除事件写入带 `server_cursor` 的事件流，使后续 `pull` 可以广播给其他客户端。
- 客户端处理 `pull.deletedConversations` 时，若本地存在相同 `id` 且其 `updatedAt` 不晚于删除事件，则直接物理删除；若本地有更新且尚未同步的新版本，则忽略陈旧删除事件并在后续 push 中以更晚版本覆盖。

备选方案：

- 在左侧历史项常驻删除图标被拒绝，因为它会显著增加紧凑列表的视觉噪音，尤其在移动鼠标扫读标题时干扰较大。
- 继续使用 `conversation.sync.deleted` tombstone 被拒绝，因为用户目标是“直接删除”，而不是让被删会话以隐藏记录形式长期留在本地和服务端。

## Risks / Trade-offs

- `[风险]` 问题索引完全依赖用户消息的 `questionId` 分组，若旧会话或异常流式过程没有正确补齐，删除和 ScrollSpy 可能退化。
  `[缓解]` 统一在 `sendMessage` 路径生成 `questionId`，并对旧数据保留“用户消息 + 紧随其后助手消息”的回退逻辑。

- `[风险]` 右侧面板、主线程、输入区三处同时依赖 `chatStore`，如果派生 getter 分散实现，容易出现 UI 和本地可见状态不一致。
  `[缓解]` 将“可见消息”和“问题索引项”收敛到同一组 getter / helper，由组件只读消费。

- `[风险]` ScrollSpy 在长列表里高频触发，可能造成活跃条目抖动或额外重渲染。
  `[缓解]` 优先使用 `IntersectionObserver`；若回退到滚动监听，则在 store 更新层节流，只在活跃问题变化时写状态。

- `[风险]` 停止生成后只恢复提示词，不恢复流式中途产生的助手文本，用户可能误以为可以续写到同一条回复。
  `[缓解]` UI 文案明确“停止后可修改提示词并重新发送”，并把中断结果视为未完成回答而不是可续写草稿。

- `[风险]` 整会话硬删除不再保留 tombstone，会让跨端同步必须额外维护删除事件流，否则其他客户端无法得知该会话已经被移除。
  `[缓解]` 在服务端增加带游标的 `deletedConversations` 事件输出，并让 `SyncStorageProvider` 为删除事件维护独立 outbox。

- `[风险]` 如果当前活动会话被删除后没有立即切换到安全目标，会导致右侧线程仍引用已不存在的会话。
  `[缓解]` 将“删除后选择下一条会话或新建空会话”收敛到 `chatStore.deleteLocalConversation()` 内统一处理，组件层不自行决定。

## Migration Plan

1. 先以可选字段方式扩展 `ConversationMessage`、本地存储标准化逻辑和同步校验，不对旧会话做强制迁移。
2. 扩展同步载荷与服务端存储模型，为整会话硬删除引入独立删除事件流，并让服务端在接收删除后物理移除对应会话记录。
3. 在 `chatStore` 中加入 `questionId` 生成、索引派生、本地可见过滤、草稿回填、滚动状态管理以及整会话删除后的选中回退逻辑。
4. 接入 `QuestionIndexPanel.vue` 与 `NormalChatView.vue` 的锚点联动、快捷键和问答对删除交互；同时在 `ConversationSidebar.vue` 中加入 hover 显示的会话删除入口。
5. 补充 store 单测、UI 组件测试、同步层与服务端删除事件测试、Web E2E；如扩展场景覆盖到新索引行为，再补扩展宿主 E2E，并按项目要求提权运行后执行 `pnpm --filter extension build`。
6. 若需要回滚，旧版本会忽略新增消息可选字段；但整会话硬删除协议与服务端删除事件需要成对回滚，不能只回退 UI。

## Open Questions

- 星标状态是否只在当前会话内生效，还是后续需要在左侧历史列表中暴露“该会话包含星标问题”的汇总态？本次设计默认仅在会话内使用。
- 删除后的问答对是否要影响会话标题自动生成策略？本次默认不回写标题，仅影响主线程渲染、问题索引和本地持久化结果。
