English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Desktop host MUST operate without a local server process
The desktop host SHALL start and provide the knowledge workspace, task views, and conversation history without any locally running HTTP server. The renderer MUST load from a locally bundled asset (file or custom protocol), not from a server origin.

#### Scenario: Desktop starts with no server and no network
- **WHEN** the desktop app launches while offline and no local server process exists
- **THEN** the renderer MUST load and render the workspace
- **AND** documents under the local knowledge root MUST be readable and writable
- **AND** conversations and tasks MUST be readable and writable from local replicas

### Requirement: Desktop host MUST deliver the knowledge context provider over IPC
The desktop host SHALL host the filesystem context provider in the main process and expose it to the renderer through an IPC bridge implementing the shared `IContextProvider` contract. Every `IContextProvider` method MUST have a corresponding IPC channel.

#### Scenario: Document operations flow through IPC
- **WHEN** the renderer performs directory listing, document read/write, node create/delete/rename, or attachment upload
- **THEN** the request MUST travel over the IPC bridge to the main-process provider
- **AND** behavior MUST match the shared knowledge workspace contract exactly

### Requirement: Desktop host MUST reach the remote sync hub via main-proxied fetch
Record sync (conversations, tasks) from the desktop renderer SHALL execute HTTP through a main-process-proxied fetch injected as `fetchImpl`, so that sync works from a non-HTTP renderer origin without CORS configuration on the hub.

#### Scenario: Sync succeeds from a locally loaded renderer
- **WHEN** the renderer pushes or pulls records against the configured hub URL
- **THEN** the HTTP request MUST be executed by the main process on the renderer's behalf
- **AND** the hub MUST NOT require CORS allowances for desktop origins
