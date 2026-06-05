// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { IContextProvider } from '@packages/core/src';
import AllTasksWorkspaceView from './AllTasksWorkspaceView.vue';

describe('AllTasksWorkspaceView', () => {
    it('switches between today and planned shortcuts', async () => {
        const wrapper = mount(AllTasksWorkspaceView, {
            props: {
                contextProvider: { id: 'ctx' } as IContextProvider
            },
            global: {
                stubs: {
                    TaskListPanel: {
                        props: ['tag', 'groupByDate'],
                        template: '<div data-testid="task-list-stub" :data-tag="tag" :data-group-by-date="String(groupByDate)" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="task-list-stub"]').attributes()).toMatchObject({
            'data-tag': 'today',
            'data-group-by-date': 'false'
        });

        await wrapper.get('[data-testid="all-tasks-shortcut-planned"]').trigger('click');

        expect(wrapper.get('[data-testid="task-list-stub"]').attributes()).toMatchObject({
            'data-tag': 'planned',
            'data-group-by-date': 'true'
        });
    });
});
