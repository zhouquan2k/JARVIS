> **语言**: [English](spec.md) | 中文

## ADDED Requirements

### Requirement: Group provider MUST orchestrate a fixed team preset as a single IModelProvider
系统 SHALL 提供一个 `id = 'group'` 的模型 provider，实现标准 `IModelProvider` 契约。其 `sendMessage` SHALL NOT 调用单个模型，而是把请求分发给当前所选团队预设的成员。group provider SHALL 经 `resolveMemberProvider(providerId)` 统一解析每个成员，且 SHALL NOT 包含任何 provider 特判，因此任意 `IModelProvider`（含未来 provider 与 DOM 自动化 provider）均可作为成员。

#### Scenario: Broadcast to all members by default
- **WHEN** 用户在绑定了 group 团队预设的会话中发送消息
- **AND** 消息不含 `@成员` 点名
- **THEN** group provider MUST 把提问并发分发给预设的每个成员
- **AND** 每个成员 MUST 通过各自的 `IModelProvider.sendMessage` 接收提问

#### Scenario: Resolve members without per-provider branching
- **WHEN** group provider 向某个 `providerId` 的成员分发
- **THEN** 它 MUST 经 `resolveMemberProvider(providerId)` 获取成员实例
- **AND** 分发时 MUST NOT 依据具体 provider 类型分支

### Requirement: Group provider MUST support @mention targeting
group provider SHALL 解析提问中的 `@成员名`。当点名一个或多个成员时，仅被点名成员 SHALL 回答；无点名时全部成员 SHALL 回答（广播）。被点名成员仍 SHALL 并发回答。

#### Scenario: Restrict a turn to mentioned members
- **WHEN** 用户发送的提问以 `@名字` 点名一个或多个成员
- **THEN** 仅被点名成员 MUST 被分发
- **AND** 未被点名成员 MUST NOT 在该轮收到提问

#### Scenario: Multiple mentions answer concurrently
- **WHEN** 提问点名两个或以上成员
- **THEN** 所有被点名成员 MUST 被并发分发

### Requirement: Group provider MUST merge member output into one streamed assistant transcript
group provider SHALL 把每个成员的流式输出累积到按成员的缓冲，并 SHALL 在每个成员 chunk 上经 `onUpdate` 推送合并后的 transcript，按稳定顺序分段（如 `### {name}\n{text}`）。最终 `ProviderSendResult` SHALL 为单条 assistant 消息，其文本为合并 transcript。

#### Scenario: Stream merged segments as members reply
- **WHEN** 成员在某轮产生流式 chunk
- **THEN** 每次 `onUpdate` MUST 包含合并 transcript，每个应答成员对应一个带标签分段
- **AND** 同轮内分段顺序 MUST 跨更新保持稳定

#### Scenario: Return a single merged assistant message
- **WHEN** 所有应答成员均完成
- **THEN** group provider MUST 解析为单条 `ProviderSendResult`，其文本为最终合并 transcript

### Requirement: Group members MUST be isolated within a turn and share context across turns
同一轮内成员 SHALL NOT 看到对方本轮回复。跨轮时，每个成员 SHALL 经 `options.history` 收到上一轮全部 transcript，从而下一轮可见此前成员回复。

#### Scenario: No same-turn cross-visibility
- **WHEN** 两个成员并发应答同一轮
- **THEN** 任一成员的提问输入 MUST NOT 包含对方本轮回复

#### Scenario: Previous turn visible on the next turn
- **WHEN** group 回复后开始新一轮
- **THEN** 每个成员 MUST 经 `options.history` 收到上一轮合并 transcript

### Requirement: Group provider MUST fan out abort to all running members
调用 `abort()` 时，group provider SHALL 把 abort 透传到本轮启动的每个成员 provider 实例。

#### Scenario: Abort propagates to all members
- **WHEN** group 某轮进行中且多个成员正在流式输出
- **AND** 对 group provider 调用 `abort()`
- **THEN** MUST 对本轮启动的每个成员 provider 实例调用 `abort()`
