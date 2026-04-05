## 1. Core 接口与导出收敛

- [x] 1.1 在 `packages/core/src/interfaces` 中引入 `IConversationPersistProvider`、`IExternalConversationProvider` 与 `ModelProviderRuntime` 对应类型，并保留必要兼容别名或桥接导出。
- [x] 1.2 更新 `packages/core/src/index.ts`、`packages/core/src/runtime/*`、`packages/core/src/agents/runtime/*`、`packages/core/src/workflows/compare/*` 的类型引用和工厂导出，确保内部主路径全部使用新命名。
- [x] 1.3 评估并落实 `createProviderRuntime` / `providerRuntime.types` 的命名迁移策略：若保留旧文件，则补转发层；若重命名文件，则同步修正全部 import。

## 2. 宿主与 UI 调用点迁移

- [x] 2.1 更新 `packages/ui/src/store/chat.ts`、`packages/ui/src/store/compare.ts` 及相关测试，把存储、外部会话来源和 runtime 类型切换到新命名，同时保持现有业务流程不变。
- [x] 2.2 更新 `apps/web/src/providerRuntime.ts`、`apps/desktop/src/providerRuntime.ts`、`apps/extension/src/providerRuntime.ts` 及宿主 proxy/background 入口，统一使用新 runtime 和 history provider 类型名。
- [x] 2.3 更新 `apps/web/src/sync.ts`、`apps/desktop/src/sync.ts`、`apps/extension/src/sync.ts` 与 compare conversation 持久化接入点，确保会话持久化接口迁移到 `IConversationPersistProvider`。

## 3. 测试与验证

- [x] 3.1 更新 `packages/core`、`packages/ui`、`apps/*` 中受影响单元测试和集成测试的 mock/stub 类型，覆盖 runtime 过滤、fresh provider、历史导入和存储 CRUD 行为不变。
- [x] 3.2 增加或更新 Playwright e2e 用例，验证至少一个真实宿主链路中的 provider 初始化、外部历史读取或本地会话恢复在命名迁移后仍然成功。
- [x] 3.3 按顺序执行验证：`pnpm lint`、类型检查、目标包构建、必要的 dev 探活、最小回归测试、目标范围完整回归；如果涉及 extension e2e，则申请提权并在通过后执行 `pnpm --filter extension build`。
