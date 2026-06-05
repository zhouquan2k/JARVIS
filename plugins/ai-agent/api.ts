export type { ProviderModelCatalog } from '@packages/core/config';

// 领域契约（会话 / Agent / 模型 provider / 同步）
export * from './src/interfaces';

// Agent 配置解析
export {
    DEFAULT_SCOPED_AGENT_CONFIG,
    createResolvedAgentConfig,
    resolveChildAgentConfig
} from './src/runtime/agents/config/resolveScopedAgentConfig';

// 模型 provider 运行时
export { createModelProviderRuntime } from './src/runtime/createModelProviderRuntime';
export * from './src/runtime/modelProviderRuntime.types';

// 具体模型 provider 与历史 / 同步 / 存储实现
export { ChatGPTWebProvider } from './src/providers/model/ChatGPTWebProvider';
export { ChatGPTCodexProvider } from './src/providers/model/ChatGPTCodexProvider';
export { GeminiApiProvider } from './src/providers/model/GeminiApiProvider';
export { createChatGPTBrowserAutomationOptions } from './src/providers/model/createChatGPTBrowserAutomationOptions';
export * from './src/providers/model/providerHostTypes';
export * from './src/providers/model/providerProxyProtocol';
export * from './src/providers/context/HttpContextProvider';
export * from './src/providers/storage/IndexedDBStorageProvider';
export * from './src/providers/storage/SyncStorageProvider';
export * from './src/providers/sync/FetchSyncTransport';
export * from './src/providers/history/gemini/GeminiHistoryBridge';
export * from './src/providers/history/gemini/GeminiHistoryConfigLoader';
export * from './src/providers/history/gemini/GeminiDomHistoryProvider';
export * from './src/providers/history/gemini/geminiContentProtocol';
export { createGeminiDomScraper } from './src/providers/history/gemini/geminiDomScraper';
