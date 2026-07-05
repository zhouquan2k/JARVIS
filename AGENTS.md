- 请用中文回答, please respond in Chinese.
- 如果当前会话未使用openspec时，需要请遵循下面的方式：（opsx:apply时不需要）
对于对话中的每一个需要修改代码的开发任务，在进行必要调查的前提下，先提供解决问题的原因分析，总体思路和计划。然后给出所需修改的文件和方法signature，以及大概内容的文字描述。在询问用户得到用户对计划的确认前，不能开始修改代码。用户确认后修改代码时，请严格按之前确认的计划进行，不要补充原计划以外的功能。修改完成后，如果涉及需求的变更，需要同步更新openspec的spec/design文档。
- 参考[ARCHITECTURE.zh-CN.md]作为全局设计
- 对于复杂问题、反复失败问题，先做分层定位和可观测性建设（如增加日志，要求提供完整的错误栈），再做修复；对跨进程、跨窗口、外部站点(dom捕获）、时序相关问题，要先拆链路并补关键阶段日志或状态观测点，必要时下载完整的数据用于一次性完整的分析，避免在错误层面反复猜测试错。
- 关于 e2e和验证阶段
  -编码后的自动验证阶段，请按顺序执行以下检查动作：
    - `lint` / 类型 / 编译检查
      示例：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test`
    - 生产构建与打包
      示例：`pnpm build`、`pnpm --filter <pkg> build`
    - `dev` / `watch` 启动验证
      示例：`pnpm dev`、`pnpm --filter <pkg> dev`
    - 服务与依赖探活
      示例：`curl -I http://127.0.0.1:<port>`、`curl http://127.0.0.1:<port>/health`
    - 最小功能回归测试
      示例：`pnpm test -- <spec>`、`pnpm exec playwright test <spec>`
    - 目标范围完整回归测试
      示例：`pnpm test`、`pnpm --filter <pkg> test`、`pnpm exec playwright test`
  - ui/外观相关验证请参考playwright-interactive skill
  - 对于 e2e 测试、UI 闭环验证、浏览器侧交互验证，如使用 `playwright_mcp`，必须确保当前会话暴露的是完整工具集，而不是仅有 `snapshot` / `screenshot` / `tabs` / `resize` 一类只读子集；至少应具备 `click` / `type` / `fill` 等交互能力。若当前会话未暴露完整 `playwright_mcp` 工具集，应优先切换到完整工具集，或改用能够完成真实交互闭环验证的等效方式，而不是基于只读子集继续给出不完整结论。
  - 当任务涉及 e2e、Playwright 失败排查、浏览器侧调试或 flaky 用例修复时，请参考 e2e-debugging skill
  - e2e 是最终验证，原则上不应该使用mock；应尽量覆盖真实运行链路，而不是为了加快测试跳过关键环节。
  - 对关键能力，e2e 不仅要覆盖失败入口，还要覆盖关键恢复路径和最终成功态；如果全自动验证不现实，应补半自动或手动辅助 e2e 来锁定真实链路。
  - e2e 测试需要对关键环节增加截图，并评估截图中的ui是否符合预期
  - e2e 测试需要录制视频，并提供用户评估
  - 在验证阶段用户报告的问题，在解决完后，需要总结故障原因，包括自动测试未能覆盖的原因，是否需要增加测试用例
  - 对于浏览器插件extension的e2e测试用例，因为codex沙盒的限制，请申请提权运行。
  - MV3 扩展测试需要走 channel: 'chromium'，否则 Playwright 默认的 headless shell 拉不起扩展 service worker。
  - extension e2e测试通过后，请运行pnpm --filter extension build
- 高风险模块测试覆盖原则：对于经常出错、依赖外部页面结构（如 DOM 抓取）、或历史上多次产生故障的模块，修复完成后必须评估是否需要新增/补全测试用例。
  - 单元测试：覆盖核心解析逻辑（选择器命中、消息序列化、配置加载优先级），不依赖真实页面；例如 `geminiDomScraper` 的选择器过滤逻辑、`GeminiHistoryConfigLoader` 的 config 优先级。
  - 集成测试：使用 fixture HTML 或录制的 DOM 快照，验证完整抓取链路（展开侧边栏 → 遍历列表 → 提取 id/title），覆盖"侧边栏已展开"和"侧边栏收起（rail 模式）"两种初始状态。
  - 回归锁定：每次修复一个选择器失配或时序 bug，对应补一个能复现该场景的测试用例，防止同类问题静默回归。
- 自主验证原则：代码修复完成后，必须自行通过日志、debug 工具或浏览器 MCP 验证结果，而不是将验证责任转交给用户。
  - 对于有 debug 脚本的场景（如 `pnpm debug:gemini`），在后台运行并读取落盘日志文件（`dist/*.log`）来确认结果，无需等待用户反馈。
  - 对于 Electron/DOM 抓取类任务，利用 `console-message` 事件转发 + 文件日志，使得 Claude 可以在不打开 DevTools 的情况下离线读取关键阶段的日志。
  - 仅在验证结果确实超出工具能力边界（无法通过已有日志/MCP 观察）时，才请求用户手动确认；并提前说明用户需要做什么，而不是说"请重启后告诉我结果"。

