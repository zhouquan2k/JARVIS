## Context

当前核心命名存在三类语义问题：

1. `IStorageProvider` 与 `IConversationStorageProvider` 方法签名完全一致，但名字暗示了两套抽象。
2. `IHistoryProvider` 实际表达的是“外部会话来源”，与本地历史、同步历史等概念容易混淆。
3. `ProviderRuntime` 实际只服务于模型 provider 的解析与实例化，但名称过宽，容易让人误解为统一管理所有 provider 家族。

这次变更是跨 `packages/core`、`packages/ui` 与三个宿主应用的横切重构，重点是先收敛名称和导出边界，不在第一阶段同时改动所有方法名与文档系统。设计目标是让调用方按新命名迁移，同时保持运行时行为、存储语义和外部历史导入链路不变。

## Goals / Non-Goals

**Goals:**

- 建立 `IConversationPersistProvider` 作为唯一的会话持久化主契约。
- 建立 `IExternalConversationProvider` 作为唯一的外部会话来源主契约。
- 建立 `ModelProviderRuntime` 作为模型 provider 装配主契约，并同步更新主要工厂/类型导出。
- 为核心导出、宿主 runtime、UI store、同步接入点和测试桩提供一致的迁移路径。
- 在必要位置保留过渡兼容导出，降低一次性改名对现有模块的破坏性。

**Non-Goals:**

- 本阶段不把 `getHistoryList` / `getHistoryDetail` 立即重命名为 `getConversationList` / `getConversationDetail`。
- 本阶段不重构 `ConversationHistorySummary`、`ExternalHistoryProviderId` 等所有相关类型名。
- 本阶段不处理非核心代码文档、架构图、历史方案文档中的所有旧命名残留。
- 本阶段不引入新的 provider 家族管理总线，也不改变运行时实例缓存策略。

## Decisions

### 1. 以“新增主名 + 兼容别名”的方式迁移接口导出

原因：

- 代码内直接全量替换旧名风险较高，尤其 `packages/core/src/index.ts` 被多个宿主与测试广泛复用。
- 保留短期兼容导出可以把风险集中在内部迁移，而不是一次性打断所有调用方。

备选方案：

- 方案 A：直接删除旧接口名并全仓硬切换。
  放弃原因：改动面过大，容易在 tests、宿主 proxy 和类型导出边界遗漏。
- 方案 B：只新增新名，不迁移主要调用方。
  放弃原因：会继续保留双命名并存，无法完成语义收敛。

涉及文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IStorageProvider.ts`
  计划调整为保留 `Conversation` 等数据模型定义，并新增/导出：
  `export interface IConversationPersistProvider { id: string; saveConversation(chat: Conversation): Promise<void>; getConversation(id: string): Promise<Conversation | null>; getAllConversations(): Promise<Conversation[]>; deleteConversation(id: string): Promise<void>; }`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IConversationStorageProvider.ts`
  计划改为过渡桥接文件，导出或别名到 `IConversationPersistProvider`，避免继续承载独立主定义。
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IHistoryProvider.ts`
  计划新增/导出：
  `export interface IExternalConversationProvider { id: ExternalHistoryProviderId; getHistoryList(options?: HistoryListQueryOptions): Promise<ConversationHistorySummary[]>; getHistoryDetail(externalId: string): Promise<Conversation>; }`
  并让 `ExternalHistoryProviderEntry.provider` 指向新接口。

### 2. 将模型运行时类型统一收敛到 `ModelProviderRuntime`

原因：

- 当前 `ProviderRuntime` 的职责仅限模型 provider，名称不精确会误导后续架构演进。
- 对比工作流、Agent 运行时和宿主 proxy 都依赖这组类型，命名统一后能减少“模型 provider runtime”和“其它 provider”之间的语义噪声。

备选方案：

- 方案 A：仅改接口名，不改工厂与类型文件名。
  优点：迁移成本较低。
  缺点：类型名和工厂名不一致，后续认知负担仍然存在。
- 方案 B：接口名、工厂函数名和类型文件一起改。
  采用原因：这次变更主题本身就是收敛命名，工厂和类型不同步会留下明显债务。

涉及文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/providerRuntime.types.ts`
  计划改为导出 `ModelProviderRuntimeOptions`、`ModelProviderFactory`、`ModelProviderOptionsResolver`、`ModelProviderRuntime`。
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createProviderRuntime.ts`
  计划改为：
  `export function createModelProviderRuntime(options: ModelProviderRuntimeOptions): ModelProviderRuntime`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/runtime/createAgentRuntime.ts`
  计划把 `providerRuntime: ProviderRuntime` 更新为 `providerRuntime: ModelProviderRuntime`。
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/workflows/compare/CompareWorkflowController.ts`
  计划把构造参数 `runtime: ProviderRuntime` 更新为 `runtime: ModelProviderRuntime`。

### 3. 宿主和 UI 侧同步替换主调用点，但不改行为

原因：

- 真正的运行风险主要不在接口定义，而在宿主代理层、UI store 和同步接入点的调用一致性。
- 这些模块必须跟随主导出名一起迁移，否则会产生“核心新名 + 应用旧名”的割裂。

备选方案：

- 方案 A：只改 core，不动 apps 和 ui。
  放弃原因：仓内调用仍会依赖旧名，无法验证收敛结果。
- 方案 B：同步替换关键调用点，但不修改业务流程。
  采用原因：改动集中且行为面更可控。

涉及文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`
  计划把 `storageProvider: IStorageProvider | null` 更新为 `storageProvider: IConversationPersistProvider | null`；
  把 `resolveHistoryProvider(...): IHistoryProvider | null`、`setHistoryProvider(provider: IHistoryProvider)` 等签名更新为 `IExternalConversationProvider`。
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/providerRuntime.ts`
  计划把 `providerRuntime` 初始化从 `createProviderRuntime(...)` 切换为 `createModelProviderRuntime(...)`；
  把 `createWebHistoryProvider(...): IHistoryProvider` 更新为 `IExternalConversationProvider`。
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/providerRuntime.ts`
  计划把 `createExtensionProxyRuntime(): ProviderRuntime` 更新为 `createExtensionProxyRuntime(): ModelProviderRuntime`；
  把历史 provider 返回类型更新为 `IExternalConversationProvider`。
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/providerRuntime.ts`
  计划同步 desktop runtime 和 history provider 的新命名。
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/entrypoints/background.ts`
  计划把 `RuntimeDeps.createProviderRuntime`、`runtimePromise: Promise<ProviderRuntime>`、`resolveHistoryProvider(...): Promise<IHistoryProvider>` 等签名改为新命名。
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/sync.ts`
  `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/sync.ts`
  `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/sync.ts`
  计划把 `localStore?: IStorageProvider` 更新为 `localStore?: IConversationPersistProvider`。

### 4. 测试优先覆盖“命名迁移未改变行为”

原因：

- 这次变更本质上是 API/类型重构，最容易漏的是导出边界、宿主 proxy 签名和运行时工厂引用。
- 与其新增复杂行为测试，不如优先锁定编译层与关键运行时路径的兼容性。

备选方案：

- 方案 A：只依赖类型检查和构建。
  放弃原因：无法覆盖 runtime proxy 的实例获取行为。
- 方案 B：补充最小单元/集成验证，并在宿主侧保留可运行的 Playwright 回归。
  采用原因：更符合本次变更的风险面。

涉及文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createProviderRuntime.test.ts`
  计划迁移到新工厂命名，并保留 provider 过滤、fresh 实例与 catalog 回退断言。
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.test.ts`
  计划把 mock 类型替换为新接口名，验证历史导入与本地存储行为不变。
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/providerHost.test.ts`
  `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/chatStore.integration.test.ts`
  计划同步替换 runtime / history provider / storage provider 类型名，确保代理宿主和导入链路仍可工作。

## Risks / Trade-offs

- [兼容导出保留时间过长] → 在本次实现里明确“新名为主、旧名仅桥接”，并在后续清理任务中删除旧名。
- [文件重命名导致 import 路径大面积变化] → 第一阶段优先改导出名和工厂名，必要时保留旧文件转发，避免一次性改动所有路径。
- [宿主 proxy 漏改类型导致编译通过但运行时报错] → 对 web、desktop、extension 三端 runtime 初始化与 history provider 解析分别保留测试。
- [旧命名残留在文档和图中造成认知不一致] → 本次先不承诺清全量文档，只在 change 制品里记录为后续清理项。

## Migration Plan

1. 先在 core 接口层引入 `IConversationPersistProvider`、`IExternalConversationProvider`、`ModelProviderRuntime` 与对应工厂/类型导出。
2. 更新 core 内部实现类、runtime、compare/agent 依赖与 index 导出。
3. 更新 ui store、web/desktop/extension 三端 runtime 与 sync 接入点。
4. 更新测试桩、单元测试和集成测试中的类型引用。
5. 运行 lint、类型检查、构建和目标回归，确认行为未变。
6. 若发现兼容导出仍被广泛引用，则保留桥接并在后续变更中清理；若出现大面积回归，优先回滚到旧导出名而不回滚行为逻辑。

## Open Questions

- 是否在本次实现里同步把 `createProviderRuntime.ts`、`providerRuntime.types.ts` 文件名也重命名，还是只改导出符号名并保留文件路径桥接？
- `ExternalHistoryProviderId`、`ConversationHistorySummary` 等“history”命名相关类型是否应在下一阶段继续收敛，还是保持现状以控制改动面？
- `IStorageProvider.ts` 当前同时承载会话模型定义和存储接口，是否要在后续进一步拆分为 `conversation.types.ts` 与 `IConversationPersistProvider.ts`？
