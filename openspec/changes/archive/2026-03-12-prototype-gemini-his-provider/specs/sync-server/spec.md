## ADDED Requirements

### Requirement: Sync server MUST expose provider remote config endpoints
系统 MUST 在现有服务端应用中同时提供 provider 远程配置分发接口，以便扩展端拉取 Gemini 历史选择器配置。

#### Scenario: Fetch Gemini provider config from server
- **WHEN** 客户端请求 Gemini 历史远程配置接口
- **THEN** 服务端 MUST 返回最新版本的 Gemini 配置 JSON
- **AND** 响应 MUST 包含适合客户端缓存与版本判定的元信息

#### Scenario: Unknown provider config returns not found
- **WHEN** 客户端请求不存在的 provider 配置
- **THEN** 服务端 MUST 返回 `404`
- **AND** 服务端 MUST NOT 返回空白成功响应
