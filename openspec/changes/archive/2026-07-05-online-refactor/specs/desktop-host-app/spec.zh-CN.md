[English](spec.md) | 中文

## ADDED Requirements

### Requirement: 桌面 host MUST 在无本地 server 进程下运行
桌面 host SHALL 在没有任何本地 HTTP server 的情况下启动并提供知识工作区、任务视图与会话历史。renderer MUST 从本地打包资产(file 或自定义协议)加载,而非 server origin。

#### Scenario: 无 server、无网络时桌面可启动
- **WHEN** 桌面应用在离线且无本地 server 进程时启动
- **THEN** renderer MUST 正常加载并渲染工作区
- **AND** 本地 knowledge root 下的文档 MUST 可读写
- **AND** 会话与任务 MUST 可从本地副本读写

### Requirement: 桌面 host MUST 经 IPC 交付知识 context provider
桌面 host SHALL 在 main 进程持有文件系统 context provider,并通过实现共享 `IContextProvider` 契约的 IPC 桥暴露给 renderer。`IContextProvider` 的每个方法 MUST 有对应的 IPC 通道。

#### Scenario: 文档操作经 IPC 流转
- **WHEN** renderer 执行目录列举、文档读写、节点增删改名或附件上传
- **THEN** 请求 MUST 经 IPC 桥到达 main 进程的 provider
- **AND** 行为 MUST 与共享知识工作区契约完全一致

### Requirement: 桌面 host MUST 经 main 代理 fetch 访问远程 sync hub
桌面 renderer 的记录同步(会话、任务)SHALL 通过注入为 `fetchImpl` 的 main 进程代理 fetch 执行 HTTP,使非 HTTP renderer origin 下同步可用,且 hub 无需任何 CORS 配置。

#### Scenario: 本地加载的 renderer 同步成功
- **WHEN** renderer 向配置的 hub URL push/pull 记录
- **THEN** HTTP 请求 MUST 由 main 进程代为执行
- **AND** hub MUST NOT 需要为桌面 origin 配置 CORS 放行
