English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Agent binding MUST use `.agent.json` as the scoped configuration source
系统 MUST 使用隐藏文件 `.agent.json` 作为目录作用域 Agent 的唯一配置载体。该文件 MUST 支持声明 Agent 名称、职责描述、核心指令、目标模型 Provider、目标模型名称、工具列表、技能列表、继承策略，以及可选的 `linkDir` 字段，以便知识目录能够以 Config-as-Code 的方式沉淀 Agent 身份与能力。

#### Scenario: Read agent identity and capabilities from `.agent.json`
- **WHEN** 某个目录下存在合法的 `.agent.json`
- **THEN** 系统 MUST 能从中解析出 Agent 的 `name`、`instructions`、`modelProviderName`、`modelName`、`tools`、`skills` 与 `inheritance`
- **AND** 若该配置还声明了 `linkDir`，系统 MUST 继续将其解析为字符串路径
- **AND** 这些配置 MUST 与知识目录内容一起存放在本地文件系统中

#### Scenario: Accept mount declarations only from empty top-level directories
- **WHEN** 根目录下某个空目录的 `.agent.json` 声明了 `linkDir`
- **THEN** 系统 MUST 将该目录视为合法的挂载入口候选
- **AND** 若同一目录下还存在其他可见文件或子目录，系统 MUST 视为非法挂载声明

#### Scenario: Reject malformed mount declarations in `.agent.json`
- **WHEN** `.agent.json` 中的 `linkDir` 不是非空字符串
- **THEN** 系统 MUST 产生可诊断的 Agent 配置错误
- **AND** 调用方 MUST 能区分“未找到配置”“配置文件非法”与“挂载声明非法”这几种结果

#### Scenario: Resolve the mount target relative to the declaring directory
- **WHEN** `linkDir` 使用相对路径声明挂载目标
- **THEN** 系统 MUST 以当前声明目录作为基准解析目标路径
- **AND** 解析结果 MUST 继续经过存在性与目录类型校验

### Requirement: Agent binding MUST resolve the effective agent using nearest-parent scope lookup
系统 MUST 以当前激活文件所在目录或当前激活目录本身作为起点，沿目录树向上查找最近的 `.agent.json`，并据此解析当前作用域的生效 Agent。若当前层级未命中，系统 MUST 继续向父目录查找，直到根目录或命中 `override` 配置为止。对于通过 `linkDir` 挂载进来的顶层目录，系统 MUST 以挂载后的虚拟路径继续执行最近父级查找，而不是回退到真实来源目录的物理路径。

#### Scenario: Resolve the nearest scoped agent for an active file
- **WHEN** 用户激活 `/workspace/project/docs/guide.md`
- **THEN** 系统 MUST 先从 `/workspace/project/docs/.agent.json` 开始查找
- **AND** 若该层未命中，则 MUST 继续向 `/workspace/project/.agent.json` 与更高层目录逐级查找

#### Scenario: Resolve agents inside a mounted top-level directory by virtual path
- **WHEN** 用户激活由 `linkDir` 挂载得到的顶层目录 `/reports`
- **THEN** 系统 MUST 先以 `/reports/.agent.json` 为当前作用域起点解析 Agent
- **AND** 后续对子目录的最近父级查找 MUST 继续沿 `/reports/...` 这一虚拟路径进行

### Requirement: Agent binding MUST support phase-one nearest-parent resolution with explicit override and fallback
系统 MUST 在当前阶段以最近父级命中为主语义，并支持 `override` 显式截断；`merge` 不属于本轮必须实现范围。若当前层命中合法配置，则系统 MUST 以该层配置为当前阶段的最终生效 Agent，或在显式 `override` 时立即终止继续向上查找。对于 `linkDir` 挂载声明，系统 MUST 在解析失败时显式报错，而不是静默退回到其他目录或默认 Agent。

#### Scenario: Use the nearest valid scoped agent without merge
- **WHEN** 当前激活节点所在目录命中合法的 `.agent.json`
- **THEN** 系统 MUST 直接将该目录配置作为当前阶段的最终生效 Agent
- **AND** 系统 MUST NOT 要求实现父子级 `merge` 合并能力

#### Scenario: Stop lookup on override
- **WHEN** 某层 `.agent.json` 的 `inheritance` 为 `override`
- **THEN** 系统 MUST 以当前层配置作为最终生效 Agent
- **AND** 系统 MUST NOT 再继续向更高层目录查找或合并配置

#### Scenario: Surface mount declaration failures explicitly
- **WHEN** `linkDir` 指向不存在的目录、普通文件或非法路径
- **THEN** 系统 MUST 产生明确错误
- **AND** 系统 MUST NOT 将该目录悄然降级为普通空目录

### Requirement: Agent binding MUST provide a deterministic fallback and explicit config errors
当目录树中不存在任何 `.agent.json` 时，系统 MUST 提供可预测的全局默认 Agent 作为兜底；当命中的 `.agent.json` 非法或无法解析时，系统 MUST 明确暴露该错误，而不是静默退回到随机状态。

#### Scenario: Fall back to the default agent when no scoped config exists
- **WHEN** 当前激活路径及其所有父目录都不存在 `.agent.json`
- **THEN** 系统 MUST 返回具备基础读写能力和通用指令的默认 Agent
- **AND** 默认 Agent MUST 仍然包含稳定的名称与作用域信息

#### Scenario: Surface invalid scoped agent configuration
- **WHEN** 命中的 `.agent.json` 不是合法 JSON 或缺失必要字段
- **THEN** 系统 MUST 产生可诊断的 Agent 配置错误
- **AND** 调用方 MUST 能区分“未找到配置”和“配置文件非法”这两种结果
