// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Conversation, ResolvedAgentConfig } from '@packages/core/src';
import AgentView from './AgentView.vue';

const agent: ResolvedAgentConfig = {
    name: 'Archive Agent',
    description: 'Handle archive docs',
    effectiveInstructions: 'Use archive context',
    modelProviderName: 'gemini-api',
    modelName: 'gemini-2.5-flash',
    scopePath: '/workspace/archive',
    sourcePaths: ['/workspace/.agent.json', '/workspace/archive/.agent.json']
};

const conversations: Conversation[] = [
    {
        id: 'conversation-2',
        title: 'Latest archive follow-up',
        origin: 'local',
        agentKey: '/workspace/archive/.agent.json',
        messages: [],
        updatedAt: 1720000000000
    },
    {
        id: 'conversation-1',
        title: 'Archive planning',
        origin: 'local',
        agentKey: '/workspace/archive/.agent.json',
        messages: [],
        updatedAt: 1710000000000
    }
];

describe('AgentView', () => {
    it('renders agent metadata, markdown document trees and local conversations', async () => {
        const wrapper = mount(AgentView, {
            props: {
                agentKey: '/workspace/archive/.agent.json',
                agent,
                ownerNode: {
                    path: '/workspace/archive',
                    name: 'archive',
                    kind: 'directory',
                    agentKey: '/workspace/archive/.agent.json',
                    isAgentOwner: true
                },
                documents: [
                    {
                        path: '/workspace/archive/guide.md',
                        name: 'guide.md',
                        kind: 'file',
                        parentPath: '/workspace/archive',
                        agentKey: '/workspace/archive/.agent.json'
                    },
                    {
                        path: '/workspace/archive/guides',
                        name: 'guides',
                        kind: 'directory',
                        parentPath: '/workspace/archive',
                        agentKey: '/workspace/archive/.agent.json',
                        children: [
                            {
                                path: '/workspace/archive/guides/history.md',
                                name: 'history.md',
                                kind: 'file',
                                parentPath: '/workspace/archive/guides',
                                agentKey: '/workspace/archive/.agent.json'
                            }
                        ]
                    }
                ],
                conversations
            }
        });

        expect(wrapper.get('[data-testid="agent-view"]').text()).toContain('Archive Agent');
        expect(wrapper.get('[data-testid="agent-view-model"]').text()).toContain('gemini-api / gemini-2.5-flash');
        expect(wrapper.get('[data-testid="agent-document-tree"]').text()).toContain('guides');
        const documentItems = wrapper.findAll('[data-testid="agent-view-document"]');
        expect(documentItems).toHaveLength(2);
        expect(documentItems[0].text()).toContain('guide.md');
        expect(documentItems[1].text()).toContain('history.md');
        const conversationItems = wrapper.findAll('[data-testid="agent-view-conversation"]');
        expect(conversationItems).toHaveLength(2);
        expect(conversationItems[0].text()).toBe('Latest archive follow-up');
        expect(conversationItems[1].text()).toBe('Archive planning');
        expect(wrapper.text()).not.toContain('2024年');
        expect(wrapper.text()).not.toContain('2026年');
        expect(wrapper.find('[data-testid="agent-view-instructions"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="agent-view-instructions-toggle"]').attributes('aria-expanded')).toBe('false');

        await wrapper.get('[data-testid="agent-view-instructions-toggle"]').trigger('click');

        expect(wrapper.get('[data-testid="agent-view-instructions"]').text()).toContain('Use archive context');
        expect(wrapper.get('[data-testid="agent-view-instructions-toggle"]').attributes('aria-expanded')).toBe('true');

        await documentItems[1].trigger('click');
        await wrapper.get('[data-testid="agent-view-conversation"]').trigger('click');

        expect(wrapper.emitted('open-document')).toEqual([
            ['/workspace/archive/guides/history.md']
        ]);
        expect(wrapper.emitted('open-conversation')).toEqual([
            ['conversation-2']
        ]);
    });
});
