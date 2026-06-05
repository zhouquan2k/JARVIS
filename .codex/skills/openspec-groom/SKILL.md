---
name: openspec-groom
description: Collaborate with the user to clarify and discuss a raw requirement, aligning it with project goals and architecture. Use when the user wants to think through a requirement before committing to an OpenSpec change. After user confirmation, create a lightweight pre-OpenSpec change document.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

Collaborate with the user to clarify and discuss a raw requirement before creating a lightweight pre-OpenSpec change document.

## Context

Project background, goals, and architecture constraints are described in:

- `README.md`

The user only provides the current requirement.

## Goal

Discuss and clarify the requirement with the user through conversation:
- Understand the requirement against the project goals and architecture constraints
- Align on scope, boundaries, and implementation approach
- Address questions and concerns

**Only after user confirmation**, create or update:
- `docs/<change-name>.md`

The `<change-name>` may later become the OpenSpec change name.

## Rules

### Discussion Flow

Follow these phases in sequence. **User must explicitly confirm (e.g., "确认") before moving to the next phase.** If user provides feedback without explicit confirmation, iterate and refine the current phase based on that feedback. Repeat the phase until user is satisfied and explicitly confirms.

#### Phase 1: Requirement & Goal Alignment
**Focus on REQUIREMENT VALIDITY, NOT implementation concerns.**
- Validate requirement against project goals and architecture constraints
- Discuss scope, necessity, and user value
- Clarify user intent and expected outcomes
- Identify potential requirement issues or conflicts
- **Do NOT discuss**: implementation feasibility, technical solutions, or design details

#### Phase 2: Requirement Refinement
**Focus on REQUIREMENT CLARITY, NOT implementation concerns.**
- Break down the requirement into clear, actionable components
- Define boundaries and non-goals explicitly
- Discuss dependencies and related features
- Align on acceptance criteria and success metrics
- **Describe user interface (UI)**: layout, components, visual elements involved
- **Describe interaction logic**: user actions, system responses, workflow sequence
- **Do NOT discuss**: technical feasibility, design approaches, or implementation strategies

#### Phase 3: Implementation Approach
**Now consider implementation and feasibility.**
- Assess technical feasibility of the refined requirement
- Discuss recommended architecture and design
- Include modules, classes, interfaces, responsibilities
- Identify important relationships and impacts
- Keep discussion practical and concise
- **Do not write detailed code** at this stage

#### Phase 4: Output Documentation
- Only after user confirms all previous phases
- Create or update: `docs/<change-name>.md`
- Generate structured documentation based on confirmed content
- **Include key class Mermaid diagram** using mermaid-class-diagram skill to visualize core classes and relationships

### General Rules

- Read `README.md` first to understand project context
- **Phase Progression**: Only move to next phase when user explicitly confirms (e.g., "确认", "OK", "Confirmed"). Without explicit confirmation, treat feedback as iteration request and refine current phase
- **Iteration Within Phase**: If user provides feedback/questions without explicit confirmation, adjust output based on feedback and continue discussing the current phase until user explicitly confirms
- **Phases 1-2: Focus on requirement validity and clarity** - Do NOT discuss implementation details, technical feasibility, or design solutions
- **Phase 3+: Now consider implementation** - Discuss technical approach, feasibility, and architectural impacts
- Keep discussion at requirement and architecture level
- Be concise and practical
- Do not write detailed code
- Do not modify files under `openspec/`
- Do not update the global class diagram directly
- Only describe possible global class diagram impacts in the output document
- **Raise questions proactively** if any aspect is unclear or potentially problematic

## Output Structure

Generated after Phase 4, when user confirms all previous discussions:

```md
# <title>

## 原始需求

[User's raw requirement as initially stated]

## 详细需求

### 需求范围
- 需求边界
- 非目标

### 界面描述 (UI)
[描述用户界面元素、布局、视觉组件等]

### 交互逻辑
[描述用户动作、系统响应、交互流程序列等]

## 推荐实现方案

### 架构设计
[Modules, classes, interfaces, responsibilities, relationships]

### 关键类 Mermaid 类图
使用 mermaid-class-diagram skill 生成的关键类设计图，展示核心类、接口及其关系：

```mermaid
classDiagram
    [Key classes and relationships diagram]
```

## 验收标准

用于后续e2e测试验证需求的实现是否完整、正确：

| 动作 | 预期响应 |
|-----|--------|
| [描述用户动作或操作] | [描述系统的预期响应] |
| [描述用户动作或操作] | [描述系统的预期响应] |
| ... | ... |


```

TODO： 需要描述需求的用户价值
