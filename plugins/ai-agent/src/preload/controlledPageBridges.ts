import type { ContextBridgeLike, IpcRendererLike } from './types';
import { installChatGPTDomBridge } from './bridges/installChatGPTDomBridge';
import { installClaudeDomBridge } from './bridges/installClaudeDomBridge';
import { installGeminiDomBridge } from './bridges/installGeminiDomBridge';
import { installGeminiHistoryBridge } from './bridges/installGeminiHistoryBridge';

export const CONTROLLED_PAGE_BRIDGE_KEYS = {
    geminiHistory: 'gemini-history',
    chatgptDom: 'chatgpt-dom',
    geminiDom: 'gemini-dom',
    claudeDom: 'claude-dom'
} as const;

export type ControlledPageBridgeKey = typeof CONTROLLED_PAGE_BRIDGE_KEYS[keyof typeof CONTROLLED_PAGE_BRIDGE_KEYS];

export interface ControlledPageBridgeInstallDeps {
    contextBridge: ContextBridgeLike;
    ipcRenderer: IpcRendererLike;
}

const controlledPageBridgeInstallers: Record<ControlledPageBridgeKey, (deps: ControlledPageBridgeInstallDeps) => void> = {
    [CONTROLLED_PAGE_BRIDGE_KEYS.geminiHistory]: ({ contextBridge }) => {
        installGeminiHistoryBridge({ contextBridge });
    },
    [CONTROLLED_PAGE_BRIDGE_KEYS.chatgptDom]: ({ contextBridge, ipcRenderer }) => {
        installChatGPTDomBridge({ contextBridge, ipcRenderer });
    },
    [CONTROLLED_PAGE_BRIDGE_KEYS.geminiDom]: ({ contextBridge, ipcRenderer }) => {
        installGeminiDomBridge({ contextBridge, ipcRenderer });
    },
    [CONTROLLED_PAGE_BRIDGE_KEYS.claudeDom]: ({ contextBridge, ipcRenderer }) => {
        installClaudeDomBridge({ contextBridge, ipcRenderer });
    }
};

export function installControlledPageBridge(
    bridgeKey: ControlledPageBridgeKey,
    deps: ControlledPageBridgeInstallDeps
): void {
    const installer = controlledPageBridgeInstallers[bridgeKey];
    if (!installer) {
        throw new Error(`Unsupported controlled page bridge: ${bridgeKey}`);
    }

    installer(deps);
}
