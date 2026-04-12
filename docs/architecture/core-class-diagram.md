[English](core-class-diagram.md) | [中文](../zh/architecture/core-class-diagram.zh-CN.md)

# Core Class Diagram

The `packages/core` class diagram is generated directly from source with `tsuml2`. The generated artifacts live beside this document:

- `docs/architecture/core-class-diagram.mmd`
- `docs/architecture/core-class-diagram.svg`

## How To View It

- Open `docs/architecture/core-class-diagram.svg` directly.
- Open `docs/architecture/core-class-diagram.mmd` in a Mermaid-capable Markdown preview.
- Paste the Mermaid content into Mermaid Live Editor.

## How To Refresh It

When the exported interfaces, classes, or associations in `packages/core` change, run:

```bash
pnpm diagram:core
```

This command regenerates both the Mermaid DSL and SVG artifacts.
