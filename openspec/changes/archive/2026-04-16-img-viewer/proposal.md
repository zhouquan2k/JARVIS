## Why

知识工作区目前能打开 Markdown、纯文本和 PDF，但直接选中图片文件时会进入不支持状态。图片已经是知识库中的常见资料形态，现有 `readDocument()` 契约也已经能返回图片 MIME 与 base64 内容，因此需要补齐主面板的图片查看能力。

## What Changes

- 为知识工作区增加只读图片 viewer，使用户可以在主面板打开常见图片文件。
- 支持现有 MIME 推断已覆盖的图片类型：`image/png`、`image/jpeg`、`image/gif`、`image/svg+xml`、`image/webp`。
- 图片 viewer 通过当前 `ContextDocument.mimeType + dataBase64` 生成 data URL 展示，不新增独立读取接口。
- 图片文件保持只读：保存按钮不可用，不进入文本编辑、Markdown 模式切换、diff、undo/redo 链路。
- 未命中图片 MIME 或其它已注册 viewer 的文件继续显示现有“不支持此文档类型”状态。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `knowledge-workspace`: 知识工作区的 `DocumentViewer` registry 需要把图片 MIME 解析到只读图片 viewer，并在主面板中显示图片文件。

## Impact

- 影响共享 UI：`packages/ui/src/document-viewers/*`、`packages/ui/src/components/DocumentEditorPane.vue`、`packages/ui/src/store/documentWorkspace.ts` 的 viewer 解析相关测试。
- 不修改 `IContextProvider.readDocument()`、`ContextDocument` 或 HTTP/桌面/扩展桥接契约。
- 不新增运行时依赖；图片展示使用浏览器原生 `<img>` 与 data URL。
- Web、Extension、Desktop 宿主将通过共享 `DocumentWorkspaceView` 获得一致的图片查看行为。
