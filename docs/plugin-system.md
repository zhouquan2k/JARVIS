# JARVIS 插件系统设计

## 原始需求

为 JARVIS 设计一个插件系统。插件可以动态安装/运行所需功能，后续也可以交给第三方扩展。当前已有的AI-Agent功能和任务管理功能可作为独立插件。

- JARVIS 的核心功能是 Markdown 文档工作区与文档编辑。
- AI 问答/辅助编辑、任务管理等能力按插件方式组织。
- 当前目标优先是核心解耦和能力按需启用，不以第三方生态开放为本期重点。
- 本期插件体系只覆盖前端功能；`IContextProvider` 等后端 / 上下文能力暂不拆分。
- 需要规划插件系统的包结构、插件目录结构，以及当前所需的核心类名、职责和主要方法原型。

## 详细需求

### 需求范围

- JARVIS 核心继续保留 Markdown 文档工作区、文档树组织、文档打开编辑保存等基础能力。
- 现有 AI 能力整体收敛为一个大粒度插件，当前对话视图可视为其全局视图。
- 现有任务管理能力收敛为一个独立插件，当前任务视图可视为其全局视图。
- 插件为全局启用，不与具体工作区绑定。
- 本期插件启用方式可通过简单配置文件实现，不要求先做插件管理 UI。
- 本期需要先抽出插件框架和已用到的扩展点，不预先设计大而全的插件能力模型。
- 后续插件应能围绕核心 Markdown 文档组织流程新增扩展点，例如按特定扩展流程创建新文档。

### 非目标

- 本期不建设第三方插件市场、签名体系、开放分发平台。
- 本期不拆分 `IContextProvider`、任务后端存储或其他后端能力协议。
- 本期不要求文档正文区域内直接显示任务 UI。
- 本期不预先定义所有未来扩展点，只在真实需要时按需增加。
- 本期不实现未来“视频 URL 生成总结文档”等具体业务插件，只为这类插件保留可扩展路径。

### 用户价值

- 让 JARVIS 的核心功能边界更清晰，避免 AI、任务等能力继续直接耦合进核心文档系统。
- 让用户可以按需启用能力，避免所有前端功能都硬编码进宿主。
- 让 AI 插件、任务插件以及后续插件在结构上彼此独立，降低演进和替换成本。
- 为后续围绕文档组织流程的能力增强预留一致的前端接入方式。

### 界面描述 (UI)

- 本期不以“插件管理 UI”作为重点，可先通过全局配置文件控制插件启用状态。
- AI 插件延续现有对话视图，作为 AI 插件的全局视图入口。另外还包含agent视图下右侧panel中的对话 tab。
- 任务插件延续现有任务视图，作为任务插件的全局视图入口。另外还包含agent视图下位于右侧 panel中的任务 tab。
- 后续如需新增围绕文档树的扩展行为，可通过树节点动作或新建文档流程入口挂接，但本期不要求完整 UI 闭环。

### 交互逻辑

1. 前端宿主启动时读取插件启用配置。
2. 插件系统加载已注册插件清单，仅激活启用的插件。
3. AI 插件在激活后向宿主注册其全局视图右侧panel tab，及当前需要的扩展点
4. 任务插件在激活后向宿主注册其全局视图、右侧 panel tab 等当前需要的扩展点。
5. 宿主根据注册结果组装前端入口，而不是继续硬编码所有功能入口。
6. 后续新插件如需支持“扩展流程创建新文档”，应通过新增明确扩展点接入核心 Markdown 文档组织流程。

## 推荐实现方案

### 架构设计

推荐将插件系统分为四层：

1. 宿主层：提供运行环境、桥接与组合根能力。
2. 文档核心与通用 UI 层：保留 Markdown 文档工作区、文档树、编辑保存以及通用 UI 容器能力。
3. 插件系统层：负责插件注册、启用、扩展点收集和宿主装配。
4. 插件实现层：AI 插件、任务插件及未来新增插件的独立实现。

插件系统当前仅面向前端能力，不改造后端能力边界。`IContextProvider` 仍由宿主前端直接使用，并在必要时透传给插件相关视图或逻辑。

#### 分层依赖原则（硬约束）

核心原则：**`core` 不依赖 `plugin-system`，且 `core` 可被 `ui` 等包依赖。** 由此 `ui` 中的文档核心 UI 作为宿主消费扩展点贡献时，只通过 `core` 的接口装配，不应了解 `plugin-system`；故消费侧契约（扩展点接口、查询接口）必须下沉到 `core`。

整体为无环 DAG：

```txt
core            不依赖任何包，纯契约（type-only、Vue 无关）
plugin-system   → core                                  运行时，实现 core 契约
ui              → core                                  消费契约，不依赖 plugin-system
plugins/*       → core + plugin-system                  并复用 ui 共享组件
apps/*          → core + ui + plugin-system             组合根，负责插件清单与加载机制
```

进一步的硬约束：

- `apps/*` 作为组合根，可以认识“内置插件清单、启用配置、插件加载机制”，但**不应直接静态 import 某个可选插件的具体 AI 实现**来完成宿主装配。宿主应通过通用插件启用/加载机制接入插件能力。
- `packages/core` 只保留宿主 / 文档核心 / 插件系统所需的最小稳定契约。`Conversation`、`IModelProvider`、`IConversationPersistProvider`、`ISyncTransport`、provider runtime、history / provider / storage / sync 等 AI 领域契约与实现，应整体视为 `ai-agent` plugin scope，而不是继续扩张 `core`。
- 宿主 / context 侧若必须接触会话查询，应优先依赖 `IConversationQueryProvider` 这类最小查询接口，而不是直接承担完整 AI 会话领域模型或实现的所有权。

#### 职责分配原则

- `apps/*` 是宿主层。宿主只负责提供运行环境、生命周期、IPC / bridge、文件系统 / 浏览器 / 存储等基础能力，以及插件启用与装配；宿主**不承载** AI、任务等业务逻辑。
- `packages/ui` 是文档工作区核心前端实现层。它负责 Markdown 文档工作区、文档树、文档编辑保存相关业务逻辑，以及工作区壳、布局容器、共享组件和扩展点消费；但不负责 AI / 任务插件领域规则、业务 store、业务 workflow。
- `plugins/*` 是业务实现层。AI、任务以及未来新增能力的领域模型、业务规则、状态管理、工作流、业务视图都应归属于对应插件。
- `packages/core` 是最小稳定契约层。它只保留宿主、文档核心、插件系统共同需要的最小接口与通用基础设施，不拥有 AI / 任务领域模型和业务语义。
- `packages/plugin-system` 是插件运行时层。它负责注册、激活、收集贡献和向宿主暴露统一查询能力，但不拥有具体业务实现。

#### 插件公共 API 原则

- 宿主、`packages/ui`、`packages/node`、`apps/server` 若确实需要接触插件领域类型，应依赖插件显式公开的稳定 `api` 入口。
- 非插件代码不得直接依赖 `plugins/*/src/*` 下的内部实现路径。
- 插件公开 `api` 应仅暴露宿主装配、跨进程桥接、最小查询所需的稳定契约；具体业务实现仍保留在插件内部。

### 包结构与目录规划

推荐的 monorepo 结构如下：

```txt
/apps
  /web
  /desktop
  /extension
  /server

/packages
  /core
  /ui
  /node
  /plugin-system

/plugins
  /ai-agent
  /task-mgr
```

推荐的职责边界如下：

- `packages/core`
  - 放最小、稳定、跨宿主共享、与具体前端实现无关的插件契约与纯类型，以及宿主 / 文档核心真正需要的通用基础设施，全部 **type-only、Vue 无关、零运行时或通用基础设施运行时**。
  - 具体包含：`PluginManifest`、`PluginEnablementConfig`、`PluginSetupApi`（具名注册方法）、各 `*Contribution` 泛型接口、`ContributionQuery` 只读查询接口（具名 getter），以及 `IContextProvider`、`IDocumentIdentity`、通用 `HttpApiError` / `HttpApiClient` / 文档编解码等与 AI 领域无关的宿主核心能力。
  - 注意：`core` 的定位由此从「跨宿主领域契约（含 server）」扩宽为「跨包契约（含前端插件 UI 契约）」。这些都是 type-only，server 复用时零运行时负担；如将来在意内聚性，可用子路径导出（如 `@jarvis/core/plugin`）分区，属 YAGNI，现不必做。
  - 代价：`PluginSetupApi` / `ContributionQuery` 枚举了全部扩展点，**新增扩展点时需在 core 增补对应方法**（本期仅 3 个，成本低）。
- `packages/plugin-system`
  - 放插件系统运行时：`PluginRegistry`（implements `ContributionQuery`）、`PluginManager`、激活流程。
  - 放各扩展点的 Vue 特化类型（可依赖 Vue）。
- `packages/ui`
  - 放 Markdown 文档工作区核心前端实现、插件相关 UI 宿主、渲染容器，以及未来可能的插件管理 UI。
  - 可以承载文档树、节点选择、文档打开/编辑/保存等属于核心工作区的业务逻辑。
  - 仅通过 inject 拿 `core` 的 `ContributionQuery` 装配视图 / tab；阶段性允许依赖插件公共 `api`，但**不得 import 插件内部实现路径**。
- `plugins/*`
  - 放具体插件实现，依赖 `core + plugin-system`，可复用 `ui` 共享组件；插件之间保持独立，不混入 `core` 或 `ui`。
  - `ai-agent` 插件除视图贡献外，还应逐步拥有自己的 AI 领域契约与实现，例如 `Conversation`、`IModelProvider`、conversation persistence / sync、model provider runtime、history/provider 适配器等，不再把这些内容长期放在 `packages/core`。
- `apps/*`（组合根）
  - 持有内置插件清单数组、实例化 registry/manager、运行激活，并把 registry 作为 `ContributionQuery` 注入 `ui`。
  - 组合根负责“插件清单与加载机制”，而不是通过硬编码 import 直接拥有某个可选插件的具体功能实现。

### 核心组件

#### `PluginManifest`

职责：

- 描述插件身份与版本信息。
- 描述默认启用状态。
- 作为插件注册入口，向宿主声明当前实际使用到的扩展点。

推荐放置位置：

- `packages/core`

当前主要方法原型：

```ts
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  defaultEnabled?: boolean;
  setup(api: PluginSetupApi): void | Promise<void>;
  dispose?(): void | Promise<void>;
}
```

说明：

- `setup` 收到的 `api` 是**按插件作用域的 facade**，会自动给该插件注册的每条 contribution 打上 `pluginId`（用于排序、运行时禁用回收、调试溯源）。
- `dispose` 用于运行时禁用时回收该插件注册的贡献。

#### `PluginEnablementConfig`

职责：

- 表达全局插件启用状态。
- 作为宿主启动时的前端配置输入。

推荐放置位置：

- `packages/core`

当前主要方法原型：

```ts
export interface PluginEnablementConfig {
  enabledPluginIds: string[];
}
```

说明：

- `enabledPluginIds` 为权威白名单，`manifest.defaultEnabled` 仅作缺省回退，白名单优先。
- 插件清单通过 app 组合根的静态数组 `builtinPlugins: PluginManifest[]` 发现，本期不做动态发现 / 第三方分发。

#### `PluginSetupApi`

职责：

- 作为插件唯一的宿主注册入口，按扩展点提供**具名注册方法**。
- 因 `*Contribution` 形状已在 `core`，这些方法只引用 `core` 类型，不会反向依赖 `plugin-system`。
- 新增扩展点时在此增补一个具名方法（本期仅 3 个，成本低）。

推荐放置位置：

- `packages/core`

当前主要方法原型：

```ts
// core
export interface PluginSetupApi {
  registerGlobalView(view: GlobalViewContribution): void;
  registerRightPanelTab(tab: RightPanelTabContribution): void;
  registerDocumentCreationFlow(flow: DocumentCreationFlowContribution): void;
}
```

说明：

- 方法签名用泛型默认的 `GlobalViewContribution<unknown>` 等；插件传入 Vue 特化的 `GlobalViewContribution<Component>` 可正常赋值。
- 本期不先引入 `PluginRuntimeContext` 的大而全设计。插件回收内部能力后仍需的少量宿主能力（`IContextProvider`、文档核心服务）以 `core` 接口表达、由宿主注入式提供（见「残留宿主能力」）。
- 若未来插件确实需要更多宿主能力，再按需增加受控接口。

### 当前收敛原则

- `packages/core` 不应继续作为 AI 总入口。对于 AI 插件专属的领域模型、provider 协议、runtime、storage、sync、history bridge，应归入 `plugins/ai-agent` 或其内部共享层。
- `apps/*` 不应通过静态 import 直接装配 AI 插件实现。宿主应通过统一的插件清单、启用配置和激活机制，按需接入 AI 插件贡献。
- 类似 `FileSystemContextProvider` 这类宿主 / context 实现，若确有会话查询需求，应优先依赖 `IConversationQueryProvider` 这类最小查询接口，而不是直接依赖完整 `Conversation` 领域实现。
- `packages/ui` 可以继续承载 Markdown 文档工作区本身的业务逻辑，但不应继续承载 AI / 任务插件业务 store、业务工作流或领域规则；此类逻辑应逐步回收到对应插件。
- 宿主若仍需依赖 AI / 任务相关类型，应通过对应插件的公共 `api` 获取，而不是继续把这些类型留在 `packages/core`。

#### `ContributionQuery`

职责：

- 作为 `ui` 等消费方的**只读查询契约**，使宿主只依赖 `core` 即可读取扩展点贡献，不必认识 `plugin-system`。

推荐放置位置：

- `packages/core`

当前主要方法原型：

```ts
// core
export interface ContributionQuery {
  getGlobalViews(): readonly GlobalViewContribution[];
  getRightPanelTabs(): readonly RightPanelTabContribution[];
  getDocumentCreationFlows(): readonly DocumentCreationFlowContribution[];
}
```

#### `PluginRegistry`

职责：

- 按扩展点聚合保存所有启用插件注册的贡献，每条贡献关联其 `pluginId`。
- implements `core` 的 `ContributionQuery`，向宿主提供统一查询。

推荐放置位置：

- `packages/plugin-system`

当前主要方法原型：

```ts
import type { ContributionQuery, GlobalViewContribution, RightPanelTabContribution, DocumentCreationFlowContribution } from '@jarvis/core';

export class PluginRegistry implements ContributionQuery {
  registerGlobalView(pluginId: string, view: GlobalViewContribution): void;
  registerRightPanelTab(pluginId: string, tab: RightPanelTabContribution): void;
  registerDocumentCreationFlow(pluginId: string, flow: DocumentCreationFlowContribution): void;

  getGlobalViews(): readonly GlobalViewContribution[];          // 聚合返回数组
  getRightPanelTabs(): readonly RightPanelTabContribution[];
  getDocumentCreationFlows(): readonly DocumentCreationFlowContribution[];

  removeByPlugin(pluginId: string): void;                       // 运行时禁用 / dispose 回收
}
```

说明：

- 三个现有扩展点均为「聚合型」：getter 并列返回多个 view / tab / flow，支持**多插件实现同一扩展点**。
- contribution `id` 需做唯一性校验，用于稳定 key 与 `order`。
- 仅当未来出现「单一生效」型扩展点（策略类）才需要冲突裁决策略，本期不需要。
- app 组合根将 `PluginRegistry` 实例作为 `ContributionQuery` 注入 `ui`。

#### `PluginManager`

职责：

- 管理插件清单。
- 根据全局配置激活插件。
- 调用插件 `setup` 并驱动注册过程。

推荐放置位置：

- `packages/plugin-system`

当前主要方法原型：

```ts
export class PluginManager {
  register(manifest: PluginManifest): void;
  activateEnabledPlugins(config: PluginEnablementConfig): Promise<void>;
  getEnabledPluginIds(): string[];
}
```

说明：

- `activateEnabledPlugins` 对每个插件的 `setup` 做 try/catch，记录完整错误栈后继续；单插件失败不拖垮宿主。
- 激活时为每个插件构造作用域 facade（注入 `pluginId`）传给 `setup`。

### 当前使用到的扩展点

本期只定义当前真实需要的扩展点。

扩展点形状以泛型接口形式放在 `packages/core`（保持 Vue 无关），需要 Vue 组件的扩展点其 Vue 特化类型放在 `packages/plugin-system`。注册 / 查询通过 `core` 的 `PluginSetupApi` / `ContributionQuery` 具名方法进行，不使用令牌。

#### `GlobalViewContribution`

用途：

- AI 插件注册对话视图。
- 任务插件注册任务全局视图。

放置位置：

- 接口形状：`packages/core`；Vue 特化：`packages/plugin-system`。

当前主要方法原型：

```ts
// core：泛型、Vue 无关
export interface GlobalViewContribution<TComponent = unknown> {
  id: string;
  routePath: string;
  title: string;
  component: () => Promise<TComponent>;   // 懒加载工厂
}
```

```ts
// plugin-system：Vue 特化，供插件构造时获得完整类型
import type { Component } from 'vue';
import type { GlobalViewContribution } from '@jarvis/core';

export type VueGlobalViewContribution = GlobalViewContribution<Component>;
```

说明：

- `component` 是「该视图激活时宿主要挂载的 Vue 组件」，用于把宿主当前「硬编码 `import` + `v-if` 切换」翻转为运行时 `<component :is>`，使宿主对具体视图零编译期依赖。
- 用类型参数（默认 `unknown`）而非直接引用 `vue` 的 `Component`，`core` 因此对 Vue 零依赖（含类型层）；`ui` 消费时按 `unknown` 取出、挂载时 `as Component`。
- 懒加载使被禁用插件的视图代码不进 bundle。

#### `RightPanelTabContribution`

用途：

- 任务插件注册右侧 panel tab。
- 后续其他插件如需右侧面板，也可复用该扩展点。

放置位置：

- 接口形状：`packages/core`；Vue 特化：`packages/plugin-system`。

当前主要方法原型：

```ts
// core：泛型、Vue 无关
export interface RightPanelTabContribution<TComponent = unknown> {
  id: string;
  title: string;
  order?: number;
  component: () => Promise<TComponent>;   // 懒加载工厂
}
```

```ts
// plugin-system：Vue 特化
import type { Component } from 'vue';
import type { RightPanelTabContribution } from '@jarvis/core';

export type VueRightPanelTabContribution = RightPanelTabContribution<Component>;
```

#### `DocumentCreationFlowContribution`

用途：

- 支持未来“按特定扩展流程创建新文档”的能力。
- 让插件围绕核心 Markdown 文档组织流程增强，而不是平行生长出另一套系统。

放置位置：

- `packages/core`（无 Vue 组件、纯逻辑契约，无需 Vue 特化）。

当前主要方法原型：

```ts
// core
export interface DocumentCreationFlowInput {
  targetParentPath?: string;
}

export interface DocumentCreationFlowResult {
  createdDocumentPath: string;
}

export interface DocumentCreationFlowContribution {
  id: string;
  title: string;
  run(input: DocumentCreationFlowInput): Promise<DocumentCreationFlowResult>;
}
```

说明：

- `run` 需要文档核心服务（创建 / 刷新树 / 打开 / 写入 `documentId` frontmatter）；这些以 `core` 接口表达、由宿主注入式提供（见「残留宿主能力」），不在插件内重造创建逻辑。
- 未来若确实需要树节点右键菜单，可新增 `TreeNodeActionContribution`。
- 该扩展点不在本期必选范围内，应在真实需求出现后再加入。

### 残留宿主能力（注入式只读上下文）

AI / 任务插件把内部能力（如 chat / compare store、对话编排、AI 视图）收回自身后，仍需从宿主获取少量能力：

- `IContextProvider` 实例；
- 文档核心服务（打开 / 创建 / 文档树 / 插入链接，供 `DocumentCreationFlow` 等使用）。

这些一律以 `core` 接口表达，由宿主在装配处通过 Vue `provide` 注入、插件视图 `inject` 取用。范围很窄，本期不引入 `PluginRuntimeContext`。

### 插件目录建议

#### `plugins/ai-agent`

建议结构：

```txt
/plugins/ai-agent
  package.json
  src/
    index.ts
    manifest.ts
    globalViews/
      chatView.ts
      compareView.ts
    right-panel/
      conversationTab.ts
```

职责：

- 作为 AI 大粒度插件的实现入口。
- 封装 AI 问答、AI 辅助编辑等当前统一归属到 AI 插件的前端能力。
- 当前对话视图可视为其全局视图。

契约与实现的切割线：

- 留在 `core`（被 `apps/server` 共享的契约 / 领域模型）：`IContextProvider`、`IModelProvider`、`Conversation`、`IConversationPersistProvider`，以及 `AgentRuntime` 等的契约。
- 迁入本插件（前端编排与实现）：`store/chat`、`store/compare`、`ConversationWorkflowController` 的具体路径、AI 视图。
- 待决：`AgentRuntime` 的实现能否完全私有化进本插件，取决于是否存在 chat 视图之外的 agent 调用方。

#### `plugins/task-mgr`

建议结构：

```txt
/plugins/task-mgr
  package.json
  src/
    index.ts
    manifest.ts
    globalViews/
      allTasksView.ts
    right-panel/
      taskTab.ts
```

职责：

- 作为任务插件实现入口。
- 封装当前任务全局视图和右侧任务 panel。
- 与文档 / Agent 保持关联，但不要求本期在文档页面正文内直接展示任务 UI。

## 影响到的核心类 / 全局类图

本需求不会直接修改 `docs/workspace.dsl`，但会对现有前端宿主装配关系产生影响：

- 当前写死在宿主中的全局视图入口，未来应由插件系统注册后装配。
- 当前写死在右侧 panel 中的任务 / 对话 tab，未来应逐步改为由插件贡献注册。
- `packages/core` 中现有非插件抽象仍保留原职责，只额外承载最小插件接口定义。
- `IContextProvider` 暂不拆分，仍作为宿主已有能力使用，不纳入本期插件系统重构范围。

可能受影响的现有模块方向：

- 路由与视图宿主
- 右侧 panel 宿主
- AI 视图入口装配
- 任务视图入口装配

## 验收标准

用于后续验证插件系统需求的实现是否完整、正确：

| 动作 | 预期响应 |
|-----|--------|
| 宿主读取插件启用配置 | 仅启用配置中声明的插件被激活 |
| AI 插件启用 | 现有 AI 对话视图以插件注册方式出现在宿主中 |
| 任务插件启用 | 现有任务全局视图和右侧任务 panel 以插件注册方式出现在宿主中 |
| 任务插件禁用 | 任务相关全局视图和 panel 入口不再由宿主装配 |
| AI 插件禁用 | AI 相关全局视图不再由宿主装配，核心 Markdown 文档编辑能力仍可独立运行 |
| 新增一个文档创建流程扩展点实现 | 插件可通过受控扩展点注册新的“创建文档流程”入口 |
| 插件框架新增新扩展点需求 | 仅在真实需求出现时新增相应接口和注册方法，不要求先存在万能扩展点模型 |
