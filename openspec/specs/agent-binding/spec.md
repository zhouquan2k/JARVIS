English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Agent binding MUST use `.agent.json` as the scoped configuration source
The system MUST use the hidden `.agent.json` file as the sole configuration carrier for directory-scoped agents. That file MUST support declaring the agent name, responsibility description, core instructions, target model provider, target model name, tool list, skill list, inheritance strategy, and optional `linkDir` field so that knowledge directories can capture agent identity and capabilities as config-as-code.

#### Scenario: Read agent identity and capabilities from `.agent.json`
- **WHEN** a valid `.agent.json` exists in a directory
- **THEN** the system MUST be able to parse the agent's `name`, `instructions`, `modelProviderName`, `modelName`, `tools`, `skills`, and `inheritance`
- **AND** if that configuration also declares `linkDir`, the system MUST continue parsing it as a string path
- **AND** these settings MUST be stored together with the knowledge directory content on the local file system

#### Scenario: Accept mount declarations only from empty top-level directories
- **WHEN** the `.agent.json` of an empty directory at the root declares `linkDir`
- **THEN** the system MUST treat that directory as a valid mount-entry candidate
- **AND** if the same directory contains any other visible files or subdirectories, the system MUST treat it as an invalid mount declaration

#### Scenario: Reject malformed mount declarations in `.agent.json`
- **WHEN** `linkDir` in `.agent.json` is not a non-empty string
- **THEN** the system MUST produce a diagnosable agent configuration error
- **AND** the caller MUST be able to distinguish among "config not found", "config file invalid", and "mount declaration invalid"

#### Scenario: Resolve the mount target relative to the declaring directory
- **WHEN** `linkDir` declares a mount target using a relative path
- **THEN** the system MUST resolve the target path relative to the declaring directory
- **AND** the resolved path MUST continue through existence and directory-type validation

### Requirement: Agent binding MUST resolve the effective agent using nearest-parent scope lookup
The system MUST start from the directory of the currently active file or the active directory itself, search upward through the directory tree for the nearest `.agent.json`, and resolve the active agent for the current scope accordingly. If the current level does not match, the system MUST continue searching parent directories until the root or until an `override` configuration is found. For top-level directories mounted through `linkDir`, the system MUST continue nearest-parent lookup using the mounted virtual path rather than falling back to the physical path of the original source directory.

#### Scenario: Resolve the nearest scoped agent for an active file
- **WHEN** the user activates `/workspace/project/docs/guide.md`
- **THEN** the system MUST start searching from `/workspace/project/docs/.agent.json`
- **AND** if that level does not match, it MUST continue searching `/workspace/project/.agent.json` and higher parent directories one by one

#### Scenario: Resolve agents inside a mounted top-level directory by virtual path
- **WHEN** the user activates the top-level directory `/reports` mounted via `linkDir`
- **THEN** the system MUST first resolve the agent using `/reports/.agent.json` as the current scope root
- **AND** later nearest-parent lookups for subdirectories MUST continue along the `/reports/...` virtual path

### Requirement: Agent binding MUST support phase-one nearest-parent resolution with explicit override and fallback
In this phase, the system MUST treat nearest-parent matches as the primary semantics and support explicit `override` truncation; `merge` is out of scope for this round. If the current level matches a valid configuration, the system MUST use that level's configuration as the final active agent for the current phase, or immediately stop searching upward when `override` is specified. For `linkDir` mount declarations, the system MUST surface errors explicitly on resolution failure rather than silently falling back to another directory or the default agent.

#### Scenario: Use the nearest valid scoped agent without merge
- **WHEN** the directory containing the current active node matches a valid `.agent.json`
- **THEN** the system MUST use that directory's configuration directly as the final active agent for this phase
- **AND** the system MUST NOT require parent-child `merge` support

#### Scenario: Stop lookup on override
- **WHEN** a certain level's `.agent.json` sets `inheritance` to `override`
- **THEN** the system MUST use the current level's configuration as the final active agent
- **AND** the system MUST NOT continue searching or merging configurations from higher-level directories

#### Scenario: Surface mount declaration failures explicitly
- **WHEN** `linkDir` points to a non-existent directory, a regular file, or an invalid path
- **THEN** the system MUST produce a clear error
- **AND** the system MUST NOT silently downgrade that directory to a normal empty directory

### Requirement: Agent binding MUST provide a deterministic fallback and explicit config errors
When no `.agent.json` exists anywhere in the directory tree, the system MUST provide a predictable global default agent as a fallback; when the matched `.agent.json` is invalid or cannot be parsed, the system MUST surface that error explicitly rather than silently reverting to a random state.

#### Scenario: Fall back to the default agent when no scoped config exists
- **WHEN** no `.agent.json` exists for the current active path or any of its parent directories
- **THEN** the system MUST return a default agent with basic read/write capabilities and general instructions
- **AND** the default agent MUST still include stable name and scope information

#### Scenario: Surface invalid scoped agent configuration
- **WHEN** the matched `.agent.json` is not valid JSON or is missing required fields
- **THEN** the system MUST produce a diagnosable agent configuration error
- **AND** the caller MUST be able to distinguish between "config not found" and "config file invalid"
