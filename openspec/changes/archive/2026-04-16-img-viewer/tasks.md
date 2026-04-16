## 1. Viewer 注册

- [x] 1.1 新增 `packages/ui/src/document-viewers/imageViewer.ts`，定义只读 `image` viewer，并支持 `image/png`、`image/jpeg`、`image/gif`、`image/svg+xml`、`image/webp`。
- [x] 1.2 修改 `packages/ui/src/document-viewers/registry.ts`，将 `imageViewer` 注册到 `DOCUMENT_VIEWERS`，保持现有 md/text/pdf 解析行为不变。

## 2. 主面板渲染

- [x] 2.1 修改 `packages/ui/src/components/DocumentEditorPane.vue`，新增 `imageDataUrl` computed，使用 `activeDocument.mimeType` 与 `activeDocument.dataBase64` 构造图片 data URL。
- [x] 2.2 在 `DocumentEditorPane.vue` 模板中新增 `activeViewerId === 'image'` 渲染分支，输出 `data-testid="document-image-viewer"` 的只读图片预览。
- [x] 2.3 为图片 viewer 增加主面板自适应样式，确保图片居中、完整显示且不撑破三栏布局。
- [x] 2.4 确认图片 viewer 不显示 Markdown 模式切换，不启用保存，不进入文本 diff、undo、redo 或自动保存链路。

## 3. 单元测试

- [x] 3.1 扩展 `packages/ui/src/store/documentWorkspace.test.ts`，覆盖图片文档打开后解析为 `image` viewer、只读 capabilities、`activePaneMode === 'viewer'`、`draftContent === ''`。
- [x] 3.2 扩展 `packages/ui/src/components/DocumentEditorPane.test.ts`，覆盖图片 viewer 渲染 `<img>` data URL、保存按钮 disabled、切换到非图片文档后不残留图片状态。

## 4. E2E 验证

- [x] 4.1 扩展 `apps/web/tests/e2e/knowledge-workspace.spec.ts`，使用现有 fixture 中的图片文件打开知识工作区图片节点，断言 `document-image-viewer` 可见且保存按钮 disabled。
- [x] 4.2 若 fixture 中图片节点不便直接选择，补充最小图片 fixture，并保持现有 Markdown 内嵌图片测试不变。

## 5. 自动验证

- [x] 5.1 运行 `pnpm lint`。
- [x] 5.2 运行 `pnpm --filter @packages/ui test`。
- [x] 5.3 运行 `pnpm --filter web build`。
- [x] 5.4 启动必要 dev/server 后运行目标 Web Playwright 用例：`pnpm --filter web test:e2e -- knowledge-workspace.spec.ts`。
