import { createProviderRuntime } from '@packages/core/src/runtime/createProviderRuntime';
import { IModelProvider } from '@packages/core/src/interfaces/IModelProvider';

export default defineBackground(() => {
    chrome.runtime.onConnect.addListener((port) => {
        if (port.name === 'ai-provider-proxy') {
            const runtime = createProviderRuntime({ runtimeMode: 'extension' });
            let currentProvider: IModelProvider | null = null;

            const getProvider = (providerId: string): IModelProvider => {
                if (currentProvider && currentProvider.id === providerId) {
                    return currentProvider;
                }
                currentProvider = runtime.getProvider(providerId);
                return currentProvider;
            };

            port.onMessage.addListener(async (msg) => {
                try {
                    const provider = msg.providerId ? getProvider(msg.providerId) : currentProvider;
                    if (!provider && msg.action !== 'abort') {
                        throw new Error('Provider not specified or initialized');
                    }

                    if (msg.action === 'checkAuth') {
                        const isAuth = await provider!.checkAuth();
                        port.postMessage({ type: 'authResult', isAuth });
                    } else if (msg.action === 'sendMessage') {
                        try {
                            const result = await provider!.sendMessage(
                                msg.prompt,
                                msg.options,
                                (chunk) => {
                                    port.postMessage({ type: 'update', chunk });
                                }
                            );
                            port.postMessage({ type: 'done', result });
                        } catch (e: any) {
                            port.postMessage({ type: 'error', error: e.message || 'Error from provider' });
                        }
                    } else if (msg.action === 'abort') {
                        if (currentProvider) {
                            currentProvider.abort();
                        }
                    }
                } catch (err: any) {
                    port.postMessage({ type: 'error', error: err.message || 'Unknown background error' });
                }
            });

            port.onDisconnect.addListener(() => {
                if (currentProvider) {
                    currentProvider.abort();
                }
            });
        }
    });
});
