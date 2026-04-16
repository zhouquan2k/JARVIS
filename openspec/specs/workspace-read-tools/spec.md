English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Workspace read tools MUST expose scoped file-reading capabilities to agents
The system MUST provide the first set of read-only tools for knowledge workspace agents, including `read_current_file`, `list_directory`, `read_file`, and `search_in_scope`, and those tools MUST only be exposed to the model after the current agent explicitly declares them.

#### Scenario: Resolve declared read tools for a scoped agent
- **WHEN** `AgentRuntime` resolves the available tool declarations for the current `ResolvedAgentConfig`
- **THEN** the system MUST expose only the read-only tools declared in that agent's `tools`
- **AND** each tool declaration MUST include at least a stable tool name, description, and input schema

### Requirement: Workspace read tools MUST support reading the current file and arbitrary files
The system MUST allow agents to read the current active file and the contents of any specified file in the knowledge workspace to support scoped Q&A, document summarization, and context analysis before later edits.

#### Scenario: Read the current active file
- **WHEN** the agent calls `read_current_file`
- **THEN** the system MUST read the corresponding file contents using the current workspace `activePath`
- **AND** if there is no active file, the system MUST return a clear error rather than failing silently

#### Scenario: Read a file by explicit path
- **WHEN** the agent calls `read_file` and provides a target path
- **THEN** the system MUST read the corresponding document through the knowledge file provider
- **AND** the result MUST include at least the file path and text content

### Requirement: Workspace read tools MUST support directory listing and scope search
The system MUST allow agents to inspect child nodes under a directory and search file contents within the current agent scope to support discovery, location, and citation in the knowledge workspace.

#### Scenario: List a directory
- **WHEN** the agent calls `list_directory` and provides a directory path
- **THEN** the system MUST return the set of file and directory nodes under that directory
- **AND** each node MUST include at least the path, name, and node type

#### Scenario: Search within the current agent scope
- **WHEN** the agent calls `search_in_scope` and provides a query string
- **THEN** the system MUST constrain the search scope based on the current `agent.scopePath`
- **AND** the result MUST include at least the matching file path, line and column position, and preview text
