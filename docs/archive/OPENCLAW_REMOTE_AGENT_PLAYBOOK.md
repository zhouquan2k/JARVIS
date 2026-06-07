# OpenClaw 远端 Agent 经验规则

## 1. 推荐架构

- `main` 是用户入口 agent。
- 垂直 agent 只做 worker。
- `main` 负责用户对话，worker 负责垂直执行。
- IM 默认入口保持在 `main`，不要把整个 peer 绑定给 worker。
- cron 只调度 worker，不长期持有用户会话。
- 需要用户确认时，worker 产出状态，由 `main` 继续对话。
- `main` 先判断当前输入是否与前文相关；相关则优先回交前一个相关 worker。
- 不相关则视为新话题；按 worker 职责范围转交，或由 `main` 自己回答。
- `main` 可保留轻上下文辅助路由，例如：最近活跃 worker、最近交付摘要、最近待确认项、`updatedAt`。
- 轻上下文只用于路由判断，不做硬 session 绑定；可按最近 `n` 天或最近 `n` 条保留。
- 若用户回复会改变某 worker 状态，或需要该领域解释，应回委托给原 worker。
- `main` 不直接改 worker 的领域状态；worker 返回可直接转发的结果，由 `main` 转发。
- cron 明确 delivery 目标。
- 状态通过文件传递，不依赖“上一条消息是谁发的”。

## 2. 远端固定信息

- SSH 别名：`ubuntu`
- OpenClaw 根目录：`/home/zhouquan/.openclaw`
- `main` 工作区：`/home/zhouquan/.openclaw/workspace`
- worker 工作区：`/home/zhouquan/.openclaw/workspace-<agent>`
- gateway 服务：`openclaw-gateway.service`
- CLI：`~/.npm-global/bin/openclaw`

## 3. Google 能力要求

- Gmail 读权限：读邮件
- Gmail 发信/修改权限：回邮件
- Calendar 读权限：查重
- Calendar 写权限：创建和修改日程
- 推荐验证命令：
  - `bin/gog-safe gmail messages search '<query>' --json --all --include-body`
  - `bin/gog-safe gmail send --dry-run ...`
  - `bin/gog-safe calendar events primary --from <date> --to <date> --json --results-only --all-pages`
  - `bin/gog-safe calendar create ... --dry-run`

## 4. Worker Agent 实现规则

- Agent 负责整体流程编排，以及复杂模糊的算法，仅把确定性的外部接口委托给 python 脚本。
- Agent 以 CLI 方式调用 python 脚本提供的工具能力。
- Python 脚本适合封装为可复用工具，例如：
  - Gmail 查询
  - Gmail 标记已读 / 标记重要
  - Calendar 查询 / 创建
  - Gmail 过滤器创建
  - 状态文件读写
  - 结果文件落盘
- 确定性的通用能力优先放到共享工具层，例如 `~/.openclaw/shared/bin/...`，不要在某个 worker 私有脚本里重复实现。
- worker 私有脚本应尽量只做 workspace 适配，例如固定路径、状态文件、简报落盘。
- Agent 默认流程应优先调用这些固定工具，而不是把关键判断硬编码进 Python。
- 邮件事项提取、待办判断、是否建议入日历、简报组织等模糊工作应由 agent 完成。
- 不要把少数样本主题硬编码成长期规则，也不要让 cron prompt 代替 agent/脚本产出业务结论。
- cron payload 保持极简。
- cron 只做：
  - 读取 `AGENTS.md`
  - 调用 agent 默认流程
  - 返回完整结果
- cron delivery 必须写死目标，不用 `last`。
- QQ 目标格式使用：
  - `qqbot:c2c:<peer-id>`
- 当前可复用 QQ direct peer id：
  - `qqbot:c2c:fb2e3ad71085593b8c044e05ae3f66cf`
- `AGENTS.md` 只保留：
  - 职责
  - 默认流程
  - 允许的命令
  - 状态文件
  - 输出结构
- 日志分两层：
  - 人读摘要
  - 结构化诊断
- 结构化诊断至少记录：
  - 查询条件
  - 命中对象
  - 跳过原因
  - 输出摘要
