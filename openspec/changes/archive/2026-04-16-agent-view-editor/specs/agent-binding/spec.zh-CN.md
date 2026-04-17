## ADDED Requirements

### Requirement: Agent binding MUST support default merge inheritance and explicit override
系统 MUST 支持两种 `.agent.json` 继承模式：`merge` 与 `override`。缺少 `inheritance` 时 MUST 按 `merge` 处理。在 `merge` 模式下，解析后的 Agent MUST 继承父级配置，并按父到子的顺序合并系统提示词。在 `override` 模式下，当前 `.agent.json` MUST 在该层截断父级和默认继承，只使用当前配置中显式声明的字段。更深层子配置 MAY 继续从该 override 结果合并，除非它也声明 `override`。

#### Scenario: Merge parent and child agent prompts by default
- **WHEN** 父目录和子目录都声明了有效 `.agent.json`，且子配置未声明 `inheritance`
- **THEN** 解析后的子 Agent MUST 包含继承来的父级配置
- **AND** 生效提示词 MUST 将父级提示词拼接在子级提示词之前

#### Scenario: Merge mode is equivalent to missing inheritance
- **WHEN** 子级 `.agent.json` 显式声明 `inheritance` 为 `merge`
- **THEN** 系统 MUST 使用与缺少 `inheritance` 字段相同的行为解析 Agent
- **AND** 父级配置 MUST 继续被继承

#### Scenario: Override truncates parent and default inheritance
- **WHEN** 子级 `.agent.json` 声明 `inheritance` 为 `override`
- **THEN** 解析后的子 Agent MUST 只使用该子配置中显式声明的字段
- **AND** 解析后的子 Agent MUST NOT 继承父级提示词、父级模型选择、父级工具、父级技能或默认 fallback 工具

#### Scenario: Deeper children may merge from an override ancestor
- **WHEN** 一个 override Agent 下面存在更深层且使用默认 merge 行为的子 Agent
- **THEN** 更深层子 Agent MUST 与该 override 祖先的解析配置合并
- **AND** 更深层子 Agent MUST NOT 恢复已被 override 祖先截断的配置

#### Scenario: Reject invalid inheritance values
- **WHEN** `.agent.json` 声明的 `inheritance` 不是 `merge` 或 `override`
- **THEN** 系统 MUST 产生可诊断的 Agent 配置错误
- **AND** 系统 MUST NOT 静默回退到 merge 或默认 Agent 行为

## REMOVED Requirements

### Requirement: Agent binding MUST support phase-one nearest-parent resolution with explicit override and fallback
**Reason**: phase-one nearest-parent 行为显式排除了 merge 支持，与目标默认继承和提示词合并行为冲突。

**Migration**: 使用新的 `Agent binding MUST support default merge inheritance and explicit override` 要求。未声明 `inheritance` 的既有配置现在使用默认 merge。需要独立行为的配置必须声明 `inheritance: "override"`。
