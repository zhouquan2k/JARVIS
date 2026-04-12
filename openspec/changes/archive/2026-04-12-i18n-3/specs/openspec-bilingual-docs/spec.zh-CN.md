[English](spec.md) | 中文

## 新增需求

### 需求：正式 OpenSpec spec SHALL 有中文镜像文件
正式 `openspec/specs/**` 文档 SHALL 保留英文主文件 `spec.md`，并为每个正式 spec 提供同目录中文镜像 `spec.zh-CN.md`。

#### 场景：正式 spec 具有中文镜像
- **WHEN** 仓库存在 `openspec/specs/<capability>/spec.md`
- **THEN** 同目录 MUST 存在 `spec.zh-CN.md`
- **AND** 两个文件 MUST 表达相同能力要求

### 需求：活跃 OpenSpec change SHALL 使用成对的双语工件文件
活跃 `openspec/changes/<name>/**` 文档 SHALL 使用英文主文件与中文镜像文件成对组织，适用于 `proposal`、`design`、`tasks` 和 change-local specs。

#### 场景：活跃 change proposal 有中文镜像
- **WHEN** 活跃 change 包含 `proposal.md`
- **THEN** 同目录 MUST 提供 `proposal.zh-CN.md`

#### 场景：活跃 change specs 有中文镜像
- **WHEN** 活跃 change 包含 `specs/<capability>/spec.md`
- **THEN** 同目录 MUST 提供 `spec.zh-CN.md`

### 需求：双语 OpenSpec 文件 SHALL 提供互相链接
OpenSpec 英文主文件与中文镜像文件 SHALL 在文件顶部提供 `English | 中文` 双向互链，以便读者在语言版本之间切换。

#### 场景：读者打开英文 OpenSpec 文档
- **WHEN** 读者打开英文主文件
- **THEN** 文件顶部 MUST 提供到中文镜像文件的链接

#### 场景：读者打开中文 OpenSpec 镜像
- **WHEN** 读者打开中文镜像文件
- **THEN** 文件顶部 MUST 提供返回英文主文件的链接

### 需求：归档的 OpenSpec change SHALL 被排除
`openspec/changes/archive/**` SHALL 不纳入 Phase 3 的翻译与双语镜像要求，避免改写历史归档内容。

#### 场景：归档 change 缺少中文镜像
- **WHEN** archive 中的旧 change 没有 `.zh-CN.md` 镜像
- **THEN** Phase 3 MUST NOT 要求为该归档 change 补齐镜像文件

### 需求：双语 OpenSpec 术语 SHALL 遵循仓库术语表
OpenSpec 中文镜像文件 SHALL 遵循仓库级术语表，核心术语的中英文对应 MUST 与 Phase 1 建立的术语基线一致。

#### 场景：中文 spec 使用核心术语
- **WHEN** 中文镜像描述 Agent、Workspace、Provider、Context 或 Sync 等核心概念
- **THEN** 对应术语 MUST 与仓库级术语表保持一致
