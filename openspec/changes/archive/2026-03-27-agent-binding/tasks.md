## 1. 共享 Agent 类型与解析器

- [x] 1.1 在 `packages/core` 中新增 `AgentConfig`、`ResolvedAgentConfig`、继承策略与工具/技能绑定类型，并更新 `packages/core/src/index.ts` 导出
- [x] 1.2 实现作用域 Agent 解析器，支持从当前激活路径向上查找 `.agent.json`、区分文件与目录起点、处理 `merge` / `override` 继承以及默认 Agent 回退
- [x] 1.3 为共享解析器补充单元测试，覆盖最近父级命中、父子合并、覆盖截断、未命中 fallback 与非法 JSON 报错

## 2. 知识工作区作用域接线

- [x] 2.1 扩展 `useKnowledgeWorkspaceStore`，增加生效 Agent、解析错误与解析中状态，并在 `openNode` / 初始化流程中解析当前节点的作用域 Agent
- [x] 2.2 升级 `KnowledgeWorkspaceView` 与 `KnowledgeAssistantPane`，将当前生效 Agent 传入右栏并展示名称、作用域路径与解析错误
- [x] 2.3 为知识工作区补充单元测试，验证切换不同文件时会刷新生效 Agent，且 Agent 解析失败不会阻断文件树浏览与文档编辑

## 3. 聊天运行时适配

- [x] 3.1 在共享层实现 Agent prompt envelope 构造逻辑，将名称、职责、最终指令、工具/技能边界和作用域路径封装为稳定的发送前上下文
- [x] 3.2 扩展 `useChatStore`，增加当前 Agent 上下文的设置与清理能力，并在发送消息时按需注入 prompt envelope
- [x] 3.3 确保知识工作区右栏在挂载、切换节点和卸载时正确同步/清空聊天 Agent 上下文，避免影响普通聊天工作区

## 4. 测试与验收

- [x] 4.1 为 `KnowledgeAssistantPane` 与 `useChatStore` 补充单元测试，验证 Agent 上下文注入、默认 Agent 回退与离开知识工作区后的上下文清理
- [x] 4.2 为知识工作区新增 Playwright e2e，用例覆盖 `.agent.json` 作用域切换、右栏 Agent 标识更新和错误配置提示
- [x] 4.3 运行相关测试与校验命令，确认共享解析器、知识工作区与右栏聊天接线可用；如包含 extension e2e，则按 MV3 要求申请提权并在通过后执行 `pnpm --filter extension build`

## 5. Provider-owned Agent 解析与目录节点切换

- [x] 5.1 扩展 `IContextProvider` 及三端 provider / mock / bridge，新增按节点返回 `ResolvedAgentConfig` 的接口，并将 `.agent.json` 解析、默认兜底与作用域路径确定职责完全下沉到 provider
- [x] 5.2 扩展 `AgentConfig` / `ResolvedAgentConfig`，补充 `modelProviderName`、`modelName`，并更新相关共享类型、默认 Agent 与测试数据
- [x] 5.3 调整知识工作区交互模型，区分“当前选中节点”和“当前打开文档”；目录节点被选中时也必须立即刷新右栏生效 Agent
- [x] 5.4 调整 `KnowledgeAssistantPane` 顶部信息区，在 `NormalChatView` 上方展示 Agent 名称、模型信息、最近命中的 `.agent.json` 所在目录（无命中时默认展示根作用域 `/`）与解析错误
- [x] 5.5 调整聊天运行时，使发送链优先遵循 Agent 指定的 provider/model；同时更新单测与 extension e2e，覆盖目录选择切换和模型信息展示
