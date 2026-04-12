English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Provider remote config MUST expose a versioned Gemini history selector document
系统 MUST 提供面向 Gemini 历史抓取的远程配置文档，并以可版本化 JSON 契约分发，使扩展端能够在不重新发布的情况下更新选择器规则。

#### Scenario: Fetch latest Gemini history config
- **WHEN** 扩展端请求 Gemini 历史远程配置
- **THEN** 服务端 MUST 返回一个包含 `version`、`matchOrigins`、`selectors` 和 `healthCheck` 的 JSON 文档
- **AND** 该文档 MUST 足以驱动 Gemini 历史列表、详情与懒加载检测

#### Scenario: Reject unknown provider config request
- **WHEN** 客户端请求不存在的 provider 远程配置
- **THEN** 服务端 MUST 返回明确的未找到响应
- **AND** 系统 MUST NOT 返回伪造的空配置

### Requirement: Provider remote config consumer MUST cache the last valid config and support fallback
系统 MUST 在扩展端缓存最近一次通过健康检查的 Gemini 远程配置，并在网络失败时回退到缓存或内置快照。

#### Scenario: Use cached config when network is unavailable
- **WHEN** 扩展端刷新 Gemini 远程配置时遇到网络错误，但本地存在最近一次有效缓存
- **THEN** 系统 MUST 继续使用该缓存配置完成本次抓取
- **AND** 系统 MUST 标记本次运行来自缓存回退而不是最新拉取

#### Scenario: Fail when no valid config exists
- **WHEN** 远程拉取失败且本地缓存与内置回退快照都不可用
- **THEN** 系统 MUST 返回 `CONFIG_UNAVAILABLE`
- **AND** 系统 MUST 阻止 Gemini DOM 抓取继续执行
