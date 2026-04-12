[English](../../architecture/core-class-diagram.md) | [中文](core-class-diagram.zh-CN.md)

# Core Class Diagram

`packages/core` 的类图由 `tsuml2` 从源码直接生成，生成产物与本文位于同一目录：

- `docs/architecture/core-class-diagram.mmd`
- `docs/architecture/core-class-diagram.svg`

## 查看方式

- 直接打开 `docs/architecture/core-class-diagram.svg`。
- 在支持 Mermaid 的 Markdown 预览器中打开 `docs/architecture/core-class-diagram.mmd`。
- 或将 Mermaid 内容粘贴到 Mermaid Live Editor 中查看。

## 同步方式

当 `packages/core` 中导出的接口、类或关联关系发生变化后，执行：

```bash
pnpm diagram:core
```

该命令会重新生成 Mermaid DSL 和 SVG 两个产物。
