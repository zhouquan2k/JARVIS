## MODIFIED Requirements

### Requirement: Sync server MUST expose context HTTP endpoints that preserve IContextProvider semantics
服务端 MUST 在现有应用内提供 `/api/context` 能力，并将 `IContextProvider` 的 `initializeAccess`、`listTree`、`readDocument`、`writeDocument` 与 `createNode` 语义通过 HTTP 端点暴露给 browser 端。该 contract MUST 优先保证与共享接口命名一致，而不是重建另一套资源型 REST 语义。

#### Scenario: Initialize remote context access
- **WHEN** Web 宿主首次进入知识工作区并调用远端 context provider
- **THEN** 服务端 MUST 处理 `/api/context/initialize-access`
- **AND** 该响应 MUST 足以让 browser 端继续执行后续目录树和文档请求

#### Scenario: Read and write context data through endpoint methods
- **WHEN** browser 端请求目录树、文档读取、文档写入或节点创建
- **THEN** 服务端 MUST 通过 `/api/context` 下与 `listTree`、`readDocument`、`writeDocument`、`createNode` 对应的 endpoint 处理这些请求
- **AND** 这些 endpoint 的输入输出语义 MUST 与共享 `IContextProvider` 契约保持一致

### Requirement: Sync server MUST keep backend implementation swappable behind the same context contract
服务端 MUST 允许 `/api/context` 背后的具体实现从临时本地文件后端演进到数据库后端，而不要求 browser 端修改调用契约。

#### Scenario: Serve context data from a local file backend
- **WHEN** 服务端当前使用 `LocalFileContextProvider`
- **THEN** 服务端 MAY 从 `CHATPRISM_KNOWLEDGE_ROOT` 指定的根路径读取和写入上下文数据
- **AND** 所有访问 MUST 被约束在该 provider 定义的边界内

#### Scenario: Replace the backend without changing browser contract
- **WHEN** 服务端将 `/api/context` 的底层实现从 `LocalFileContextProvider` 切换为 `DatabaseContextProvider`
- **THEN** browser 端调用的 endpoint 路径和请求语义 MUST 保持不变
- **AND** 不同用户的 context 映射 MAY 在新的 provider 内部实现
