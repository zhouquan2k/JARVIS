[English](spec.md) | 中文

## ADDED Requirements

### Requirement: web2 MUST 提供离线应用壳
web2 SHALL 注册 service worker 预缓存应用壳(index 与哈希资产),使页面在无网络时可打开,从而解锁 IndexedDB 中会话与任务的离线使用。

#### Scenario: 在线访问过一次后离线打开 web2
- **WHEN** 用户曾在线加载过 web2,此后在离线状态下打开
- **THEN** 应用壳 MUST 从 service worker 缓存加载
- **AND** 会话与任务 MUST 可从本地副本读取

### Requirement: web2 MUST 只读缓存最近浏览的文档
web2 SHALL 对最近浏览的文档读取维护只读运行时缓存。hub 不可达时 MUST 以缓存提供文档,且缓存 MUST 被视为投影:可被驱逐,真身在 hub。

#### Scenario: 离线重读最近看过的文档
- **WHEN** 用户离线打开一篇最近在线浏览过的文档
- **THEN** 文档内容 MUST 从缓存渲染
- **AND** 编辑 MUST 不可用或明确延迟到联网后

### Requirement: web2 MUST 提供 PWA manifest 元数据
web2 SHALL 提供 web app manifest(名称、图标、显示模式),使具备 secure-context 部署条件的移动浏览器可提供"添加到主屏幕"并支持后续 standalone 运行。

#### Scenario: 浏览器读取 manifest 元数据
- **WHEN** 用户在线访问 web2
- **THEN** 页面 MUST 暴露 manifest 所需的名称、图标与 `display=standalone` 元数据
