import { defineStore } from 'pinia';
import { IStorageProvider, Conversation } from '@packages/core/src/interfaces/IStorageProvider';
import { IModelProvider } from '@packages/core/src/interfaces/IModelProvider';
import { toRaw, markRaw } from 'vue';

export interface ChatState {
    modelProvider: IModelProvider | null;
    storageProvider: IStorageProvider | null;
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
        storageProvider: null,
        conversations: [],
        currentConversation: null,
        isGenerating: false,
        currentError: null,
        currentProviderId: '',
        currentModelId: ''
    }),

    actions: {
        setProviders(modelProvider: IModelProvider, storageProvider: IStorageProvider) {
            this.modelProvider = markRaw(modelProvider);
            this.storageProvider = markRaw(storageProvider);
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
            if (!this.modelProvider) return false;
            return await this.modelProvider.checkAuth();
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
                if (!this.modelProvider || !this.storageProvider) {
                    throw new Error('Providers not initialized');
                }

                const backendId = this.currentConversation!.backendId;

                const result = await this.modelProvider.sendMessage(
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
            if (this.modelProvider) {
                this.modelProvider.abort();
            }
            this.isGenerating = false;
        }
    }
});
