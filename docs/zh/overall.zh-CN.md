[English](../overall.md) | [中文](overall.zh-CN.md)

# 仓库概览

## 产品摘要

ChatPrism 是一个多宿主 AI 工作台，面向需要稳定进行模型比对、恢复长会话历史，以及以文档为中心整理知识的用户。

## 主要目标用户

- 需要跨多个模型验证重要结论的重度 AI 用户。
- 希望搜索、回看并提炼长对话的人。
- 希望把聊天结果沉淀为可复用知识文档的个人知识工作者。

## 核心价值

- 在接受结论前先比较多个模型的回答。
- 跨宿主恢复和搜索历史会话。
- 将重复的 AI 输出整理为结构化知识资产。
- 优先复用已有 provider 账号，而不是强制依赖单独托管订阅。

## 公开文档范围

Phase 1 的公开文档范围包括：

- `README.md`、`CONTRIBUTING.md`、`ARCHITECTURE.md` 等根级入口文档。
- 解释仓库范围、Context Provider 和主 C4 DSL 的核心 `docs/` 页面。
- 统一放在 `docs/zh/` 下的中文镜像。

`docs/history/` 下的历史文档继续保留，但已明确不属于 Phase 1 公共文档迁移范围。

## 架构摘要

- 共享运行时契约位于 `packages/core`。
- 共享界面和工作区视图位于 `packages/ui`。
- Node-only 适配层位于 `packages/node`。
- 宿主装配位于 `apps/web`、`apps/extension`、`apps/desktop` 和 `apps/server`。

公开架构入口请参阅 [../../ARCHITECTURE.zh-CN.md](../../ARCHITECTURE.zh-CN.md) 和 [workspace.zh-CN.dsl](workspace.zh-CN.dsl)。
