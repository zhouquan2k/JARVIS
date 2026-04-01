- 请用中文回答
- 如果当前会话未使用openspec时，需要请遵循下面的方式：（opsx:apply时不需要）
对于对话中的每一个需要修改代码的开发任务，在进行必要调查的前提下，先提供解决问题的思路和计划。这个计划应包含所需修改的文件和方法signature，以及大概内容的文字描述。在询问用户得到用户对计划的确认前，不能开始修改代码。用户确认后修改代码时，请严格按之前确认的计划进行，不要补充原计划以外的功能。
- 对于复杂问题、反复失败问题，先做分层定位和可观测性建设，再做修复；对跨进程、跨窗口、外部站点、时序相关问题，要先拆链路并补关键阶段日志或状态观测点，避免在错误层面反复试错。
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
  - e2e 是最终验证，原则上不使用 mock；应尽量覆盖真实运行链路，而不是为了加快测试跳过关键环节。
  - 对关键能力，e2e 不仅要覆盖失败入口，还要覆盖关键恢复路径和最终成功态；如果全自动验证不现实，应补半自动或手动辅助 e2e 来锁定真实链路。
  - 在验证阶段用户报告的问题，在解决完后，需要总结故障原因，包括自动测试未能覆盖的原因，是否需要增加测试用例
  - 对于浏览器插件extension的e2e测试用例，因为codex沙盒的限制，请申请提权运行。
  - MV3 扩展测试需要走 channel: 'chromium'，否则 Playwright 默认的 headless shell 拉不起扩展 service worker。
  - extension e2e测试通过后，请运行pnpm --filter extension build
  - 当任务涉及 e2e、Playwright 失败排查、浏览器侧调试或 flaky 用例修复时，请参考 [`.codex/skills/e2e-debugging/SKILL.md`](/Users/quanzhou/Workspace/ChatPrism/.codex/skills/e2e-debugging/SKILL.md)。
