## Why

当前 Gemini 原生 Agent 已经具备基础 tool loop 骨架，但知识工作区中的读取工具、修订工具、作用域搜索和文件变更回滚仍然没有形成稳定的能力边界。继续推进这一层可以让 Agent 真正从“会声明工具”变成“能在当前知识工作区中可靠读取、搜索、修订文件并向 UI 暴露变更”。

## What Changes

- 在现有 `agent-runtime-adapter` 能力基础上扩展统一的工具声明解析与工具执行接入，而不是新增一套并行的 runtime capability
- 为知识工作区引入第一批内置工具：`read_current_file`、`list_directory`、`read_file`、`search_in_scope`
- 扩展知识文件 Provider 契约，新增 `searchInScope`，让文件类工具直接复用 `IContextProvider`
- 在原生 Agent 请求中传递运行时已解析的工具声明，让 Gemini Provider 只负责 function declarations 与流式协议映射
- 引入面向大模型更友好的文件修订工具：`replace_text_in_file`、`replace_range_in_file`、`insert_text_in_file`、`delete_range_in_file`、`write_file`
- 增加程序侧 `FileChangeService`，负责记录 `beforeContent` / `afterContent`、为 UI 提供 diff 基础，并支持行级 undo/redo
- 知识工作区右侧 Agent Pane 与聊天发送链路继续透传当前激活文件、当前文件内容与 `contextProvider`，让工具执行、当前文件主上下文注入与文件修订在当前 scope 中工作
- 将当前文件内容注入模型请求定义为程序侧上下文增强职责，而不是要求默认 Agent instruction 自描述“程序会自动注入文件”

## Capabilities

### New Capabilities
- `workspace-read-tools`: 定义知识工作区的只读工具，包括当前文件读取、目录列举、指定文件读取和作用域搜索
- `workspace-edit-tools`: 定义知识工作区的文件修订工具，包括局部编辑、整文件写入以及面向 UI 的文件变更记录与行级 undo/redo 基础能力

### Modified Capabilities
- `core-interfaces`: 扩展 Agent 相关请求契约与知识文件 Provider 契约，使其能表达工具声明、搜索接口和工作区上下文
- `agent-runtime-adapter`: 让 `AgentRuntime` 接入共享工具执行层，并在 tool loop 中执行真实工具而不是返回未实现占位结果
- `knowledge-context-provider`: 增加 `searchInScope`，使知识文件 Provider 能支持作用域搜索
- `knowledge-workspace`: 让工作区右栏与文件修订链路能够感知当前工作区上下文，并为 UI diff 与行级 undo/redo 提供基础
- `gemini-api-provider`: 让 Gemini 原生 Agent 请求消费运行时已解析的工具声明，而不是直接从 `agent.tools` 推导

## Impact

- 影响 `packages/core` 的接口层、运行时层、Gemini Provider 与新的 workspace tools 模块
- 影响 `packages/ui` 的聊天 store、知识工作区 pane 与文件变更展示/撤销链路
- 影响 Web、Desktop、Extension 的 `IContextProvider` 实现，因为都需要补充 `searchInScope`
- 影响 Agent prompt/context 组装语义：从单纯 prompt envelope 扩展为包含当前文件上下文的请求增强
- 不引入 MCP、联网搜索、补丁预览式审批流，也不要求 LLM 生成 diff 或变更记录
