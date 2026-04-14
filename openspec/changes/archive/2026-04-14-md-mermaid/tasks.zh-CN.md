[English](tasks.md) | 中文

## 1. Markdown Editor 配置

- [x] 1.1 如果尚未存在，在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/package.json` 中加入官方 `mermaid` 依赖。
- [x] 1.2 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/markdownDocument.ts` 中新增 `MarkdownViewerMode = 'viewer' | 'edit'`，并为 `CreateMarkdownEditorOptions` 增加 `mode` 和 `documentPath`。
- [x] 1.3 在 `createMarkdownEditor(options)` 中配置 `CrepeFeature.CodeMirror`，使 `viewer` 模式可提供 preview，`edit` 模式保持 Mermaid 源码可编辑。

## 2. Mermaid Preview 工具

- [x] 2.1 新增 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/mermaidPreview.ts`，实现 `renderMermaidPreview(language, content, applyPreview)` 和 Mermaid 懒初始化。
- [x] 2.2 使用 `startOnLoad: false` 和 `securityLevel: 'strict'` 初始化 Mermaid。
- [x] 2.3 将 Mermaid 语法或渲染失败转换成受控 preview 错误或安全 fallback，不得把异常抛穿 editor 生命周期。
- [x] 2.4 在 `markdownDocument.ts` 中仅对 `viewer` 模式下的 `mermaid` fenced code block 调用 `renderMermaidPreview`。

## 3. Markdown 图片显示

- [x] 3.1 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/markdownDocument.ts` 中新增 `resolveMarkdownImageUrl(src, documentPath)`。
- [x] 3.2 对远程 `http:`/`https:` URL 和 `data:image/...` URL 原样通过。
- [x] 3.3 按活动 Markdown 文档目录解析本地相对图片链接，不得暴露无关本地文件系统路径。
- [x] 3.4 尽量复用 Milkdown 图片渲染路径，不在 editor 外新增第二套完整 Markdown parser。

## 4. Document Editor Pane UI

- [x] 4.1 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/components/DocumentEditorPane.vue` 中增加本地 `markdownViewerMode` 状态，Markdown 文档默认 `viewer`。
- [x] 4.2 新增 `switchMarkdownViewerMode(nextMode)`，切换时读取当前 Markdown、发送 `update:modelValue`、销毁 editor、更新模式并重建 editor。
- [x] 4.3 仅为 `text/markdown` 文档在 Markdown viewer header 右侧渲染模式开关。
- [x] 4.4 从 `DocumentEditorPane.vue` 调用 `createMarkdownEditor` 时传入 `mode` 和 `documentPath`。
- [x] 4.5 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/i18n/messages/en.ts` 和 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/i18n/messages/zh-CN.ts` 中补共享 UI 文案。
- [x] 4.6 补充 Markdown 图片、Mermaid preview 容器、preview 错误和横向 overflow 的 scoped 样式，同时保持现有 editor surface。

## 5. 测试与验证

- [x] 5.1 更新 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/components/DocumentEditorPane.test.ts`，覆盖默认 `viewer` 模式、模式开关可见、切换模式保留内容，以及非 Markdown 纯文本文档不显示 Markdown preview 开关。
- [x] 5.2 为 Mermaid preview 接线和图片 URL 解析补相关 `packages/ui` 工具单元测试。
- [x] 5.3 增加 Playwright E2E 覆盖：打开包含普通 Markdown、Mermaid 和图片链接的文档，验证默认 `viewer`、切换到 `edit`、再切回 `viewer` 和内容保全。
- [x] 5.4 运行 `pnpm lint`。
- [x] 5.5 运行 `pnpm --filter @packages/ui test`。
- [x] 5.6 运行相关 build，至少覆盖会使用 `packages/ui` 的 Web build。
- [x] 5.7 运行主文档 viewer 的定向 Playwright E2E 测试。
- [x] 5.8 如果本变更使用 extension E2E，先申请提权，使用支持 MV3 的 Chromium channel 运行；extension E2E 通过后再运行 `pnpm --filter extension build`。

## 6. PDF 内嵌预览

- [x] 6.1 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/markdownDocument.ts` 中新增 `injectPdfEmbeds(root, documentPath)`：扫描 `root` 内 `href` 以 `.pdf` 结尾（大小写不敏感）的 `<a>` 元素，通过 `resolveMarkdownImageUrl` 解析 URL，创建带有 `data-pdf-embed-src` 属性和全宽 `<iframe>` 的 `.pdf-inline-embed` `<div>`，插入到 `contenteditable` host 元素之后（使 embed 完全在 ProseMirror 管辖域外）。去重通过 `root.querySelector('.pdf-inline-embed[data-pdf-embed-src="<url>"]')` 检测实现。原始 `<p>` 的隐藏通过 `DocumentEditorPane.vue` 中的 CSS `:has(a[href$='.pdf' i])` scoped 规则实现，而非 JS inline style。
- [x] 6.2 在 `attachMarkdownImageResolution`（仅 viewer 模式）中，editor 创建后通过 `queueMicrotask` 调用一次 `injectPdfEmbeds`，随后注册 `MutationObserver` 监听 `root` DOM 变化，以 100 ms 防抖（`setTimeout`）重新执行 `injectPdfEmbeds`，并在共享 `AbortController` abort 时断开 observer 并清理待执行的 timer。
- [x] 6.3 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/components/DocumentEditorPane.vue` 中新增 `.pdf-inline-embed`（全宽容器，`margin: 12px 0`）、`.pdf-inline-embed iframe`（`width: 100%`、`height: 500px`、`border: 0`）及 `.ProseMirror p:has(a[href$='.pdf' i])` 隐藏规则的 scoped 样式。
- [x] 6.4 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/markdownDocument.test.ts` 中补单元测试：验证 PDF anchor 产生含正确解析 URL 的 iframe 元素，以及 DOM 变化后重新注入不产生重复 embed；并补充 edit 模式下不注入 PDF embed 的覆盖用例。
- [x] 6.5 在 `/Users/quanzhou/Workspace/JARVIS/apps/web/tests/e2e/knowledge-workspace.spec.ts` 中补 E2E 覆盖：打开 `pdf-embed.md`，验证文档正文中出现 `<iframe>`，且 `src` 指向正确的 `document-asset` URL。
- [x] 6.6 运行 `pnpm lint`、`pnpm --filter @packages/ui test` 和定向 E2E spec，确认全部通过。
