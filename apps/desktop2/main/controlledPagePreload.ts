import { contextBridge, ipcRenderer } from 'electron';
import { installControlledPageBridge, type ControlledPageBridgeKey } from '@plugins/ai-agent/preload';

const BRIDGE_KEY_PREFIX = '--jarvis-controlled-page-bridge=';

function resolveBridgeKey(argv: string[]): ControlledPageBridgeKey {
    const raw = argv.find((arg) => arg.startsWith(BRIDGE_KEY_PREFIX));
    if (!raw) {
        throw new Error('Missing controlled page bridge key.');
    }

    return raw.slice(BRIDGE_KEY_PREFIX.length) as ControlledPageBridgeKey;
}

installControlledPageBridge(resolveBridgeKey(process.argv), {
    contextBridge,
    ipcRenderer
});
