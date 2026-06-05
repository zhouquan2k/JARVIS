/**
 * 测试用薄代理：仅 re-export plugin 的无 Electron 核心层。
 * 生产构建入口：esbuild ../../plugins/ai-agent/src/preload/geminiHistoryPreload.ts
 *（见 package.json build:main:gemini-preload）。
 */
export * from '../../../plugins/ai-agent/src/preload/geminiHistoryCore';
