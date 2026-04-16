English | [Chinese](spec.zh-CN.md)

## MODIFIED Requirements

### Requirement: Provide a dedicated compare chat view
The system MUST provide a dedicated compare chat view to host concurrent dual-model conversations and analysis result presentation, separate from the normal chat view. This capability MUST preserve consistent behavior semantics in both the Web host and the extension full-window host.

#### Scenario: User opens compare mode from extension full-window host
- **WHEN** the user enters the compare mode entry in the extension full-window host
- **THEN** the system MUST render the compare chat view instead of the normal single-column chat view
- **AND** the view MUST show independent selection states for Model A and Model B.

### Requirement: Support tabbed native-output and analysis panels
The compare chat view MUST provide two tabs, "native output" and "deep analysis", and the native output tab MUST display A/B outputs in equal-width columns; the deep analysis tab MUST show structured content based on excerpts from the A/B originals rather than generalized commentary. This behavior MUST be consistent across the extension full-window host and the Web host.

#### Scenario: Native output panel shows side-by-side model responses in extension host
- **WHEN** the user is on the extension compare view's "native output" tab and both models begin streaming results
- **THEN** the left column MUST show only Model A output
- **AND** the right column MUST show only Model B output.

### Requirement: Render native model output as Markdown on web
When the native model output is Markdown text, the page MUST render it with Markdown semantics, such as headings, lists, code blocks, and links, rather than displaying it as plain text only. This requirement applies to both the Web host and the extension full-window host.

#### Scenario: Native output includes markdown syntax in extension host
- **WHEN** Model A or Model B in the extension compare view returns output containing Markdown syntax
- **THEN** the native output panel MUST render the Markdown content with the corresponding HTML structure
- **AND** code blocks and inline code MUST preserve readable styling and line breaks.
