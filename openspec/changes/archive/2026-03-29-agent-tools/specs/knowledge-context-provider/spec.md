## ADDED Requirements

### Requirement: Knowledge context provider MUST support scope search for agent tools
知识文件 Provider MUST 提供作用域搜索能力，以支持 `search_in_scope` 在当前知识工作区中定位相关文件内容。

#### Scenario: Search content within the current knowledge scope
- **WHEN** 工作区或 Agent 工具请求执行一次作用域搜索
- **THEN** Provider MUST 返回符合查询条件的命中集合
- **AND** 每个结果 MUST 至少包含文件路径、行列位置与预览文本

#### Scenario: Report unsupported search capability explicitly
- **WHEN** 某个具体宿主暂未实现 `searchInScope`
- **THEN** 系统 MUST 明确报告该能力暂不支持
- **AND** MUST NOT 静默回退到隐式递归扫描实现
