## 1. 根级公开入口与仓库元数据

- [x] 1.1 新增或重写根级英文公开文档：`README.md`、`CONTRIBUTING.md`、`ARCHITECTURE.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`LICENSE`
- [x] 1.2 新增根级中文镜像文档：`README.zh-CN.md`、`CONTRIBUTING.zh-CN.md`、`ARCHITECTURE.zh-CN.md`
- [x] 1.3 更新 `/Users/quanzhou/Workspace/JARVIS/package.json` 的 `description`、`repository`、`homepage`、`bugs` 字段

## 2. 文档镜像结构与术语表

- [x] 2.1 新建仓库级术语表文档，并定义 Phase 1 使用的核心中英文术语
- [x] 2.2 为纳入 Phase 1 的核心 `docs/` 文档建立 `docs/` 英文主文档与 `docs/zh/` 中文镜像结构
- [x] 2.3 在所有纳入 Phase 1 的公开文档顶部补充 `English | 中文` 双向互链
- [x] 2.4 保持 `docs/` 下历史性 phase 文档不变，只在范围文档中注明其不属于 Phase 1

## 3. 架构主入口英文化

- [x] 3.1 将 `/Users/quanzhou/Workspace/JARVIS/docs/workspace.dsl` 改为英文主版本
- [x] 3.2 新增 `/Users/quanzhou/Workspace/JARVIS/docs/zh/workspace.zh-CN.dsl` 作为中文镜像
- [x] 3.3 基于 `workspace.dsl` 的 context 图和 container 图编写英文 `ARCHITECTURE.md`
- [x] 3.4 基于英文架构入口补充 `ARCHITECTURE.zh-CN.md` 镜像内容

## 4. 文档一致性与可验证性

- [x] 4.1 检查根级公开文档、`docs/` 核心文档、中文镜像之间的链接是否完整且无断链
- [x] 4.2 校对公开文档中的关键术语，确保与仓库级术语表一致
- [x] 4.3 补充一组基于 Playwright 的最小文档入口验证用例或等效浏览器级回归方案，覆盖英文主入口、中文镜像入口和架构文档互链
- [x] 4.4 运行本阶段所需的验证命令并记录结果，确保在进入 Phase 2 前公开入口结构稳定
