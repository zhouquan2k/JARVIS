/// <reference types="chrome"/>
import { IModelProvider } from '@packages/core/src/interfaces/IModelProvider';

export class BackgroundProxyProvider implements IModelProvider {
    public id: string;
    private port: chrome.runtime.Port | null = null;

    constructor(providerId: string) {
        this.id = providerId;
    }

    private ensureConnection() {
        if (!this.port) {
            this.port = chrome.runtime.connect({ name: 'ai-provider-proxy' });
            this.port.onDisconnect.addListener(() => {
                this.port = null;
            });
        }
        return this.port;
    }

    checkAuth(): Promise<boolean> {
        return new Promise((resolve) => {
            const port = this.ensureConnection();

            const listener = (msg: any) => {
                if (msg.type === 'authResult') {
                    port.onMessage.removeListener(listener);
                    resolve(msg.isAuth);
                }
            };

            port.onMessage.addListener(listener);
            port.postMessage({ action: 'checkAuth', providerId: this.id });
        });
    }

    sendMessage(
        prompt: string,
        options: {
            context?: { parentMessageId?: string, conversationId?: string },
            modelId?: string
        } = {},
        onUpdate: (chunk: string) => void
    ): Promise<{ text: string, conversationId: string, messageId: string }> {
        return new Promise((resolve, reject) => {
            const port = this.ensureConnection();

            const listener = (msg: any) => {
                if (msg.type === 'update') {
                    onUpdate(msg.chunk);
                } else if (msg.type === 'done') {
                    port.onMessage.removeListener(listener);
                    resolve(msg.result);
                } else if (msg.type === 'error') {
                    port.onMessage.removeListener(listener);
                    reject(new Error(msg.error));
                }
            };

            port.onMessage.addListener(listener);
            port.postMessage({
                action: 'sendMessage',
                providerId: this.id,
                prompt,
                options
            });
        });
    }

    abort(): void {
        if (this.port) {
            this.port.postMessage({ action: 'abort' });
        }
    }
}
