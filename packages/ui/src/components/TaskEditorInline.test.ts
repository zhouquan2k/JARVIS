// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Task } from '@packages/core/src';
import TaskEditorInline from './TaskEditorInline.vue';

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: 'task-1',
        title: 'Draft',
        notes: '',
        completed: false,
        dueAt: null,
        priority: null,
        documentPath: '/docs/guide.md',
        agentKey: null,
        createdAt: 1,
        updatedAt: 1,
        completedAt: null,
        calendarProviderId: null,
        calendarEventId: null,
        calendarSyncStatus: null,
        calendarLastSyncedAt: null,
        calendarLastSyncError: null,
        ...overrides
    };
}

describe('TaskEditorInline', () => {
    it('emits the edited task payload with due date, optional time, and priority fields', async () => {
        const wrapper = mount(TaskEditorInline, {
            props: {
                task: createTask()
            }
        });

        await wrapper.get('[data-testid="task-editor-title"]').setValue('Follow up');
        await wrapper.get('[data-testid="task-editor-notes"]').setValue('Prepare summary');
        await wrapper.get('[data-testid="task-editor-due-at"]').setValue('2026-05-24');
        await wrapper.get('[data-testid="task-editor-time-toggle"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-due-time"]').setValue('09:30');
        await wrapper.get('[data-testid="task-editor-priority"]').setValue('high');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');

        expect(wrapper.emitted('save')?.[0]?.[0]).toEqual(expect.objectContaining({
            title: 'Follow up',
            notes: 'Prepare summary',
            priority: 'high',
            dueAt: new Date('2026-05-24T09:30:00').getTime()
        }));
    });

    it('keeps notes as a single-line auto-grow field below meta controls', () => {
        const wrapper = mount(TaskEditorInline, {
            props: {
                task: createTask()
            }
        });

        const meta = wrapper.get('.task-editor-inline__meta');
        const notes = wrapper.get('[data-testid="task-editor-notes"]');

        expect(notes.attributes('rows')).toBe('1');
        expect(meta.element.compareDocumentPosition(notes.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('hides time input by default and shows it only after explicit toggle', async () => {
        const wrapper = mount(TaskEditorInline, {
            props: {
                task: createTask()
            }
        });

        expect(wrapper.find('[data-testid="task-editor-due-time"]').exists()).toBe(false);

        await wrapper.get('[data-testid="task-editor-time-toggle"]').trigger('click');
        expect(wrapper.find('[data-testid="task-editor-due-time"]').exists()).toBe(true);
        expect(wrapper.find('.task-editor-inline__field--time').exists()).toBe(true);
    });

    it('focuses the priority select when clicking the shell', async () => {
        const wrapper = mount(TaskEditorInline, {
            attachTo: document.body,
            props: {
                task: createTask()
            }
        });

        await wrapper.get('[data-testid="task-editor-priority-shell"]').trigger('click');
        expect(document.activeElement).toBe(wrapper.get('[data-testid="task-editor-priority"]').element);
    });
});
