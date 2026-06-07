> **Language**: English | [中文](spec.zh-CN.md)

## MODIFIED Requirements

### Requirement: Knowledge workspace MUST provide a Markdown link insertion UI for existing Agent-scope documents
The knowledge workspace Markdown editor MUST let users insert links to existing Markdown documents through a UI chooser instead of requiring manual Markdown syntax entry. The chooser MUST reuse the current Agent-scope Markdown document collection, and inserted links MUST target the chosen document with a relative Markdown path. In rendered viewer mode, insertion MUST apply at the user's live selection (or caret) and MUST preserve the viewport, without switching to raw-source edit mode.

#### Scenario: Insert a link from the editor toolbar chooser
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **AND** the current Agent scope contains at least one other Markdown document
- **THEN** the editor MUST offer a link insertion UI entry
- **AND** choosing a target document MUST insert Markdown link syntax for that document at the current selection or caret

#### Scenario: Wrap the current selection when inserting a chosen link
- **WHEN** the user has selected text in the Markdown editor
- **AND** the user chooses an existing Markdown document from the link insertion UI
- **THEN** the editor MUST preserve the selected text as the link label
- **AND** the inserted href MUST point to the chosen document using a relative path from the active document

#### Scenario: Exclude the active document from link choices
- **WHEN** the link insertion UI lists candidate Markdown documents
- **THEN** the active document being edited MUST NOT appear as a selectable target

#### Scenario: Preserve the viewport and apply at the live selection in viewer mode
- **WHEN** the rendered Markdown viewer is scrolled away from the top and the user has a live selection
- **AND** the user chooses a target document from the link insertion UI
- **THEN** the link MUST be applied over that live selection in place
- **AND** the viewer's scroll position MUST remain unchanged
- **AND** the editor MUST NOT switch to raw-source edit mode to perform the insertion

### Requirement: Knowledge workspace MUST provide a Markdown style insertion UI for selected text
The knowledge workspace Markdown editor MUST expose a toolbar style insertion UI for authored Markdown text transformations so users do not need to type formatting markers manually. The style UI MAY offer multiple actions over time; initially it MUST provide a highlight action that applies highlight to the current selection. In rendered viewer mode, applying a style MUST act on the user's live selection in place and MUST preserve the viewport, without switching to raw-source edit mode; the serialized Markdown MUST still use the `==...==` form.

#### Scenario: Insert highlight markup from the editor toolbar
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **THEN** the editor MUST expose a Markdown style insertion UI entry in the toolbar
- **AND** choosing the highlight action MUST apply highlight at the current caret or selection

#### Scenario: Apply highlight to the current selection
- **WHEN** the user has selected text in the Markdown editor
- **AND** the user chooses the highlight action from the Markdown style insertion UI
- **THEN** the editor MUST preserve the selected text
- **AND** the serialized Markdown for that text MUST be wrapped with `==` markers

#### Scenario: Prepare an empty highlight insertion for continued typing
- **WHEN** the user has no selected text in the Markdown editor
- **AND** the user chooses the highlight action from the Markdown style insertion UI
- **THEN** the editor MUST prepare an empty highlight so that text typed next is highlighted
- **AND** in raw-source mode the caret MUST land between the inserted `==` markers

#### Scenario: Render Obsidian-compatible highlight markup as visible highlight styling
- **WHEN** a Markdown document contains inline text wrapped with `==` markers
- **THEN** the Markdown viewer/editor rendering pipeline MUST parse that range as highlight content
- **AND** the rendered output MUST present the wrapped text with visible highlight styling
- **AND** serializing the rendered document back to Markdown MUST preserve the `==...==` form

#### Scenario: Preserve the viewport when applying highlight in viewer mode
- **WHEN** the rendered Markdown viewer is scrolled away from the top
- **AND** the user applies the highlight action to a live selection
- **THEN** the highlight MUST be applied in place over that selection
- **AND** the viewer's scroll position MUST remain unchanged
- **AND** the editor MUST NOT switch to raw-source edit mode to perform the action
