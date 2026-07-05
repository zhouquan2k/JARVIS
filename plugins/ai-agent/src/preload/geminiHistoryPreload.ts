/**
 * Gemini 历史 preload 的生产入口（Electron preload 脚本）。
 * 引入核心层后注册 contextBridge，建立 `window.chatprismGeminiHistory` 桥。
 * 由 desktop2 构建工具编译为独立 CJS bundle 并注入受控 Gemini 页面。
 */
import { contextBridge } from 'electron';
import { installGeminiHistoryBridge } from './bridges/installGeminiHistoryBridge';

export * from '../providers/history/gemini/geminiHistoryBridgeCore';
installGeminiHistoryBridge({ contextBridge });
