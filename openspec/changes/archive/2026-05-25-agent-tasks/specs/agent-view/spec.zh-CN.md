## ADDED Requirements

### Requirement: Agent view MUST 提供一个带 Tab 的右侧工作区容器
Agent 视图 MUST 提供一个带 Tab 的右侧工作区容器，用于承载与当前工作区选择相关的对话流程和任务流程。

#### Scenario: 在文档选择下渲染右侧容器
- **WHEN** 共享文档工作区当前存在一个带 Agent 上下文的激活文档选择
- **THEN** Agent 视图 MUST 为该选择渲染右侧工作区容器
- **AND** 该容器 MUST 同时提供对话 Tab 和任务 Tab

#### Scenario: 在 Agent owner 选择下渲染右侧容器
- **WHEN** 共享文档工作区当前是一个没有激活文档的 Agent owner / Project 选择
- **THEN** Agent 视图 MUST 为该选择渲染同一个右侧工作区容器
- **AND** 其中可用的任务行为 MUST 继续严格绑定到该选择
