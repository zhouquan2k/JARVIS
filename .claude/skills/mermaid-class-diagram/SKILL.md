---
name: mermaid-class-diagram
description: Create or refine Mermaid class diagrams for architecture discussions. Use when the task is to draw a class diagram, standardize class-diagram notation, clarify create/consume/render relationships, show package ownership, or add short Chinese role labels to classes.
---

# Mermaid Class Diagram

Use this skill when the user wants a Mermaid class diagram or wants to normalize how one is drawn.

## Core Rules

1. Express current responsibilities only.
   Do not split classes for hypothetical future needs. Keep the class count low unless current responsibilities are already different.

2. Make creation responsibility explicit.
   For important runtime objects, show who `create`s them. Do not rely on vague dependency lines alone.

3. Limit edge verbs.
   Prefer only:
   - `create`: creates or assembles an object
   - `consume`: uses an object but does not create it
   - `render`: renders a UI component or view

4. Show package ownership.
   Group classes by package or layer so the reader can tell which objects belong to app, UI, core, or runtime/system code.

5. Add short Chinese role labels to ambiguous classes.
   Use very short role text to distinguish layers or duties, such as who handles bootstrap/create versus shared UI render.

6. Do not draw undecided relationships.
   Only include relationships that are already confirmed in the current design discussion.

## Output Shape

1. Provide the Mermaid class diagram first.
2. If explanation is needed, keep it short.
3. Notes should focus on:
   - what a class is for
   - who consumes it
   - when it is used

## Quality Bar

- Prefer fewer classes over wrapper/result-container objects that only bundle other values.
- Keep role boundaries readable at a glance.
- If two classes have similar names, explicitly distinguish their roles in Chinese.
