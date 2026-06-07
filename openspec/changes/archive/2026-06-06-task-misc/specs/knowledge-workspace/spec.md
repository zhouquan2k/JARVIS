## ADDED Requirements

### Requirement: Knowledge workspace MUST provide a workspace-owned node navigation bridge with panel restoration
The knowledge workspace MUST provide a higher-level navigation bridge that can reopen a workspace node together with workspace-owned panel restoration state. This bridge MUST own route restoration to the knowledge workspace and MUST support optional task-related `tab` and `detailKey` payloads without giving route-switching semantics to the lower-level document workspace store.

#### Scenario: Reopen a workspace node with task panel restoration
- **WHEN** a caller requests knowledge-workspace navigation for a target workspace path together with task-related `tab` and `detailKey`
- **THEN** the system MUST restore the knowledge-workspace route before opening that node
- **AND** it MUST make the requested `tab` and `detailKey` available to the destination workspace state

#### Scenario: Keep lower-level node opening free of route-switching semantics
- **WHEN** the document workspace store opens a node internally
- **THEN** that lower-level node-opening operation MUST continue to work without owning route switching
- **AND** the higher-level knowledge-workspace navigation bridge MUST remain responsible for route restoration
