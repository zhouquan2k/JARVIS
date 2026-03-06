## Why

当前“多模型并发对比 + 深度剖析”能力已在 Web 宿主落地，但插件侧边栏仍停留在单线聊天，导致扩展端用户无法在主使用场景中直接完成 A/B 对比与结构化分析。第五阶段需要补齐 extension 宿主能力，使同一套对比工作流在 Web 与插件两端保持一致体验与行为语义。

## What Changes

- 在 `apps/extension` 引入与 Web 对齐的宿主壳层，提供普通聊天与对比聊天的入口切换，而不是只渲染单一 `ChatApp`。
- 复用 `packages/ui` 已有的 `NormalChatView`、`CompareChatView` 与顶部模式切换组件，在 extension 侧保持同等交互（双栏原生输出、分析 Tab、首字切页、流式状态）。
- 扩展插件侧的 Background 代理协议，支持对比工作流中的双路并发流、分析流回传与中止控制，避免 A/B 流互相污染。
- 完善 extension 宿主的运行时注入与可用 Provider 裁剪，保证对比模式下 A/B 选择器只展示 extension 可用模型，并保持两路选择相互独立。
- 补齐 extension 宿主下对比主流程的验证覆盖（视图切换、并发生成、分析切页、异常降级），确保跨宿主一致性。

## Capabilities

### New Capabilities
- `extension-host-app`: 定义插件宿主的页面壳层能力，支持普通/对比双视图切换、状态恢复与共享输入工作流。

### Modified Capabilities
- `extension-proxy`: 扩展代理转发协议以支持对比模式下的双路并发流式转发、分析流透传和可追踪中止控制。
- `compare-chat-view`: 明确对比视图在 extension 宿主中的行为一致性要求（首字切页、双栏原生输出、分析面板降级）。
- `provider-model-selector`: 在 extension 对比模式下启用并约束 A/B 双选择器的独立联动与可用模型过滤规则。
- `runtime-mode-provider-injection`: 强化 extension 运行时下 Provider 可用性过滤与注入边界，避免宿主直接耦合具体 Provider 实现。

## Impact

- 受影响代码范围：`apps/extension`（sidepanel 宿主入口与路由/状态）、`packages/ui`（宿主无关视图复用与状态绑定）、`packages/core`（代理协议与运行时注入边界）。
- 受影响接口：插件前后台通信消息体将新增用于对比工作流的请求标识与通道语义（A/B/analysis），并统一中止行为。
- 受影响依赖：不引入新的外部模型 SDK，继续复用现有 Provider/Runtime 抽象与代理通道。
- 受影响系统行为：extension 侧会新增并发流与分析流渲染路径，需要额外关注 sidepanel 生命周期、资源回收和异常回退策略。
