English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

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
