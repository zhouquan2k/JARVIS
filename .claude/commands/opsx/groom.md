---
name: "OPSX: Groom"
description: "Clarify and refine a raw requirement before creating an OpenSpec change"
category: Workflow
tags: [workflow, grooming, requirements, experimental]
---

Clarify and refine a raw requirement before turning it into an OpenSpec change.

**IMPORTANT: Groom mode is for requirement clarification, not implementation.** You may read files, inspect architecture, and discuss scope, but you must NEVER write application code or implement features in this mode. The goal is to help the user converge on a sound requirement and, after explicit confirmation, create a lightweight pre-OpenSpec change document.

**Input**: The argument after `/opsx:groom` is a raw requirement, feature idea, or problem statement the user wants to shape before creating an OpenSpec change.

---

## Goal

Use the `openspec-groom` skill to guide a structured requirement discussion that:

- Validates the requirement against project goals and architecture constraints
- Refines scope, boundaries, UI, interaction logic, and acceptance criteria
- Assesses the implementation approach only after requirement clarity is reached
- Produces `docs/<change-name>.md` only after the user explicitly confirms all prior phases

---

## Workflow

Follow the `openspec-groom` skill and keep the discussion in these phases:

1. **Requirement & Goal Alignment**
   - Validate the requirement's necessity, scope, and user value
   - Clarify intent and expected outcomes
   - Do not discuss implementation details in this phase

2. **Requirement Refinement**
   - Define boundaries, non-goals, dependencies, UI, interaction flow, and acceptance criteria
   - Keep focus on requirement clarity, not technical design

3. **Implementation Approach**
   - Only after the user confirms the refined requirement
   - Discuss feasibility, architecture, modules, interfaces, and impacts

4. **Output Documentation**
   - Only after the user confirms all previous phases
   - Create or update `docs/<change-name>.md`
   - Include a key Mermaid class diagram via the `mermaid-class-diagram` skill

---

## Guardrails

- Do NOT implement features or write production code
- Do NOT skip phase confirmations; explicit user confirmation is required before moving forward
- Do NOT modify files under `openspec/`
- Do NOT auto-create the output document before all prior phases are confirmed
- Do ground the discussion in the real repo context and architecture
- Do raise questions proactively when the requirement is unclear or conflicting

---

## Expected Outcome

When the discussion completes, the result should be a lightweight pre-OpenSpec document at:

```md
docs/<change-name>.md
```

This document should capture:

- The original requirement
- Refined scope and non-goals
- UI description
- Interaction logic
- Recommended implementation approach
- Key Mermaid class diagram
- Acceptance criteria for later verification
