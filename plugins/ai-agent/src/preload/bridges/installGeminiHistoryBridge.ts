import { handleGeminiHistoryRequest } from '../../providers/history/gemini/geminiHistoryBridgeCore';
import type { ContextBridgeLike } from '../types';

export function installGeminiHistoryBridge(deps: { contextBridge: ContextBridgeLike }): void {
    deps.contextBridge.exposeInMainWorld('chatprismGeminiHistory', {
        request: handleGeminiHistoryRequest
    });
}
