// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Conversation, IConversationPersistProvider, IModelProvider } from '@packages/core/src';
import { encodeTextDocument } from '@packages/core/src';
import type { ProviderConfig } from '@packages/core/config';
import AgentPane from './AgentPane.vue';
import { useChatStore } from '../store/chat';

class PaneTestProvider implements IModelProvider {
    id = 'pane-test-provider';
    acceptedMimeTypes = ['text/plain', 'text/markdown', 'application/pdf'];
    calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];

    async getAvailableModels() {
        return {
            models: [{ id: 'pane-model', name: 'Pane Model' }],
            defaultModel: 'pane-model'
        };
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async getDocumentCapability() {
        return {
            acceptedMimeTypes: [...this.acceptedMimeTypes]
        };
    }

    async sendMessage(prompt: string, options: Record<string, unknown>, onUpdate: (update: { text: string }) => void) {
        this.calls.push({ prompt, options });
        onUpdate({ text: `reply:${prompt}` });
        return {
            text: `reply:${prompt}`,
            conversationId: 'pane-conversation',
            messageId: 'pane-message'
        };
    }

    abort(): void {}
}

class PaneTestStorageProvider implements IConversationPersistProvider {
    id = 'pane-test-storage';
    private readonly conversations: Conversation[] = [];

    async saveConversation(chat: Conversation): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === chat.id);
        if (index >= 0) {
            this.conversations[index] = chat;
            return;
        }

        this.conversations.unshift(chat);
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.find((item) => item.id === id) || null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return [...this.conversations];
    }

    async deleteConversation(id: string): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === id);
        if (index >= 0) {
            this.conversations.splice(index, 1);
        }
    }
}

const paneProviderCatalog: ProviderConfig[] = [
    {
        id: 'pane-test-provider',
        name: 'Pane Test Provider',
        models: [{ id: 'pane-model', name: 'Pane Model' }],
        defaultModel: 'pane-model',
        supportedRuntimeModes: ['web']
    }
];

describe('AgentPane', () => {
    it('mounts the normal chat view and renders active agent metadata', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    description: 'Handle docs',
                    instructions: 'Use docs context',
                    effectiveInstructions: 'Use docs context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-pro',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                },
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Guide')
                },
                contextProvider: null,
                onFileChanged: null
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="agent-pane"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-name"]').text()).toContain('Docs Agent（/docs）');
        expect(wrapper.get('[data-testid="agent-model"]').text()).toContain('gemini-api / gemini-2.5-pro');
        expect(wrapper.text()).toContain('Docs Agent（/docs）');
        expect(wrapper.text()).toContain('gemini-api / gemini-2.5-pro');
    });

    it('prefers the nearest matched agent config directory over the current scope path', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Archive Agent',
                    effectiveInstructions: 'Use archive context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-pro',
                    scopePath: '/workspace/archive/reports',
                    sourcePaths: ['/workspace/.agent.json', '/workspace/archive/.agent.json']
                },
                activePath: '/workspace/archive/reports/note.md',
                activeDocument: {
                    path: '/workspace/archive/reports/note.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Note')
                },
                contextProvider: null,
                onFileChanged: null
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="agent-name"]').text()).toContain('Archive Agent（/workspace/archive）');
        expect(wrapper.get('[data-testid="agent-name"]').text()).not.toContain('/workspace/archive/reports');
    });

    it('shows root scope for the default agent when no scoped config is matched', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Default Knowledge Agent',
                    effectiveInstructions: 'Use workspace context',
                    scopePath: '/',
                    sourcePaths: []
                },
                activePath: '/welcome.md',
                activeDocument: {
                    path: '/welcome.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Welcome')
                },
                contextProvider: null,
                onFileChanged: null
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="agent-name"]').text()).toContain('Default Knowledge Agent（/）');
    });

    it('renders fallback default agent metadata when no scoped agent is available', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: null,
                activePath: null,
                activeDocument: null,
                contextProvider: null,
                onFileChanged: null
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="agent-name"]').text()).toContain('Default Knowledge Agent（/）');
        expect(wrapper.get('[data-testid="agent-model"]').text()).toContain('gemini-api / Gemini Pro Latest');
    });

    it('syncs and clears the chat agent context with the pane lifecycle', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    effectiveInstructions: 'Use docs context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-flash',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                },
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Guide')
                },
                contextProvider: {
                    id: 'workspace-context',
                    initializeAccess: async () => undefined,
                    listTree: async () => [],
                    readDocument: async (path: string) => ({ path, mimeType: 'text/markdown', dataBase64: encodeTextDocument('') }),
                    writeDocument: async () => undefined,
                    createNode: async () => ({ path: '/draft.md', name: 'draft.md', kind: 'file' as const }),
                    searchInScope: async () => [],
                    resolveScopedAgentConfig: async () => ({
                        name: 'Docs Agent',
                        effectiveInstructions: 'Use docs context',
                        scopePath: '/docs',
                        sourcePaths: ['/docs/.agent.json']
                    })
                },
                onFileChanged: async () => undefined
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(chatStore.activeAgentContext?.name).toBe('Docs Agent');
        expect(chatStore.activeWorkspacePath).toBe('/docs/guide.md');
        expect(chatStore.activeWorkspaceDocument).toEqual({
            path: '/docs/guide.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# Guide')
        });
        expect(chatStore.activeWorkspaceContextProvider?.id).toBe('workspace-context');

        await wrapper.setProps({
            activeAgent: {
                name: 'Archive Agent',
                effectiveInstructions: 'Use archive context',
                modelProviderName: 'gemini-api',
                modelName: 'gemini-2.5-pro',
                scopePath: '/archive',
                sourcePaths: ['/archive/.agent.json']
            },
            activePath: '/archive/log.md',
            activeDocument: {
                path: '/archive/log.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Archive Log')
            }
        });

        expect(chatStore.activeAgentContext?.name).toBe('Archive Agent');
        expect(chatStore.activeWorkspacePath).toBe('/archive/log.md');
        expect(chatStore.activeWorkspaceDocument).toEqual({
            path: '/archive/log.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# Archive Log')
        });

        wrapper.unmount();
        expect(chatStore.activeAgentContext).toBeNull();
        expect(chatStore.activeWorkspacePath).toBeNull();
        expect(chatStore.activeWorkspaceDocument).toBeNull();
    });

    it('routes active pdf documents into attachments after provider mime negotiation', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const provider = new PaneTestProvider();
        chatStore.setProviders(provider, new PaneTestStorageProvider());
        await chatStore.initializeProviderCatalog(paneProviderCatalog);

        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    effectiveInstructions: 'Use docs context',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                },
                activePath: '/docs/spec.pdf',
                activeDocument: {
                    path: '/docs/spec.pdf',
                    mimeType: 'application/pdf',
                    dataBase64: 'JVBERi0xLjQ='
                },
                contextProvider: null,
                onFileChanged: null
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await chatStore.sendMessage('请总结这个 PDF');

        expect(provider.calls[0]?.prompt).toBe('请总结这个 PDF');
        expect(provider.calls[0]?.options.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/spec.pdf',
                name: 'spec.pdf',
                mimeType: 'application/pdf'
            })
        ]);

        wrapper.unmount();
    });
});
