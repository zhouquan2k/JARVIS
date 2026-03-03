## Context

当前代码基线已经具备扩展宿主能力：UI 通过 `IModelProvider` 与 `IStorageProvider` 交互，扩展端通过 `BackgroundProxyProvider` 间接调用真实 Provider。`prototype-webapp` 需要新增纯 Web 宿主，但必须保持“宿主与具体 Provider 解耦”的架构原则，避免在 `apps/web` 页面层直接依赖 `GeminiApiProvider` 等实现类。

主要约束：
- 纯 Web 环境无法使用 `chatgpt-web`（依赖官网 Cookie）。
- UI 层已沉淀为可复用组件，应继续只依赖接口，不感知宿主差异。
- Web 与 Extension 需要共享同一套 Provider/Model 配置来源，但按宿主能力过滤。

## 参与方与协同边界

1. `Provider` 实现（`IModelProvider`）
- 位置：`packages/core/src/providers/**`
- 职责：实现 `checkAuth/sendMessage/abort`，不负责判断运行模式，不直接参与 UI 渲染。

2. 静态配置（Provider 能力声明）
- 位置：`packages/core/config.ts`
- 职责：声明 provider 的模型与可用运行模式（`supportedRuntimeModes`），作为运行时筛选依据。

3. `ProviderRuntime`（运行时装配层）
- 位置：`packages/core/src/runtime/**`
- 职责：接收宿主初始化参数，过滤当前运行模式可用 provider，按需实例化并返回 `IModelProvider`。

4. 宿主应用（`apps/web` / `apps/extension`）
- 位置：`apps/*`
- 职责：读取环境变量和宿主上下文，调用 `createProviderRuntime`，把可用 provider 列表与实例注入 UI。

5. UI + Store（`packages/ui`）
- 位置：`packages/ui/src/**`
- 职责：展示可选 provider/model，保存用户选择，调用统一 `IModelProvider` 接口；不感知具体实现类。

初始化协同流程（启动阶段）：
1. 宿主读取上下文与凭据，调用 `createProviderRuntime({ runtimeMode, credentials })`。
2. Runtime 根据 `supportedRuntimeModes` 过滤 provider，返回可用 provider 列表。
3. 宿主把可用列表注入 UI store，UI 渲染选择器并设置默认 provider/model。
4. 用户首次发起请求时，store 通过 `runtime.getProvider(providerId)` 获取实例并调用 `sendMessage`。

## Goals / Non-Goals

**Goals:**
- 新增 `apps/web` 宿主工程并复用现有 `packages/ui` 聊天界面。
- 由宿主基于能力声明过滤 Provider，并向 UI 提供可选列表。
- 通过宿主运行时装配层注入 `IModelProvider`，页面层不直接 `new` 具体 Provider。
- 在 Web 端复用 `IndexedDBStorageProvider`，保持会话持久化能力一致。

**Non-Goals:**
- 不改造现有扩展端代理主流程（`BackgroundProxyProvider` + background 路由）作为本次交付重点。
- 不在本阶段引入新的大模型服务商。
- 不新增后端服务或服务端转发层。

## Decisions

### 决策 1：在核心层引入“宿主运行时装配”而非页面直接依赖 Provider 实现

变更说明：
- 在 `packages/core` 新增运行时装配模块，对外提供按宿主筛选与 Provider 实例获取能力。
- `apps/web` 仅依赖装配层接口，不直接 import 具体 Provider 类。

涉及文件（新增/修改）：
- `packages/core/src/runtime/createProviderRuntime.ts`（新增）
- `packages/core/src/runtime/types.ts`（新增）
- `packages/core/src/index.ts`（修改，导出运行时装配 API）
- `apps/web/src/providerRuntime.ts`（新增，宿主侧初始化）
- `apps/web/src/App.vue` 或 `apps/web/src/main.ts`（修改，注入 runtime/provider）

函数/方法签名（新增）：
```ts
export type RuntimeMode = 'extension' | 'web';

export interface ProviderRuntime {
  getAvailableProviders(): ProviderConfig[];
  getProvider(providerId: string): IModelProvider;
}

export function createProviderRuntime(options: {
  runtimeMode: RuntimeMode;
  credentials?: Record<string, string>;
}): ProviderRuntime;
```

备选方案：
- 方案 A：在 `apps/web` 直接 `new GeminiApiProvider()`。
  - 放弃原因：宿主和具体实现耦合，后续新增 Provider 需要改页面逻辑，违背当前目标。
- 方案 B：继续沿用扩展端 Background Proxy 到 Web。
  - 放弃原因：纯 Web 不具备扩展 Background 能力，且会引入不必要的跨层复杂度。

### 决策 2：Provider 能力由静态配置声明，宿主按能力过滤后供用户选择

变更说明：
- 在静态配置中为 Provider 增加运行模式声明（如 `supportedRuntimeModes`），并保留模型列表与默认模型。
- UI 选择器只展示 runtime 返回的可用 Provider，避免展示不可运行项。

涉及文件（新增/修改）：
- `packages/core/config.ts`（修改，Provider 元数据增加运行模式字段）
- `packages/ui/src/components/ProviderModelSelector.vue`（修改，改为接收可用 providers 数据源）
- `packages/ui/src/ChatApp.vue`（修改，初始化时加载 runtime 提供的 provider 列表）
- `packages/ui/src/store/chat.ts`（修改，保存当前 provider/model 选择并暴露初始化入口）

函数/方法签名（建议调整）：
```ts
// packages/ui/src/store/chat.ts
setAvailableProviders(providers: ProviderConfig[]): void;

// packages/ui/src/components/ProviderModelSelector.vue
// props 新增
providers: ProviderConfig[];
```

备选方案：
- 方案 A：继续从 `APP_CONFIG.providers` 直接全量渲染后前端写死过滤 `chatgpt-web`。
  - 放弃原因：过滤逻辑分散，扩展到更多宿主/Provider 时不可维护。

### 决策 3：密钥由宿主读取并注入运行时，Provider 内部不依赖单一宿主命名

变更说明：
- `apps/web` 读取 `VITE_LLM_API_KEY`（或后续按 provider 拆分的键），通过 `createProviderRuntime` 传入。
- 运行时将宿主密钥映射到对应 Provider 所需参数；Provider 接收构造参数优先，环境变量为兼容回退路径。

涉及文件（新增/修改）：
- `apps/web/.env`（新增，宿主密钥）
- `apps/web/src/providerRuntime.ts`（新增，密钥映射与 runtime 创建）
- `packages/core/src/providers/GeminiApiProvider.ts`（修改，支持构造参数注入 key）

函数/方法签名（建议调整）：
```ts
// packages/core/src/providers/GeminiApiProvider.ts
constructor(options?: { apiKey?: string });
```

备选方案：
- 方案 A：继续只读 `import.meta.env.WXT_GEMINI_API_KEY`。
  - 放弃原因：仅适配扩展构建约定，难以满足 Web 宿主注入诉求。

## Risks / Trade-offs

- [Risk] 运行时装配层引入新抽象，初期实现成本增加。 → Mitigation：接口最小化（仅筛选和实例化），先覆盖 Web/Extension 两宿主。
- [Risk] UI 从全局静态配置切换到宿主注入数据源，可能影响现有默认值逻辑。 → Mitigation：在 store 层统一默认 provider/model 选择规则并补充回归测试。
- [Risk] Provider 构造参数与环境变量双通路可能产生优先级混淆。 → Mitigation：固定优先级“显式注入 > 环境变量回退”，并在文档中明确。

## Migration Plan

1. 新增 `apps/web` 基础工程，接入 `@packages/core` 与 `@packages/ui`。
2. 在 `packages/core` 引入 runtime 装配层并补充导出。
3. 扩展 `packages/core/config.ts` Provider 元数据，标注 `supportedRuntimeModes`。
4. 改造 UI 层 Provider 列表来源为 runtime 注入。
5. 接入 `IndexedDBStorageProvider` 并完成 Web 端聊天主流程联调。
6. 验证扩展端行为不回归（Provider 选择、发送、历史记录）。

回滚策略：
- 保留旧的 `APP_CONFIG.providers` 直读路径开关；若新 runtime 引入问题，可临时切回旧数据源并仅保留 `apps/web` 脚手架。

## Open Questions

- `supportedRuntimeModes` 字段是否需要细分为“可见（selectable）”与“可运行（runnable）”两层语义？
- `credentials` 是否需要标准化成按 providerId 分组结构（如 `{ gemini: { apiKey } }`）以避免键名冲突？
- `apps/web` 是否需要在首版即支持多 Provider 密钥输入（而非单一 `VITE_LLM_API_KEY`）？
