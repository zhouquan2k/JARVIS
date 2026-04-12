[English](README.md) | [中文](README.zh-CN.md)

# ChatPrism

ChatPrism 是一个面向重度 AI 对话用户的多宿主工作台，适合需要跨模型比对答案、回看长对话，并将聊天历史沉淀为知识资产的场景。

## 仓库包含的内容

- Web、浏览器扩展、桌面端三种宿主，共享同一套会话工作流。
- 一个同步服务，用于会话存储、知识工作区上下文 API 和 provider 配置。
- `packages/core`、`packages/ui`、`packages/node` 三个共享包，用于保持宿主层代码精简。
- 一个文档工作区，用于读取、编辑、索引和复用知识文件。

## 核心使用场景

- 同时向多个模型提问，并排比较答案。
- 导入或恢复外部 AI 产品中的历史会话。
- 搜索和整理长对话，将其沉淀为可复用知识。
- 将作用域化的知识工作区上下文附加到 Agent 风格工作流中。

## 公开入口

- 架构总览：[ARCHITECTURE.zh-CN.md](ARCHITECTURE.zh-CN.md)
- 贡献指南：[CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)
- 安全策略：[SECURITY.md](SECURITY.md)
- 仓库术语表：[GLOSSARY.md](GLOSSARY.md)
- C4 主设计源：[docs/zh/workspace.zh-CN.dsl](docs/zh/workspace.zh-CN.dsl)
- 文档范围说明：[docs/zh/overall.zh-CN.md](docs/zh/overall.zh-CN.md)

## 快速开始

```bash
pnpm install
pnpm lint
pnpm --filter server dev
pnpm --filter web dev
```

如果需要浏览器级回归验证，请查看 `apps/web/tests/e2e` 和 `apps/extension/tests/e2e` 下的 Playwright 用例。

## 文档组织规则

- 英文文档是默认公开入口。
- 中文内容通过显式镜像文档访问。
- `docs/history/` 下的历史阶段文档继续保留，但不属于 Phase 1 公共文档迁移范围。

## 许可证

本仓库采用 [MIT License](LICENSE) 发布。
