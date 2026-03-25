- 请用中文回答
- 如果当前会话未使用openspec时，需要请遵循下面的方式：（opsx:apply时不需要）
对于对话中的每一个需要修改代码的开发任务，在进行必要调查的前提下，先提供解决问题的思路和计划。这个计划应包含所需修改的文件和方法signature，以及大概内容的文字描述。在询问用户得到用户对计划的确认前，不能开始修改代码。用户确认后修改代码时，请严格按之前确认的计划进行，不要补充原计划以外的功能。
- 对于浏览器插件extension的e2e测试用例，因为codex沙盒的限制，请申请提权运行。
注意：
  - MV3 扩展测试需要走 channel: 'chromium'，否则 Playwright 默认的 headless shell 拉不起扩展 service worker。
  - extension e2e测试通过后，请运行pnpm --filter extension build
