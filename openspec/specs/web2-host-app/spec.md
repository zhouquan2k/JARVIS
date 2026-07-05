# web2-host-app Specification

## Purpose
TBD - created by archiving change app-web2. Update Purpose after archive.
## Requirements
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

### Requirement: web2 MUST provide an offline application shell
web2 SHALL register a service worker that precaches the application shell (index and hashed assets) so the page opens without network connectivity, enabling offline use of IndexedDB-backed conversations and tasks.

#### Scenario: Open web2 offline after one online visit
- **WHEN** the user opens web2 while offline, having loaded it online at least once before
- **THEN** the application shell MUST load from the service worker cache
- **AND** conversations and tasks MUST be readable from local replicas

### Requirement: web2 MUST cache recently viewed documents read-only
web2 SHALL keep a read-only runtime cache of recently viewed document reads. Cached documents MUST be served when the hub is unreachable, and the cache MUST be treated as a projection: eviction is acceptable and truth stays on the hub.

#### Scenario: Re-read a recently viewed document offline
- **WHEN** the user opens a document offline that was viewed recently while online
- **THEN** the document content MUST render from the cache
- **AND** editing MUST be unavailable or clearly deferred until connectivity returns

### Requirement: web2 MUST provide PWA manifest metadata
web2 SHALL provide a web app manifest (name, icons, display mode) so mobile browsers in secure-context deployments can offer add-to-home-screen and support future standalone launches.

#### Scenario: Browser reads manifest metadata
- **WHEN** the user opens web2 online
- **THEN** the page MUST expose the manifest name, icons, and `display=standalone` metadata
