## ADDED Requirements

### Requirement: Web2 host app MUST keep app-layer workspace dependencies limited to core and ui
The `apps/web2` host MUST keep its direct workspace-package imports limited to `@packages/core` and `@packages/ui`. The app layer MUST NOT import `@packages/plugin-system`, `plugins/*`, or task-specific host composition modules directly.

#### Scenario: App-layer imports remain within the target dependency boundary
- **WHEN** `apps/web2` source files are analyzed for direct workspace-package imports
- **THEN** the app MUST import workspace packages only from `@packages/core` and `@packages/ui`
- **AND** the app MUST NOT import `@packages/plugin-system`
- **AND** the app MUST NOT import any path under `plugins/*`

### Requirement: Web2 host app MUST bootstrap shared workspace runtime through ui-owned surfaces
The `apps/web2` host MUST initialize builtin workspace runtime through `packages/ui` exports rather than host-local plugin assembly. The shared bootstrap surface MUST accept host facts and runtime options and MUST return the contribution query and runtime context required by `WorkspaceHostApp`.

#### Scenario: Web2 host boots through a ui bootstrap surface
- **WHEN** `apps/web2` starts and mounts its root app
- **THEN** the app MUST call a `packages/ui` bootstrap entry to initialize builtin workspace runtime
- **AND** the root app MUST render the shared workspace host shell using the returned contribution query and runtime context

### Requirement: Web2 host app MUST support the normal web workspace flow without default task composition
The `apps/web2` host MUST boot the knowledge workspace and the chat-related host surfaces required for normal web operation, while defaulting to a host composition that excludes task-specific app logic and task workspace entrypoints.

#### Scenario: Web2 host starts with knowledge and chat surfaces but no task entry
- **WHEN** the user opens the default `apps/web2` runtime
- **THEN** the host MUST allow navigation into the knowledge workspace
- **AND** the host MUST expose the chat-related workspace surfaces needed for normal web use
- **AND** the default top-level workspace options MUST NOT include a task workspace entry

### Requirement: Shared bootstrap extraction for web2 MUST preserve legacy web host availability
Any shared bootstrap or helper extracted into `packages/ui` or `packages/core` for `apps/web2` MUST preserve the ability of the existing `apps/web` host to start, build, and render its current runtime surface.

#### Scenario: Legacy web host remains available after shared bootstrap extraction
- **WHEN** `apps/web2` is introduced and shared bootstrap logic is moved out of `apps/web`
- **THEN** the existing `apps/web` host MUST still complete its supported typecheck and build steps
- **AND** the existing `apps/web` host MUST still render its workspace shell without losing its current runtime surface
