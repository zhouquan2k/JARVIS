## ADDED Requirements

### Requirement: Knowledge workspace MUST surface linked top-level directories in the file tree
知识工作区左侧文件树 MUST 把根目录下通过 `.agent.json` 的 `linkDir` 声明得到的挂载目录，呈现为顶层目录节点。该节点 MUST 仍然使用挂载后的虚拟路径作为 UI 路径语义，而不是把底层真实目录的物理路径直接暴露给用户。

#### Scenario: Show a linked directory as a top-level tree entry
- **WHEN** 根目录下某个空目录声明了 `linkDir`
- **THEN** 文件树 MUST 在顶层显示该目录节点
- **AND** 该节点下的内容 MUST 与挂载目标目录一致

#### Scenario: Keep mounted directory paths virtual in the file tree
- **WHEN** 用户在文件树中查看或选择挂载目录下的文件
- **THEN** 系统 MUST 使用挂载后的虚拟路径作为节点路径
- **AND** 文件树 MUST NOT 暴露真实目录的物理路径

### Requirement: Knowledge workspace MUST route node operations through mounted directory aliases
知识工作区对文件树节点执行的新建、删除、重命名和刷新等操作 MUST 继续通过统一的 `IContextProvider` 契约执行。对于挂载目录，UI 层 MUST 只使用虚拟路径发起操作，由上下文提供器负责把这些操作映射到真实目标目录；对挂载根节点本身的重命名或删除 MUST 只影响别名入口，不得直接改动真实目标目录的名称或位置。

#### Scenario: Create a node under a mounted directory
- **WHEN** 用户在挂载目录下新建文件或目录
- **THEN** UI MUST 仍然把挂载后的虚拟路径传给上下文提供器
- **AND** 最终创建 MUST 落到真实目标目录中

#### Scenario: Rename or delete the mounted root only changes the alias entry
- **WHEN** 用户重命名或删除挂载根节点
- **THEN** 系统 MUST 只处理工作区中的别名目录入口
- **AND** 真实目标目录 MUST 保持不变

