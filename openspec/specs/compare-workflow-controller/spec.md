## ADDED Requirements

### Requirement: Execute dual-model generation concurrently
并发调度控制器 MUST 支持在一次请求中并发执行 Model A 与 Model B 的流式对话调用，而不是串行执行。

#### Scenario: Controller starts two model streams in one workflow
- **WHEN** 用户提交对比问题并触发对比工作流
- **THEN** 控制器 MUST 同时发起 Model A 与 Model B 的请求
- **AND** 两路输出 MUST 通过独立回调通道返回给上层。

### Requirement: Trigger analyzer only after both model outputs complete
控制器 MUST 在双模型流式输出均结束后再启动分析引擎，并将完整 `outputA` 与 `outputB` 作为分析输入。

#### Scenario: Analyzer waits for both model responses
- **WHEN** 仅有一路模型完成且另一路仍在生成
- **THEN** 控制器 MUST NOT 启动分析引擎
- **AND** 仅当两路都完成后才 MUST 调用分析流程。

### Requirement: Expose compare workflow lifecycle to UI
控制器 MUST 向 UI 暴露可观测的对比工作流生命周期，包括并发生成中、分析中、完成与失败等关键阶段。

#### Scenario: UI can render stage-specific state
- **WHEN** 对比工作流从生成阶段进入分析阶段
- **THEN** 控制器 MUST 发出阶段变化信号
- **AND** UI MUST 能基于该信号切换 loading、分析面板或错误状态展示。
