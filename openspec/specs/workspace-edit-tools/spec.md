English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Workspace edit tools MUST expose explicit file-editing actions to agents
The system MUST provide explicitly named file-editing tools for knowledge workspace agents, including `replace_text_in_file`, `replace_range_in_file`, `insert_text_in_file`, `delete_range_in_file`, and `write_file`, rather than offering only a single universal editing entry point.

#### Scenario: Resolve declared edit tools for a scoped agent
- **WHEN** `AgentRuntime` resolves the available tool declarations for the current `ResolvedAgentConfig`
- **THEN** the system MUST expose only the file-editing tools declared in that agent's `tools`
- **AND** the model MUST be able to distinguish replacement, insertion, deletion, and whole-file write semantics through explicit tool names

### Requirement: Workspace edit tools MUST apply changes by writing the real file content
The system MUST directly modify the real file content when executing file-editing tools, rather than requiring the model to first generate a patch for confirmation.

#### Scenario: Apply a range or text replacement
- **WHEN** the agent calls `replace_text_in_file`, `replace_range_in_file`, `insert_text_in_file`, or `delete_range_in_file`
- **THEN** the system MUST first read the current file content, then generate the updated text in program logic and write it back to the knowledge file provider
- **AND** the tool result MUST reflect the state after the actual write

#### Scenario: Write a whole file
- **WHEN** the agent calls `write_file`
- **THEN** the system MUST create or overwrite the file contents according to the input mode
- **AND** the system MUST not require an additional patch preview stage before writing to disk

### Requirement: Workspace edit tools MUST record file changes for diff and line-level undo/redo
The system MUST record `beforeContent` and `afterContent` after every successful file edit so the UI can show diffs and support line-level undo/redo.

#### Scenario: Record a file change after an edit tool succeeds
- **WHEN** any file-editing tool successfully writes back a file
- **THEN** the system MUST generate the corresponding `FileChangeRecord`
- **AND** that record MUST include at least the file path, the text before the change, and the text after the change

#### Scenario: Undo or redo a file change
- **WHEN** the user triggers undo or redo for a file in the UI
- **THEN** the system MUST write back `beforeContent` or `afterContent` through the program-side change service
- **AND** `IContextProvider` MUST NOT be required to provide `undo()` or `redo()` methods directly
