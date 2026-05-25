## ADDED Requirements

### Requirement: Knowledge context provider MUST 通过共享 context 契约暴露 task-provider 解析能力
knowledge context provider MUST 通过 `IContextProvider.getTaskProvider()` 暴露任务访问能力，使工作区 UI 可以通过同一个 context provider 获取当前作用域下的任务操作，而不需要额外的解析入口。

#### Scenario: 通过本地或远端 context provider 解析任务操作
- **WHEN** 工作区运行在 filesystem-backed、database-backed、desktop bridge 或 HTTP-backed 的 context provider 上
- **THEN** 该 provider MUST 暴露 `getTaskProvider()`
- **AND** 调用方 MUST 能直接使用返回的 task provider，而不需要第二套作用域发现机制

#### Scenario: 在增加任务访问能力时保持现有文档与会话行为不变
- **WHEN** task-provider 解析能力被加入 knowledge context provider 契约
- **THEN** 现有的文档读取、文档写入与会话查询行为 MUST 继续通过同一个 context provider 可用
- **AND** 新增任务访问能力 MUST NOT 改变这些已有行为的语义
