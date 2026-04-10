## 1. 本地上下文 provider 挂载能力

- [x] 1.1 扩展 `packages/node/src/context/FileSystemContextProvider.ts` 的 `.agent.json` 解析逻辑，支持 `linkDir` 字段、空目录挂载入口校验和挂载目标路径解析。
- [x] 1.2 在 `FileSystemContextProvider` 内新增挂载表构建与虚拟路径解析流程，让 `getContext()`、`readDocument()`、`writeDocument()`、`createNode()`、`deleteNode()`、`renameNode()` 与 `searchInScope()` 都通过同一套映射工作。
- [x] 1.3 保持挂载目录下的 `agentKey`、`isAgentOwner` 和 `sourcePaths` 继续使用虚拟路径语义，验证子目录 `.agent.json` 的继承结果不被真实路径污染。

## 2. 服务端与节点行为回归

- [x] 2.1 补充 `apps/server/tests/local-file-context-provider.test.ts`，覆盖挂载目录出现在顶层上下文、路径读写映射、搜索结果虚拟路径和挂载根别名操作等行为。
- [x] 2.2 回归 `FileSystemContextProvider` 的普通工作区场景，确保没有声明 `linkDir` 的旧目录树仍按原逻辑工作。
- [x] 2.3 如测试暴露路径归一化差异，收敛 `ContextNode` 构建与文档读写返回值，避免 Web、Desktop、Extension 三端出现路径不一致。

## 3. Playwright 真实链路用例

- [x] 3.1 新增 Playwright e2e 用例，启动带有根目录挂载配置的知识工作区，验证挂载目录在左侧文件树中作为顶层节点出现。
- [x] 3.2 新增 Playwright e2e 用例，在挂载目录中执行文件读取和写入，验证 UI 操作最终落到真实目标目录，并能通过重新打开页面看到更新结果。
- [x] 3.3 新增 Playwright e2e 用例，对挂载根别名执行重命名或删除，验证别名入口变化后真实目标目录仍然保留。

## 4. 验证与收尾

- [x] 4.1 运行 `pnpm` 相关单测或整包测试，确认 `packages/node` 与 `apps/server` 的 provider 变更没有破坏现有行为。
- [x] 4.2 运行知识工作区相关 Playwright 用例，确认挂载目录、虚拟路径和 Agent 元数据在真实 UI 链路中一致。
- [x] 4.3 根据测试结果补齐或调整文档中的边界条件说明，确保 `linkDir` 的空目录约束、相对路径解析和非法挂载报错都被明确覆盖。
