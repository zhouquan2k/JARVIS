// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import type { Conversation } from '@plugins/ai-agent/src/internal';
import NormalChatView from './NormalChatView.vue';
import { useChatStore } from '../store/chat';

function createConversation(messages: Conversation['messages']): Conversation {
    return {
        id: 'conversation-1',
        title: 'Normal Chat Workspace',
        origin: 'local',
        updatedAt: 10,
        messages
    };
}

function mountView(props: Record<string, unknown> = {}) {
    return mount(NormalChatView, {
        props: {
            showQuestionIndex: true,
            ...props
        },
        global: {
            stubs: {
                AttachmentComposer: {
                    props: ['disabled', 'disabledReason', 'error'],
                    emits: ['select-files', 'remove'],
                    template: `
                      <div
                        data-testid="attachment-composer-stub"
                        :data-disabled="disabled === true"
                        :data-disabled-reason="disabledReason || ''"
                        :data-error="error || ''"
                      />
                    `
                },
                ProviderModelSelector: {
                    template: '<div data-testid="provider-selector-stub" />'
                },
                ModelOptionToggleGroup: {
                    props: ['options', 'value', 'disabled'],
                    template: `
                      <div
                        data-testid="model-option-toggle-group"
                        :data-options="options?.length ?? 0"
                        :data-disabled="disabled === true"
                      />
                    `
                },
                MessageAttachmentStrip: {
                    template: '<div data-testid="attachment-strip-stub" />'
                },
                MarkdownContent: {
                    props: ['source'],
                    template: '<div data-testid="markdown-stub">{{ source }}</div>'
                },
                MessageFunctionalParts: false,
                QuestionIndexPanel: {
                    template: '<aside data-testid="question-index-panel">panel</aside>'
                }
            }
        }
    });
}

function setScrollMetrics(element: HTMLElement, metrics: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(element, 'scrollHeight', {
        configurable: true,
        value: metrics.scrollHeight
    });
    Object.defineProperty(element, 'clientHeight', {
        configurable: true,
        value: metrics.clientHeight
    });
    element.scrollTop = metrics.scrollTop;
}

describe('NormalChatView', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('renders question index controls inside the normal chat layout', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '第一条问题',
                questionId: 'question-1',
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '第一条回答',
                questionId: 'question-1',
                createdAt: 2
            }
        ]);
        store.workspaceMode = 'conversation';
        store.isQuestionIndexPanelOpen = true;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
        expect(wrapper.find('.conversation-header').exists()).toBe(false);
        expect(wrapper.find('.chat-container > .chat-main').exists()).toBe(true);
        expect(wrapper.find('.chat-container > .chat-inputarea').exists()).toBe(true);
        expect(wrapper.find('.chat-main .chat-inputarea').exists()).toBe(false);

        store.setQuestionIndexPanelOpen(false);
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="question-panel-open"]').text()).toContain('Show outline');
    });

    it('does not render the empty placeholder container when there is no conversation', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = null;
        store.previewConversation = null;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.find('[data-testid="normal-empty"]').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('从左侧选择一条历史');
        expect(wrapper.text()).not.toContain('支持拖拽、文件选择和剪贴板图片粘贴');
    });

    it('renders assistant functional parts collapsed by default and keeps them in message order', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '第一条回答\n\n第二条回答',
                createdAt: 1,
                functionalParts: [
                    {
                        id: 'part-1',
                        kind: 'tool_exchange',
                        title: 'Lookup docs',
                        content: '{"request":{"query":"docs"}}',
                        requestContent: '{"query":"docs"}',
                        responseContent: '{"ok":true}',
                        afterCharIndex: 6
                    }
                ]
            },
            {
                id: 'assistant-2',
                role: 'assistant',
                content: '第二条回答',
                createdAt: 2
            }
        ]);
        store.workspaceMode = 'conversation';
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        const markdownBlocks = wrapper.findAll('[data-testid="markdown-stub"]');
        expect(markdownBlocks).toHaveLength(3);
        expect(markdownBlocks[0]?.text()).toBe('第一条回答');
        expect(markdownBlocks[1]?.text()).toBe('第二条回答');

        const details = wrapper.findAll('[data-testid="message-functional-part"]');
        expect(details).toHaveLength(1);
        expect(details[0].attributes('open')).toBeUndefined();
        expect(wrapper.find('.message.assistant')?.text()).toMatch(/第一条回答[\s\S]*Lookup docs[\s\S]*第二条回答/);

        await details[0].find('summary').trigger('click');
        expect(details[0].text()).toContain('Request');
        expect(details[0].text()).toContain('Response');
        expect(details[0].text()).toContain('Lookup docs');
        expect(details[0].text()).toContain('{"query":"docs"}');
        expect(details[0].text()).toContain('{"ok":true}');
    });

    it('hides question index affordances while previewing', async () => {
        const store = useChatStore();
        store.previewConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '预览问题',
                questionId: 'preview-question-1',
                createdAt: 1
            }
        ]);
        store.isQuestionIndexPanelOpen = true;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
    });

    it('hides question index affordances when there are no user questions', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '只有回答，没有问题',
                createdAt: 1
            }
        ]);
        store.workspaceMode = 'conversation';
        store.isQuestionIndexPanelOpen = true;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="question-index-panel"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="question-panel-open"]').exists()).toBe(false);
    });

    it('shows message-level edit controls for user messages and enters edit mode', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '可编辑的问题',
                questionId: 'question-1',
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '已有回答',
                questionId: 'question-1',
                createdAt: 2
            }
        ]);
        store.workspaceMode = 'conversation';
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.findAll('[data-testid="message-edit"]')).toHaveLength(1);
        expect(wrapper.get('[data-testid="message-edit"] .message-edit-icon').exists()).toBe(true);

        await wrapper.get('[data-testid="message-edit"]').trigger('click');

        expect(store.editingQuestionId).toBe('question-1');
        expect(store.draftPrompt).toBe('可编辑的问题');
        expect(wrapper.get('[data-testid="edit-resend-banner"]').text()).toContain('Sending now will delete later conversation turns.');
    });

    it('cancels edit mode from the composer banner without mutating the conversation', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '可编辑的问题',
                questionId: 'question-1',
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '已有回答',
                questionId: 'question-1',
                createdAt: 2
            }
        ]);
        store.workspaceMode = 'conversation';
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);
        store.startQuestionEdit('question-1');

        const wrapper = mountView();
        await flushPromises();

        await wrapper.get('[data-testid="edit-resend-cancel"]').trigger('click');

        expect(store.editingQuestionId).toBeNull();
        expect(store.currentConversation?.messages[0]?.deleted).toBeUndefined();
        expect(store.currentConversation?.messages[1]?.deleted).toBeUndefined();
        expect(wrapper.find('[data-testid="edit-resend-banner"]').exists()).toBe(false);
    });

    it('hides the edit banner immediately after resending an edited question', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '可编辑的问题',
                questionId: 'question-1',
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '已有回答',
                questionId: 'question-1',
                createdAt: 2
            }
        ]);
        store.workspaceMode = 'conversation';
        store.currentModelId = 'mock-model';
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);
        store.startQuestionEdit('question-1');
        store.setDraftPrompt('可编辑的问题（已修改）');
        store.sendDraft = vi.fn().mockImplementation(async () => {
            store.isGenerating = true;
            store.editingQuestionId = null;
        });

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.find('[data-testid="edit-resend-banner"]').exists()).toBe(true);

        await wrapper.get('[data-testid="normal-send"]').trigger('click');
        await flushPromises();

        expect(store.sendDraft).toHaveBeenCalledTimes(1);
        expect(store.editingQuestionId).toBeNull();
        expect(wrapper.find('[data-testid="edit-resend-banner"]').exists()).toBe(false);
    });

    it('renders model option controls when the current model exposes options', async () => {
        const store = useChatStore();
        store.availableProviders = [
            {
                id: 'mock-provider',
                name: 'Mock Provider',
                defaultModel: 'dynamic-model',
                supportedRuntimeModes: ['web'],
                models: [
                    {
                        id: 'dynamic-model',
                        name: 'Dynamic Model',
                        options: [
                            {
                                key: 'web_search',
                                label: '联网搜索',
                                type: 'boolean'
                            }
                        ]
                    }
                ]
            }
        ];
        store.currentProviderId = 'mock-provider';
        store.currentModelId = 'dynamic-model';
        store.currentModelOptions = { web_search: true };
        store.providerModelStates = {
            'mock-provider': {
                loading: false,
                loaded: true
            }
        };
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="model-option-toggle-group"]').attributes('data-options')).toBe('1');
        expect(wrapper.get('[data-testid="model-option-toggle-group"]').attributes('data-disabled')).toBe('false');
        expect(wrapper.find('.selector-row [data-testid="model-option-toggle-group"]').exists()).toBe(true);
    });

    it('shows the summary dom page button first for group conversations and removes bottom raw links', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentProviderId = 'group';
        store.currentModelId = 'dom';
        store.currentGroupMembers = [
            { providerId: 'chatgpt-dom', modelId: 'GPT-5.5', name: 'ChatGPT' },
            { providerId: 'gemini-dom', modelId: '3.1 Pro', name: 'Gemini' }
        ];
        store.currentConversation = createConversation([
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '',
                createdAt: 1,
                groupMembers: [
                    { name: 'ChatGPT', providerId: 'chatgpt-dom', modelId: 'GPT-5.5', content: 'A', status: 'done' },
                    { name: 'Gemini', providerId: 'gemini-dom', modelId: '3.1 Pro', content: 'B', status: 'done' }
                ],
                groupSummary: { phase: 'done', content: '## Consensus\n总结内容' }
            }
        ]);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);
        const revealSpy = vi.spyOn(store, 'revealControlledPage').mockResolvedValue(undefined);

        const wrapper = mountView();
        await flushPromises();

        const pageButtons = wrapper.findAll('.dom-pages-bar .dom-page-btn');
        expect(pageButtons).toHaveLength(3);
        expect(pageButtons[0]?.text()).toContain('Summary');
        expect(pageButtons[1]?.text()).toContain('ChatGPT');
        expect(pageButtons[2]?.text()).toContain('Gemini');
        expect(wrapper.find('[data-testid^="group-dom-conversation-link-"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid^="dom-conversation-link-"]').exists()).toBe(false);

        await pageButtons[0].trigger('click');
        expect(revealSpy).toHaveBeenCalledWith('gemini-dom-summary');
    });

    it('collapses the top selector row by default in agent mode', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.workspaceMode = 'agent';
        store.activeAgentContext = {
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        };
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.find('.secondary-actions [data-testid="toolbar-collapse-toggle"]').exists()).toBe(true);
        expect(wrapper.find('.input-actions [data-testid="toolbar-collapse-toggle"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="selector-row"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="provider-selector-stub"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="normal-chat-view"]').classes()).toContain('agent-mode');
        expect(wrapper.get('[data-testid="normal-chat-view"]').classes()).not.toContain('standard-mode');
    });

    it('keeps the top selector row expanded by default outside agent mode', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.find('[data-testid="toolbar-collapse-toggle"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="selector-row"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="provider-selector-stub"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="normal-chat-view"]').classes()).toContain('standard-mode');
        expect(wrapper.get('[data-testid="normal-chat-view"]').classes()).not.toContain('agent-mode');
    });

    it('toggles the top selector row in agent mode', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.workspaceMode = 'agent';
        store.activeAgentContext = {
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        };
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        await wrapper.get('[data-testid="toolbar-collapse-toggle"]').trigger('click');
        expect(wrapper.find('.secondary-actions [data-testid="toolbar-collapse-toggle"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="selector-row"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="provider-selector-stub"]').exists()).toBe(true);

        await wrapper.get('[data-testid="toolbar-collapse-toggle"]').trigger('click');
        expect(wrapper.find('.secondary-actions [data-testid="toolbar-collapse-toggle"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="selector-row"]').exists()).toBe(false);
    });

    it('treats an inherited workspace agent seed as conversation mode in the chat view', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.workspaceAgentContext = {
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        };
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.get('[data-testid="normal-chat-view"]').classes()).toContain('standard-mode');
        expect(wrapper.find('[data-testid="toolbar-collapse-toggle"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="selector-row"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="provider-selector-stub"]').exists()).toBe(true);
    });

    it('keeps the attachment panel visible in agent mode when draft attachments exist', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.workspaceMode = 'agent';
        store.activeAgentContext = {
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        };
        store.draftAttachments = [
            {
                id: 'attachment-1',
                type: 'file',
                name: 'guide.md',
                mimeType: 'text/markdown',
                size: 128,
                base64Data: 'Z3VpZGU='
            }
        ];
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.get('[data-testid="normal-chat-view"]').classes()).toContain('agent-mode');
        expect(wrapper.find('[data-testid="selector-row"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="attachment-composer-stub"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="provider-selector-stub"]').exists()).toBe(true);
    });

    it('does not render the archive action in the input area anymore', async () => {
        const store = useChatStore();
        store.workspaceMode = 'agent';
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: 'Archive this',
                createdAt: 1
            }
        ]);
        store.activeWorkspaceSelectedNodePath = '/docs/guide.md';
        store.activeWorkspaceDocument = {
            path: '/docs/guide.md',
            mimeType: 'text/markdown',
            dataBase64: 'IyBHIQ==',
            canWrite: true
        };
        store.currentModelId = 'gpt-4o';
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.find('[data-testid="archive-conversation"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="archive-status"]').exists()).toBe(false);
    });

    it('renders archive feedback and progress while archiving', async () => {
        const store = useChatStore();
        store.workspaceMode = 'agent';
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: 'Archive this',
                createdAt: 1
            }
        ]);
        store.currentModelId = 'gpt-4o';
        store.archiveConversationProgressPart = {
            id: 'archive-progress',
            kind: 'tool_call',
            title: 'Archive conversation',
            content: 'Archiving the current conversation into the active document.',
            collapsed: false
        };
        store.isArchivingConversation = true;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.get('[data-testid="archive-progress-message"]').text()).toContain('Archive conversation');
        expect(wrapper.get('[data-testid="archive-progress-message"]').text()).toContain('Archiving the current conversation into the active document.');

        store.archiveConversationProgressPart = {
            id: 'archive-progress',
            kind: 'tool_result',
            title: 'Archive conversation',
            content: 'Archived',
            collapsed: false
        };
        store.archiveFeedback = {
            tone: 'success',
            message: 'Archived'
        };
        store.isArchivingConversation = false;
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="archive-feedback"]').text()).toContain('Archived');
        expect(wrapper.get('[data-testid="archive-progress-message"]').text()).toContain('Archived');
    });

    it('disables attachment entry when the current provider does not support uploads', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.currentProviderId = 'chatgpt-web';
        store.currentModelId = 'gpt-4o';
        store.providerModelStates = {
            'chatgpt-web': { loading: false, loaded: true }
        };
        store.providerDocumentCapabilities = {
            'chatgpt-web': { acceptedMimeTypes: [] }
        };
        store.ensureAttachmentCapabilityLoaded = vi.fn().mockResolvedValue(undefined);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        const composer = wrapper.get('[data-testid="attachment-composer-stub"]');
        expect(composer.attributes('data-disabled')).toBe('true');
        expect(composer.attributes('data-disabled-reason')).toBe('The current provider does not support file uploads.');
    });

    it('shows an unsupported upload message when pasting files for a provider without upload support', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.currentProviderId = 'chatgpt-web';
        store.currentModelId = 'gpt-4o';
        store.providerModelStates = {
            'chatgpt-web': { loading: false, loaded: true }
        };
        store.providerDocumentCapabilities = {
            'chatgpt-web': { acceptedMimeTypes: [] }
        };
        store.ensureAttachmentCapabilityLoaded = vi.fn().mockResolvedValue(undefined);
        store.queueAttachments = vi.fn();
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        await wrapper.get('[data-testid="normal-input"]').trigger('paste', {
            clipboardData: {
                files: [
                    {
                        name: 'diagram.png',
                        type: 'image/png',
                        size: 3
                    }
                ]
            }
        });
        await wrapper.vm.$nextTick();

        expect(store.queueAttachments).not.toHaveBeenCalled();
        expect(store.attachmentError).toBe('The current provider does not support file uploads.');
        expect(wrapper.get('[data-testid="attachment-composer-stub"]').attributes('data-error')).toBe('The current provider does not support file uploads.');
    });

    it('renders a new chat action below the send button and calls the existing store entry', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.currentModelId = 'gpt-4o';
        store.startNewConversation = vi.fn().mockResolvedValue(undefined);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.find('.secondary-actions [data-testid="normal-new-chat"]').exists()).toBe(true);
        await wrapper.get('[data-testid="normal-new-chat"]').trigger('click');
        expect(store.startNewConversation).toHaveBeenCalledTimes(1);
    });

    it('emits a workspace switch request for the knowledge workspace restore button', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.currentModelId = 'gpt-4o';
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.get('[data-testid="workspace-restore"]').exists()).toBe(true);
        await wrapper.get('[data-testid="workspace-restore"]').trigger('click');
        expect(wrapper.emitted('request-workspace-switch')).toEqual([['/']]);
    });

    it('hides the workspace restore button in agent mode', async () => {
        const store = useChatStore();
        store.workspaceMode = 'agent';
        store.currentConversation = createConversation([]);
        store.currentModelId = 'gpt-4o';
        store.activeAgentContext = {
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        };
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.find('[data-testid="workspace-restore"]').exists()).toBe(false);
    });

    it('renders attachments in agent mode when they are stored on the message', async () => {
        const store = useChatStore();
        store.workspaceMode = 'agent';
        store.activeAgentContext = {
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        };
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '当前文档已作为附件提供：/docs/guide.md',
                attachments: [
                    {
                        id: 'attachment-1',
                        type: 'file',
                        name: 'guide.md',
                        mimeType: 'text/markdown',
                        size: 128,
                        base64Data: 'Z3VpZGU='
                    }
                ],
                createdAt: 1
            }
        ]);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.findAll('[data-testid="attachment-strip-stub"]')).toHaveLength(1);
        expect(wrapper.get('[data-testid="normal-chat-view"]').classes()).toContain('agent-mode');
    });

    it('renders attachments in agent mode when they only exist in the request snapshot', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.workspaceMode = 'agent';
        store.activeAgentContext = {
            name: 'Docs Agent',
            effectiveInstructions: 'Use docs context',
            scopePath: '/docs',
            sourcePaths: ['/docs/.agent.json']
        };
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '当前文档已作为附件提供：/docs/guide.md',
                requestSnapshot: {
                    prompt: '当前文档已作为附件提供：/docs/guide.md',
                    attachments: [
                        {
                            id: 'attachment-1',
                            type: 'file',
                            name: 'guide.md',
                            mimeType: 'text/markdown',
                            size: 128,
                            base64Data: 'Z3VpZGU='
                        }
                    ],
                    activeDocumentMode: 'attachment'
                },
                createdAt: 1
            }
        ]);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.findAll('[data-testid="attachment-strip-stub"]')).toHaveLength(1);
        expect(wrapper.get('[data-testid="normal-chat-view"]').classes()).toContain('agent-mode');
    });

    it('disables model option controls when chat input is unavailable', async () => {
        const store = useChatStore();
        store.availableProviders = [
            {
                id: 'mock-provider',
                name: 'Mock Provider',
                defaultModel: 'dynamic-model',
                supportedRuntimeModes: ['web'],
                models: [
                    {
                        id: 'dynamic-model',
                        name: 'Dynamic Model',
                        options: [
                            {
                                key: 'deep_research',
                                label: 'Deep Research',
                                type: 'boolean'
                            }
                        ]
                    }
                ]
            }
        ];
        store.currentProviderId = 'mock-provider';
        store.currentModelId = 'dynamic-model';
        store.providerModelStates = {
            'mock-provider': {
                loading: false,
                loaded: true
            }
        };
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([]);
        store.isGenerating = true;
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="model-option-toggle-group"]').attributes('data-disabled')).toBe('true');
    });

    it('renders a custom auth recovery action when the host provides one', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([]);
        store.workspaceMode = 'conversation';
        store.currentModelId = 'gpt-4o';
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView({
            authStatusOverride: false,
            authUnavailableMessage: '当前桌面宿主的 ChatGPT 登录态不可用，请先登录后再继续。',
            authRecoveryActionLabel: '登录 ChatGPT'
        });
        await flushPromises();

        expect(wrapper.get('[data-testid="normal-auth-warning"]').text()).toContain('当前桌面宿主的 ChatGPT 登录态不可用');
        expect(wrapper.get('[data-testid="normal-auth-recovery"]').text()).toContain('登录 ChatGPT');

        await wrapper.get('[data-testid="normal-auth-recovery"]').trigger('click');
        expect(wrapper.emitted('request-auth-recovery')).toHaveLength(1);
    });

    it('does not coerce an absent auth override into unauthenticated state', async () => {
        const store = useChatStore();
        store.currentConversation = createConversation([]);
        store.workspaceMode = 'conversation';
        store.currentProviderId = 'mock-provider';
        store.currentModelId = 'mock-model';
        store.availableProviders = [
            {
                id: 'mock-provider',
                name: 'Mock Provider',
                defaultModel: 'mock-model',
                supportedRuntimeModes: ['web'],
                models: [
                    {
                        id: 'mock-model',
                        name: 'Mock Model'
                    }
                ]
            }
        ];
        store.providerModelStates = {
            'mock-provider': {
                loading: false,
                loaded: true
            }
        };
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        expect(wrapper.find('[data-testid="normal-auth-warning"]').exists()).toBe(false);
        expect((wrapper.get('[data-testid="normal-input"]').element as HTMLTextAreaElement).disabled).toBe(false);
    });

    it('preserves scroll position when assistant content updates after the user scrolls upward', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '问题',
                questionId: 'question-1',
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '旧回答',
                questionId: 'question-1',
                createdAt: 2
            }
        ]);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        const messages = wrapper.get('[data-testid="normal-messages"]').element as HTMLElement;
        setScrollMetrics(messages, {
            scrollTop: 120,
            scrollHeight: 1000,
            clientHeight: 240
        });

        store.currentConversation.messages[1].content = '新回答';
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(messages.scrollTop).toBe(120);
    });

    it('does not reset to the top when the active conversation is refreshed with the same id', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '问题',
                questionId: 'question-1',
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '旧回答',
                questionId: 'question-1',
                createdAt: 2
            }
        ]);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        const messages = wrapper.get('[data-testid="normal-messages"]').element as HTMLElement;
        setScrollMetrics(messages, {
            scrollTop: 760,
            scrollHeight: 1000,
            clientHeight: 240
        });

        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '问题',
                questionId: 'question-1',
                createdAt: 1
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: '新回答',
                questionId: 'question-1',
                createdAt: 2
            }
        ]);
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(messages.scrollTop).toBe(1000);
    });

    it('starts at the top when the displayed conversation changes', async () => {
        const store = useChatStore();
        store.workspaceMode = 'conversation';
        store.currentConversation = createConversation([
            {
                id: 'user-1',
                role: 'user',
                content: '第一段问题',
                questionId: 'question-1',
                createdAt: 1
            }
        ]);
        store.init = vi.fn().mockResolvedValue(undefined);
        store.checkAuth = vi.fn().mockResolvedValue(true);

        const wrapper = mountView();
        await flushPromises();

        const messages = wrapper.get('[data-testid="normal-messages"]').element as HTMLElement;
        setScrollMetrics(messages, {
            scrollTop: 760,
            scrollHeight: 1000,
            clientHeight: 240
        });

        store.currentConversation = {
            id: 'conversation-2',
            title: 'Next conversation',
            origin: 'local',
            updatedAt: 20,
            messages: [
                {
                    id: 'user-2',
                    role: 'user',
                    content: '第二段问题',
                    questionId: 'question-2',
                    createdAt: 3
                }
            ]
        };
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(messages.scrollTop).toBe(0);
    });
});
