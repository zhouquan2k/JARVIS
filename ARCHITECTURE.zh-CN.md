[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# 架构总览

`docs/workspace.dsl` 是本仓库公开架构的主设计源。本文基于其中的 system context 和 container 视图解释系统结构，并要求与 DSL 同步维护。

## 系统上下文

ChatPrism 处于终端用户、外部 AI 提供方和用户知识资料库之间。

### 主要参与者

- 重度 AI 对话用户，需要对比模型输出、恢复历史会话并整理知识资产。

### 外部系统

- ChatGPT Web：提供基于网页登录态的模型访问与历史读取。
- Google Gemini API：提供模型执行与模型目录查询。
- Gemini Web：提供基于浏览器页面的历史提取能力。
- 本地或托管的知识资料库：存放文档、导入文件和作用域化工作区上下文。

## 容器视图

### Browser Extension App

- 在浏览器中承载聊天、对比、历史导入和知识工作区流程。
- 使用 Cookie、content script、扩展存储等浏览器能力。

### Web App

- 提供浏览器中的主工作台，用于聊天、对比和文档中心工作流。
- 通过同步服务获取共享上下文和 provider 配置。

### Desktop App

- 在共享 UI 之上增加桌面文件能力和受控页面能力。
- 复用共享包，并补充 Electron 宿主桥接逻辑。

### Sync Server

- 暴露会话同步 API、上下文 API 和 provider 配置接口。
- 将共享契约连接到基于文件系统或数据库的持久化实现。

### Shared Packages

- `packages/core`：领域模型、运行时抽象、provider 契约和工作流编排。
- `packages/ui`：供 Web、Extension、Desktop renderer 复用的 UI 组件、视图和状态管理。
- `packages/node`：供 Desktop main 和同步服务复用的 Node-only 适配层与基础设施实现。

## 职责边界

- 各宿主应用负责按运行时装配能力，但不重新定义共享契约。
- 共享包负责沉淀会话、provider 和上下文抽象。
- 同步服务是远程上下文和数据同步的后端边界。
- 知识资料库即使部署在本地，也仍然被视为外部依赖。

## 外部依赖链路

- Web、Extension、Desktop 通过共享运行时契约调用外部模型提供方。
- Extension 和 Desktop 还会桥接浏览器控制页面以访问 ChatGPT 和 Gemini 历史。
- Sync Server 与 Desktop 宿主都可以通过文件系统适配层访问知识资料库。

## 相关文档

- 仓库概览：[README.zh-CN.md](README.zh-CN.md)
- C4 DSL 主设计源：[docs/zh/workspace.zh-CN.dsl](docs/zh/workspace.zh-CN.dsl)
- 文档范围说明：[docs/zh/overall.zh-CN.md](docs/zh/overall.zh-CN.md)
- Context Provider 说明：[docs/zh/context-provider.zh-CN.md](docs/zh/context-provider.zh-CN.md)
