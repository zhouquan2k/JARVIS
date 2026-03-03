import { defineStore } from 'pinia';
import { IStorageProvider, Conversation } from '@packages/core/src/interfaces/IStorageProvider';
import { IModelProvider } from '@packages/core/src/interfaces/IModelProvider';
import type { ProviderConfig } from '@packages/core/config';
import { toRaw, markRaw } from 'vue';

export interface ChatState {
    modelProvider: IModelProvider | null;
    modelProviderResolver: ((providerId: string) => IModelProvider) | null;
    storageProvider: IStorageProvider | null;
    availableProviders: ProviderConfig[];
    conversations: Conversation[];
    currentConversation: Conversation | null;
    isGenerating: boolean;
    currentError: string | null;
    currentProviderId: string;
    currentModelId: string;
}

export const useChatStore = defineStore('chat', {
    state: (): ChatState => ({
        modelProvider: null,
        modelProviderResolver: null,
        storageProvider: null,
        availableProviders: [],
        conversations: [],
        currentConversation: null,
        isGenerating: false,
        currentError: null,
        currentProviderId: '',
        currentModelId: ''
    }),

    actions: {
        resolveModelProvider(providerId?: string): IModelProvider | null {
            const targetProviderId = providerId || this.currentProviderId;
            if (this.modelProviderResolver && targetProviderId) {
                return this.modelProviderResolver(targetProviderId);
            }
            return this.modelProvider;
        },

        setProviders(modelProvider: IModelProvider, storageProvider: IStorageProvider) {
            this.modelProvider = markRaw(modelProvider);
            if (!this.modelProviderResolver) {
                this.modelProviderResolver = (providerId: string) => {
                    this.modelProvider!.id = providerId;
                    return this.modelProvider!;
                };
            }
            this.storageProvider = markRaw(storageProvider);
        },

        setModelProviderResolver(resolver: (providerId: string) => IModelProvider) {
            this.modelProviderResolver = markRaw(resolver);
        },

        setAvailableProviders(providers: ProviderConfig[]) {
            this.availableProviders = providers;
            if (providers.length === 0) {
                this.currentProviderId = '';
                this.currentModelId = '';
                return;
            }

            const current = providers.find((item) => item.id === this.currentProviderId);
            if (!current) {
                this.currentProviderId = providers[0].id;
                this.currentModelId = providers[0].defaultModel;
                return;
            }

            if (!current.models.some((item) => item.id === this.currentModelId)) {
                this.currentModelId = current.defaultModel;
            }
        },

        async init() {
            if (!this.storageProvider) return;
            this.conversations = await this.storageProvider.getAllConversations();
        },

        setCurrentModelProvider(providerId: string, modelId: string) {
            this.currentProviderId = providerId;
            this.currentModelId = modelId;
        },

        async checkAuth() {
            const provider = this.resolveModelProvider();
            if (!provider) return false;
            return await provider.checkAuth();
        },

        async loadConversation(id: string) {
            if (!this.storageProvider) return;
            const chat = await this.storageProvider.getConversation(id);
            if (chat) {
                this.currentConversation = chat;
            }
        },

        async startNewConversation() {
            this.currentConversation = {
                id: crypto.randomUUID(),
                title: 'New Chat',
                messages: [],
                updatedAt: Date.now()
            };
        },

        async sendMessage(prompt: string) {
            if (!this.currentConversation) {
                await this.startNewConversation();
            }

            const userMsgId = crypto.randomUUID();
            const assistantMsgId = crypto.randomUUID();

            this.currentConversation!.messages.push({
                id: userMsgId,
                role: 'user',
                content: prompt
            });

            this.currentConversation!.messages.push({
                id: assistantMsgId,
                role: 'assistant',
                content: ''
            });

            this.isGenerating = true;
            this.currentError = null;

            try {
                const provider = this.resolveModelProvider();
                if (!provider || !this.storageProvider) {
                    throw new Error('Providers not initialized');
                }

                const backendId = this.currentConversation!.backendId;

                const result = await provider.sendMessage(
                    prompt,
                    { context: { conversationId: backendId }, modelId: this.currentModelId },
                    (chunk: string) => {
                        const lastMsg = this.currentConversation!.messages[this.currentConversation!.messages.length - 1];
                        if (lastMsg.role === 'assistant') {
                            lastMsg.content = chunk;
                        }
                    }
                );

                this.currentConversation!.backendId = result.conversationId;
                const lastMsg = this.currentConversation!.messages[this.currentConversation!.messages.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = result.text;
                }

                if (this.currentConversation!.title === 'New Chat') {
                    this.currentConversation!.title = prompt.substring(0, 30) + (prompt.length > 30 ? '...' : '');
                }

                this.currentConversation!.updatedAt = Date.now();
                await this.storageProvider.saveConversation(toRaw(this.currentConversation!));
                await this.init();

            } catch (err: any) {
                this.currentError = err.message || 'Error sending message';
            } finally {
                this.isGenerating = false;
            }
        },

        abort() {
            const provider = this.resolveModelProvider();
            if (provider) {
                provider.abort();
            }
            this.isGenerating = false;
        }
    }
});
