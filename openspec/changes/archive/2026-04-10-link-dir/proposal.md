## Why

当前知识工作区只能把根目录本身作为上下文入口，无法通过一个空目录把别处的资料目录“挂”到顶层来用。这样会迫使用户复制文件或重组磁盘目录，既破坏原有目录结构，也让一个逻辑工作区无法复用多个分散存放的资料集。

## What Changes

- 在空目录下的 `.agent.json` 中新增 `linkDir` 字段，用来声明该目录要挂载的外部文件夹。
- 知识上下文提供器在解析工作区时，识别这类目录并把其内容映射为顶层可见节点。
- 挂载目录内的文件读取、写入、新建、删除、重命名和搜索，都以真实目标目录为落点，但对外仍保持挂载后的虚拟路径。
- 挂载根目录本身仍作为工作区内的别名入口处理；重命名和删除只影响别名目录，不直接改动真实目标目录的名称或位置。
- 继续沿用现有 Agent 继承和作用域解析规则，挂载目录及其子目录仍可通过 `.agent.json` 形成各自的生效 Agent。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `agent-binding`: `.agent.json` 需要支持新增的 `linkDir` 字段，并允许把空目录声明为外部目录挂载入口。
- `knowledge-context-provider`: `getContext()`、读写、创建、删除、重命名和搜索都需要理解挂载目录的虚拟路径与真实路径映射。
- `knowledge-workspace`: 左侧文件树需要把挂载目录展示为顶层目录，并保持现有节点操作与 Agent 标识行为一致。

## Impact

- 主要影响 `packages/node/src/context/FileSystemContextProvider.ts` 的目录扫描、路径解析和文件操作逻辑。
- 需要补充 `packages/node` 与 `apps/server` 的上下文 provider 测试，覆盖挂载、路径映射和边界错误。
- 知识工作区的目录树、节点操作和搜索结果都要适配挂载后的虚拟路径。
