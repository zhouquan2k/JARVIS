## Verification Report: prototype-compare

### Summary
| Dimension | Status |
|---|---|
| Completeness | 25/25 tasks 完成；17 条 requirements 均有实现证据 |
| Correctness | 17/17 requirements 覆盖；16/20 scenarios 有自动化测试证据，4 个场景仅代码证据 |
| Coherence | 设计决策总体一致；发现 1 条模式一致性建议 |

### 关键证据（Requirement 实现映射）
- 静态配置与 analyzer 节点：`packages/core/config.ts:17`, `packages/core/config.ts:33`
- runtime `fresh` 隔离能力：`packages/core/src/runtime/types.ts:13`, `packages/core/src/runtime/createProviderRuntime.ts:27`, `packages/core/src/runtime/createProviderRuntime.test.ts:27`
- `ComparisonAnalyzer`（配置驱动、流式透传、五字段解析/报错、Markdown JSON 与数组字段兼容）：`packages/core/src/analysis/ComparisonAnalyzer.ts:32`, `packages/core/src/analysis/ComparisonAnalyzer.ts:65`, `packages/core/src/analysis/ComparisonAnalyzer.test.ts:43`, `packages/core/src/analysis/ComparisonAnalyzer.test.ts:116`
- 并发控制器（A/B 并发、双路完成后分析、生命周期）：`packages/core/src/workflows/CompareWorkflowController.ts:48`, `packages/core/src/workflows/CompareWorkflowController.ts:60`, `packages/core/src/workflows/CompareWorkflowController.ts:74`, `packages/core/src/workflows/CompareWorkflowController.test.ts:46`
- 对比 UI（双选择器、双栏原生输出、首字切页、分析网格/失败降级、Markdown 原生渲染）：`packages/ui/src/components/CompareModelSelectors.vue:3`, `packages/ui/src/views/CompareChatView.vue:25`, `packages/ui/src/components/MarkdownContent.vue:1`, `packages/ui/src/store/compare.ts:148`, `packages/ui/src/components/AnalysisGrid.vue:9`, `packages/ui/src/components/AnalysisGrid.vue:32`
- 宿主路由与共享视图复用：`apps/web/src/router.ts:11`, `apps/web/src/App.vue:25`
- 自动化验证：core 单测全通过；E2E 全通过（6 passed，覆盖 Markdown JSON 兼容与原生 Markdown 渲染场景）：`packages/core/src/analysis/ComparisonAnalyzer.test.ts:42`, `apps/web/tests/e2e/normal-chat.spec.ts:3`, `apps/web/tests/e2e/normal-chat.spec.ts:25`, `apps/web/tests/e2e/compare-chat.spec.ts:3`, `apps/web/tests/e2e/compare-chat.spec.ts:31`, `apps/web/tests/e2e/compare-fallback.spec.ts:3`, `apps/web/tests/e2e/compare-markdown-json.spec.ts:3`

## Issues by Priority

### CRITICAL
- 无。

### WARNING
- `Scenario` 自动化覆盖不足：`Changing Provider A updates only Model A options` 目前只有实现证据，无专门测试。  
  Recommendation: 新增 E2E，操作 A 侧 provider 后断言 B 侧 provider/model 不变。参考实现点 `packages/ui/src/components/CompareModelSelectors.vue:90`。
- `Scenario` 自动化覆盖不足：`Long outputs do not push sticky regions out of viewport` 目前依赖 CSS 实现，无行为断言测试。  
  Recommendation: 新增 E2E，注入长内容并断言顶部/底部 sticky 区域持续可见。参考实现点 `packages/ui/src/views/CompareChatView.vue:134`, `packages/ui/src/views/CompareChatView.vue:194`, `packages/ui/src/views/CompareChatView.vue:231`。
- `Scenario` 自动化覆盖不足：`Analysis tab receives streaming content before final parse` 未看到对中间态 `analysis-streaming` 的断言。  
  Recommendation: 新增 E2E 或组件测试，先断言 `analysis-streaming`，再断言最终 `analysis-grid`。参考实现点 `packages/ui/src/components/AnalysisGrid.vue:32`。

### SUGGESTION
- 代码边界一致性：UI/Web 仍有对 `@packages/core/src/...` 的深层导入，弱化了 `@packages/core` 公共导出边界。  
  Recommendation: 优先改为 `@packages/core` 公共 API 导入。参考 `packages/ui/src/store/compare.ts:3`, `apps/web/src/providerRuntime.ts:1`, 公共导出见 `packages/core/src/index.ts:1`。

## Final Assessment
No critical issues. 3 warning(s) to consider. Ready for archive (with noted improvements).
