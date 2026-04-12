[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh-CN.md)

# 贡献指南

## 基本原则

- 运行时代码变更要保持范围收敛，并具备可观测性。
- 对外架构讨论统一以 `docs/workspace.dsl` 为主设计源。
- 保持 Phase 1 引入的“英文主文档 + 中文镜像”公开文档结构。

## 开发环境

```bash
pnpm install
pnpm lint
pnpm --filter server dev
pnpm --filter web dev
```

针对局部工作，可使用包级脚本，例如 `pnpm --filter web test` 或 `pnpm --filter desktop build`。

## 文档规则

- 英文文档保留在主路径。
- Phase 1 纳入的公开入口文档都要有中文镜像。
- `docs/` 下的中文镜像统一放在 `docs/zh/`。
- 每份纳入镜像体系的公开文档顶部都要有 `English | 中文` 双向导航。
- 引入新的公开术语时，同步更新 [GLOSSARY.md](GLOSSARY.md)。
- 除非变更显式扩大范围，否则不要迁移或重写 `docs/history/` 下的历史文档。
- 静态用户可见文案应进入 UI i18n，不要在宿主运行时代码里继续硬编码新字符串。
- 用户可见异常和恢复提示应使用英文默认消息，并复用已有错误码，不要新增异常翻译字典。
- 正式 OpenSpec 文档必须英文主文件与中文镜像成对提交，`openspec/changes/archive/**` 不纳入双语要求。
- 打开 issue 或 PR 时，请使用英文优先的 `.github` 模板，并检查 UI i18n、错误消息和 OpenSpec 双语项。

## 架构更新要求

- 当系统上下文或容器边界变化时，先更新 [docs/workspace.dsl](docs/workspace.dsl)。
- [ARCHITECTURE.md](ARCHITECTURE.md) 必须与 DSL 中的 context/container 视图保持一致。
- 英文 DSL 变更时，同一提交中同步更新中文镜像 `docs/zh/workspace.zh-CN.dsl`。

## 验证要求

在合并重要改动前，至少运行与影响范围相匹配的最小验证集合：

- `pnpm lint`
- 包级 build 或 typecheck
- 涉及 UI 或浏览器链路时，运行包级或定向的 Playwright/Vitest

浏览器扩展测试请使用支持扩展加载的 Chromium 通道。
