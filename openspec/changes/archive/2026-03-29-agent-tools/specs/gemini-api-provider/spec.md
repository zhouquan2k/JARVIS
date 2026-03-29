## MODIFIED Requirements

### Requirement: Gemini native agent execution MUST support application-managed tool loop in phase one
系统 MUST 允许第一阶段 Gemini 原生 Agent 请求通过 Gemini function calling / tools 机制工作，并由应用侧运行时维护多步 tool loop，而不是把完整的工具循环封装为新的传输协议。

#### Scenario: Send tool declarations with a native agent request
- **WHEN** Gemini Provider 发起一次原生 Agent 请求且当前 Agent 具有可用工具边界
- **THEN** Provider MUST 在 Gemini 请求中携带对应的 tools / function calling 配置
- **AND** Provider MUST 允许上层应用在收到工具调用后继续维护后续循环

#### Scenario: Consume runtime-resolved tool declarations
- **WHEN** `AgentRuntime` 已为本次请求解析出结构化工具声明
- **THEN** Gemini Provider MUST 使用这些运行时工具声明生成 function declarations
- **AND** Provider MUST NOT 要求自己直接从原始 `agent.tools` 推导本地工具实现细节

#### Scenario: Consume runtime-augmented agent and workspace context
- **WHEN** `AgentRuntime` 已为本次请求准备好增强后的 Agent/Workspace 上下文
- **THEN** Gemini Provider MUST 直接消费这份运行时输入发起原生 Agent 请求
- **AND** Provider MUST NOT 自行决定是否读取或注入当前活动文件内容
