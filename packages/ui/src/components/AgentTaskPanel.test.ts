// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { IContextProvider } from '@packages/core/src';
import AgentTaskPanel from './AgentTaskPanel.vue';

describe('AgentTaskPanel', () => {
    it('passes document scope through to TaskListPanel', () => {
        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeAgentKey: '/docs/',
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: { id: 'ctx' } as IContextProvider
            },
            global: {
                stubs: {
                    TaskListPanel: {
                        props: ['documentPath', 'agentKey', 'tag'],
                        template: '<div data-testid="task-list-stub" :data-document-path="documentPath" :data-agent-key="agentKey" :data-tag="tag" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="task-list-stub"]').attributes()).toMatchObject({
            'data-document-path': '/docs/guide.md',
            'data-agent-key': '/docs/',
            'data-tag': 'all'
        });
    });

    it('passes agent scope through when no active document exists', () => {
        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeAgentKey: '/docs/',
                contextProvider: { id: 'ctx' } as IContextProvider
            },
            global: {
                stubs: {
                    TaskListPanel: {
                        props: ['documentPath', 'agentKey'],
                        template: '<div data-testid="task-list-stub" :data-document-path="String(documentPath)" :data-agent-key="agentKey" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="task-list-stub"]').attributes()).toMatchObject({
            'data-document-path': 'null',
            'data-agent-key': '/docs/'
        });
    });

    it('shows the empty state when there is no resolved scope', () => {
        const wrapper = mount(AgentTaskPanel, {
            props: {
                contextProvider: { id: 'ctx' } as IContextProvider
            },
            global: {
                stubs: {
                    TaskListPanel: true
                }
            }
        });

        expect(wrapper.findComponent({ name: 'TaskListPanel' }).exists()).toBe(false);
        expect(wrapper.get('[data-testid="agent-task-empty"]').text()).not.toBe('');
    });
});
