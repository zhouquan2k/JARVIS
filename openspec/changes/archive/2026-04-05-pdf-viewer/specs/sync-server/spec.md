## MODIFIED Requirements

### Requirement: Sync server MUST expose context HTTP endpoints that preserve IContextProvider semantics
服务端 MUST 在现有应用内提供 `/api/context` 能力，并将 `IContextProvider` 的 `initializeAccess`、`listTree`、`readDocument`、`writeDocument`、`createNode`、`deleteNode` 与 `renameNode` 语义通过 HTTP 端点暴露给 browser 端。该 contract MUST 优先保证与共享接口命名一致，而不是重建另一套资源型 REST 语义。

#### Scenario: Initialize remote context access
- **WHEN** Web 宿主首次进入知识工作区并调用远端 context provider
- **THEN** 服务端 MUST 处理 `/api/context/initialize-access`
- **AND** 该响应 MUST 足以让 browser 端继续执行后续目录树和文档请求

#### Scenario: Read write and manage nodes through endpoint methods
- **WHEN** browser 端请求目录树、文档读取、文档写入、节点创建、节点删除或节点重命名
- **THEN** 服务端 MUST 通过 `/api/context` 下与 `listTree`、`readDocument`、`writeDocument`、`createNode`、`deleteNode`、`renameNode` 对应的 endpoint 处理这些请求
- **AND** `readDocument` 的结果 MUST 至少包含 `path`、`mimeType` 与 `dataBase64`
- **AND** `writeDocument` MUST 接受与共享 `WriteContextDocumentInput` 一致的输入语义

#### Scenario: Serve PDF through the same readDocument endpoint
- **WHEN** browser 端请求读取一个 PDF 文档
- **THEN** 服务端 MUST 继续通过 `readDocument` 返回该文档
- **AND** 服务端 MUST NOT 额外要求 browser 端调用独立的 `readBinaryDocument` endpoint
