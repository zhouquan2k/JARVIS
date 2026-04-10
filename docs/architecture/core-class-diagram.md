# Core Class Diagram

`packages/core` 的类图由 `tsuml2` 从源码直接生成，当前输出文件在 [core-class-diagram.mmd](/Users/quanzhou/Workspace/ChatPrism/docs/architecture/core-class-diagram.mmd) 和 [core-class-diagram.svg](/Users/quanzhou/Workspace/ChatPrism/docs/architecture/core-class-diagram.svg)。

## 如何查看

- 直接打开 [core-class-diagram.svg](/Users/quanzhou/Workspace/ChatPrism/docs/architecture/core-class-diagram.svg)
- 在支持 Mermaid 的 Markdown 预览器中打开 `docs/architecture/core-class-diagram.mmd`
- 或将 `docs/architecture/core-class-diagram.mmd` 的内容粘贴到 Mermaid Live Editor

## 如何同步

当 `packages/core` 的接口、类或关系发生变化后，在仓库根目录执行：

```bash
pnpm diagram:core
```

该命令会重新生成 `docs/architecture/core-class-diagram.mmd` 和 `docs/architecture/core-class-diagram.svg`。
