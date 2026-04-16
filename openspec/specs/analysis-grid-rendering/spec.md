English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Render analysis result with a symmetric 3x2 grid layout
The deep analysis panel MUST render a symmetric 3-row, 2-column grid using a "summary-detail-detail" layout: the first row spans both columns for `agreements`, the second row shows `conflictsA` / `conflictsB`, and the third row shows `uniqueA` / `uniqueB`. Cell content MUST primarily quote the original answers verbatim rather than provide evaluative commentary.

#### Scenario: Final analysis result maps to fixed grid positions
- **WHEN** the analysis result contains five structured fields
- **THEN** the system MUST render `agreements` as a first-row full-width block
- **AND** the system MUST render `conflictsA`, `conflictsB`, `uniqueA`, and `uniqueB` into predefined left-right symmetric positions, while preserving the original wording in the displayed text.

### Requirement: Support progressive rendering during analysis streaming
While the analysis stream is in progress, the UI MUST provide progressive rendering capabilities, such as buffered stream parsing or a skeleton state, to avoid a blank panel before the final JSON is available.

#### Scenario: Analysis tab receives streaming content before final parse
- **WHEN** the analysis tab has received the first stream data but has not yet formed a complete JSON payload
- **THEN** the system MUST show a perceptible in-progress state
- **AND** once parsing completes, it MUST smoothly replace the content with the structured grid.

### Requirement: Provide failure-safe analysis panel fallback
When analysis result parsing fails, the deep analysis panel MUST present a clear error state and avoid breaking the availability of the native output panel.

#### Scenario: Analysis parsing fails
- **WHEN** the analysis engine returns a parsing error
- **THEN** the system MUST show an error message and either a retry entry or fallback guidance in the deep analysis panel
- **AND** the user MUST still be able to switch back to the "native output" tab to view the original A/B text.
