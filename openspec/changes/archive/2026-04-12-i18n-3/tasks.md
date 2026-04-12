English | [中文](tasks.zh-CN.md)

## 1. 用户可见异常英文统一

- [x] 1.1 扫描 `packages/ui`、`packages/core`、`packages/node`、`apps/server`、`apps/web`、`apps/extension`、`apps/desktop` 中的中文错误文本，并按用户可见、API 透出、内部日志、外部站点 selector 分类
- [x] 1.2 将 `packages/ui` store 中会写入 UI error state 的中文消息改为英文默认消息，不新增异常 i18n key
- [x] 1.3 将 `apps/server/src/routes/**` 与 `apps/server/src/types/sync.ts` 中会透出的中文验证和 fallback 错误改为英文默认消息
- [x] 1.4 将 `packages/node/src/context/FileSystemContextProvider.ts` 中会透到 context API/UI 的中文错误改为英文默认消息
- [x] 1.5 将 `apps/extension/src/history/GeminiHistoryTabBridge.ts`、宿主 provider runtime 和 desktop 恢复提示中用户可见中文错误改为英文默认消息
- [x] 1.6 保留 Gemini DOM 抓取配置、selector、regex 中用于外部站点匹配的中文文本

## 2. OpenSpec 双语分文件补齐

- [x] 2.1 为 `openspec/specs/**/spec.md` 补齐同目录 `spec.zh-CN.md` 镜像文件
- [x] 2.2 为当前活跃 `openspec/changes/**` 的 `proposal.md`、`design.md`、`tasks.md` 补齐 `.zh-CN.md` 镜像文件
- [x] 2.3 为当前活跃 `openspec/changes/**/specs/**/spec.md` 补齐 `spec.zh-CN.md` 镜像文件
- [x] 2.4 在 OpenSpec 英文主文件与中文镜像文件顶部补充 `English | 中文` 双向互链
- [x] 2.5 明确跳过 `openspec/changes/archive/**`，不迁移历史归档内容

## 3. 维护模板与贡献规则

- [x] 3.1 新增 `.github` issue / PR 模板，英文优先，并加入 UI i18n、异常英文默认消息、OpenSpec 双语文件检查项
- [x] 3.2 更新 `CONTRIBUTING.md`，记录新增静态用户文案、用户可见异常、正式 OpenSpec 文档的维护规则
- [x] 3.3 更新 `CONTRIBUTING.zh-CN.md`，保持与英文贡献规则语义一致
- [x] 3.4 校对双语 OpenSpec 文档和维护模板中的核心术语，确保遵循仓库级术语表

## 4. 验证与回归

- [x] 4.1 运行中文错误文本静态扫描，确认用户可见错误路径不再残留中文消息，并记录保留的外部站点 selector / regex 例外
- [x] 4.2 运行 OpenSpec 双语文件结构检查，确认正式 specs 与活跃 changes 的英文主文件和中文镜像文件成对存在
- [x] 4.3 补充或更新错误路径单元测试，验证关键错误码和 fallback 错误输出英文默认消息
- [x] 4.4 增加至少一条 Playwright 最小回归用例，覆盖用户可见错误显示英文默认消息
- [x] 4.5 按顺序运行 `pnpm lint`、类型检查、目标宿主构建、最小功能回归和目标范围完整回归
- [x] 4.6 如涉及 extension e2e，按仓库规则申请提权并使用 Playwright `channel: 'chromium'` 执行，完成后运行 `pnpm --filter extension build`
