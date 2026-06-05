// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { Task, TaskQueryTag, TaskService } from '../../api';
import TaskListPanel from './TaskListPanel.vue';
import { resetTaskServiceForTests, setTaskServiceForTests } from '../taskServiceRegistry';

function createTask(overrides: Partial<Task> = {}): Task {
    return {
        id: 'task-1',
        title: 'Task',
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

function createTaskPanelProvider(initialTasks: Task[]): TaskService & {
    __replaceTask(task: Task): void;
    __appendTask(task: Task): void;
} {
    let tasks = [...initialTasks];
    const taskProvider = {
        getTasks: vi.fn(async (documentPath?: string | null, agentKey?: string | null, completed?: boolean, tag?: TaskQueryTag | null) => {
            return tasks.filter((task) => {
                if (documentPath !== null && documentPath !== undefined) {
                    if (task.documentPath !== documentPath) {
                        return false;
                    }
                }

                if (agentKey !== null && agentKey !== undefined) {
                    if (task.agentKey !== agentKey) {
                        return false;
                    }
                }

                if (typeof completed === 'boolean' && task.completed !== completed) {
                    return false;
                }

                if (!tag || tag === 'all') {
                    return true;
                }

                if (task.dueAt === null) {
                    return false;
                }

                if (tag === 'planned') {
                    return task.dueAt > Date.now();
                }

                const now = new Date();
                const endOfToday = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                    23,
                    59,
                    59,
                    999
                ).getTime();
                return task.dueAt <= endOfToday;
            });
        }),
        createTask: vi.fn(async (task: Task) => {
            const created = { ...task, id: 'task-created', createdAt: 2, updatedAt: 2 };
            tasks.push(created);
            return created;
        }),
        updateTask: vi.fn(async (task: Task) => {
            tasks = tasks.map((item) => item.id === task.id ? task : item);
            return task;
        }),
        deleteTask: vi.fn(async (taskId: string) => {
            tasks = tasks.filter((task) => task.id !== taskId);
        }),
        setTaskCompleted: vi.fn(async (taskId: string, completed: boolean) => {
            const updated = tasks.find((task) => task.id === taskId);
            if (!updated) {
                throw new Error('missing task');
            }
            updated.completed = completed;
            updated.completedAt = completed ? 3 : null;
            return updated;
        })
    };

    return {
        __replaceTask: (task: Task) => {
            tasks = tasks.map((item) => item.id === task.id ? task : item);
        },
        __appendTask: (task: Task) => {
            tasks.push(task);
        },
        ...taskProvider
    };
}

describe('TaskListPanel', () => {
    it('loads document-scoped tasks and preserves the current scope on create', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'doc-task',
                title: 'Doc task',
                notes: 'Visible',
                completed: false,
                dueAt: new Date(2026, 4, 24, 9, 30, 0, 0).getTime(),
                priority: 'medium',
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }),
            createTask({
                id: 'other-task',
                title: 'Other task',
                documentPath: '/docs/other.md',
                agentKey: '/docs/'
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }
        });

        await flushPromises();

        expect(wrapper.text()).toContain('Doc task');
        expect(wrapper.text()).not.toContain('Other task');
        await wrapper.get('[data-testid="agent-task-add"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-title"]').setValue('Scoped doc task');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');
        await flushPromises();

        const createTaskCall = (provider.createTask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(createTaskCall).toEqual(expect.objectContaining({
            documentPath: '/docs/guide.md',
            agentKey: '/docs/'
        }));
        resetTaskServiceForTests();
    });

    it('toggles completed tasks and supports task deletion', async () => {
        const provider = createTaskPanelProvider([
            createTask({ id: 'task-open', title: 'Open task', completed: false, agentKey: '/docs/' }),
            createTask({ id: 'task-done', title: 'Done task', completed: true, completedAt: 2, agentKey: '/docs/' })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-complete-task-open"]').trigger('change');
        expect(provider.setTaskCompleted).toHaveBeenCalledWith('task-open', true);

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-completed-toggle"]').trigger('click');
        await wrapper.get('[data-testid="agent-task-completed-menu-task-done"]').trigger('click');
        await wrapper.get('[data-testid="agent-task-delete-completed-task-done"]').trigger('click');
        expect(provider.deleteTask).toHaveBeenCalledWith('task-done');
        resetTaskServiceForTests();
    });

    it('groups planned tasks by date in the global planned view', async () => {
        vi.useFakeTimers();
        const now = new Date();
        vi.setSystemTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0));
        const fixedNow = new Date();
        const provider = createTaskPanelProvider([
            createTask({
                id: 'task-today',
                title: 'Later today',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: new Date(fixedNow.getFullYear(), fixedNow.getMonth(), fixedNow.getDate(), 13, 0, 0, 0).getTime()
            }),
            createTask({
                id: 'task-future',
                title: 'Next week',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: new Date(fixedNow.getFullYear(), fixedNow.getMonth(), fixedNow.getDate() + 7, 9, 0, 0, 0).getTime()
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: null,
                tag: 'planned',
                groupByDate: true
            }
        });

        await flushPromises();

        expect(provider.getTasks).toHaveBeenCalledWith(null, null, false, 'planned', null);
        expect(wrapper.get('[data-testid="task-group-title-' + formatDateKey(fixedNow, 0) + '"]').text()).toContain('Today');
        expect(wrapper.get('[data-testid="task-group-title-' + formatDateKey(fixedNow, 7) + '"]').text()).not.toBe('');
        expect(wrapper.get('[data-testid="agent-task-open-list"]').text()).toContain('Later today');
        expect(wrapper.get('[data-testid="agent-task-open-list"]').text()).toContain('Next week');
        resetTaskServiceForTests();
        vi.useRealTimers();
    });

    it('loads agent-scoped tasks including tasks that are also bound to documents', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'doc-and-agent-task',
                title: 'Doc and agent task',
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }),
            createTask({
                id: 'agent-only-task',
                title: 'Agent only task',
                documentPath: null,
                agentKey: '/docs/'
            }),
            createTask({
                id: 'other-agent-task',
                title: 'Other agent task',
                documentPath: '/other/guide.md',
                agentKey: '/other/'
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: '/docs/'
            }
        });

        await flushPromises();

        expect(provider.getTasks).toHaveBeenCalledWith(null, '/docs/', false, 'all', null);
        expect(wrapper.text()).toContain('Doc and agent task');
        expect(wrapper.text()).toContain('Agent only task');
        expect(wrapper.text()).not.toContain('Other agent task');
        resetTaskServiceForTests();
    });

    it('shows subtle scope metadata for related document and agent or project', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'doc-and-agent-task',
                title: 'Doc and agent task',
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }),
            createTask({
                id: 'doc-only-task',
                title: 'Doc only task',
                documentPath: '/docs/reference.md',
                agentKey: null
            }),
            createTask({
                id: 'agent-only-task',
                title: 'Agent only task',
                documentPath: null,
                agentKey: '/workspace/archive/'
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: null
            }
        });

        await flushPromises();

        expect(wrapper.get('[data-testid="agent-task-scope-footer-document-doc-and-agent-task"]').text()).toBe('guide');
        expect(wrapper.get('[data-testid="agent-task-scope-footer-agent-doc-and-agent-task"]').text()).toBe('docs');
        expect(wrapper.get('[data-testid="agent-task-scope-footer-document-doc-only-task"]').text()).toBe('reference');
        expect(wrapper.find('[data-testid="agent-task-scope-footer-agent-doc-only-task"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="agent-task-scope-footer-agent-agent-only-task"]').text()).toBe('archive');
        expect(wrapper.find('[data-testid="agent-task-scope-footer-document-agent-only-task"]').exists()).toBe(false);
        resetTaskServiceForTests();
    });

    it('places related scope metadata in the footer row beside the due date', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'footer-task',
                title: 'Footer task',
                notes: 'Short note',
                documentPath: '/docs/guide.md',
                agentKey: '/docs/',
                dueAt: new Date(2026, 4, 31, 9, 0, 0, 0).getTime()
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: null
            }
        });

        await flushPromises();

        expect(wrapper.get('[data-testid="agent-task-content-footer-task"]').text()).toContain('Short note');
        expect(wrapper.get('[data-testid="agent-task-scope-meta-footer-footer-task"]').text()).toContain('guide');
        expect(wrapper.get('[data-testid="agent-task-scope-meta-footer-footer-task"]').text()).toContain('docs');
        expect(wrapper.get('[data-testid="agent-task-due-at-footer-task"]').text()).toContain('05/31');
        expect(wrapper.find('[data-testid="agent-task-scope-document-footer-task"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="agent-task-scope-agent-footer-task"]').exists()).toBe(false);
        resetTaskServiceForTests();
    });

    it('sorts tasks by dueAt and places undated tasks after dated tasks', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'task-undated',
                title: 'Undated task',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: null,
                updatedAt: 100
            }),
            createTask({
                id: 'task-later',
                title: 'Later due task',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: new Date(2026, 4, 28, 9, 0, 0, 0).getTime(),
                updatedAt: 1
            }),
            createTask({
                id: 'task-earlier',
                title: 'Earlier due task',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: new Date(2026, 4, 27, 9, 0, 0, 0).getTime(),
                updatedAt: 2
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: '/docs/'
            }
        });

        await flushPromises();

        const taskRows = wrapper.findAll('[data-testid^="agent-task-item-"]');
        expect(taskRows).toHaveLength(3);
        expect(taskRows[0].text()).toContain('Earlier due task');
        expect(taskRows[1].text()).toContain('Later due task');
        expect(taskRows[2].text()).toContain('Undated task');
        resetTaskServiceForTests();
    });

    it('shows synced status after updating a previously unsynced task with a concrete due time', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'task-sync-on-update',
                title: 'Sync on update task',
                documentPath: '/docs/guide.md',
                agentKey: '/docs/',
                dueAt: null,
                calendarEventId: null,
                calendarSyncStatus: null
            })
        ]);

        (provider.updateTask as ReturnType<typeof vi.fn>).mockImplementationOnce(async (task: Task) => {
            const updated = {
                ...task,
                calendarProviderId: 'google-calendar',
                calendarEventId: 'event-1',
                calendarSyncStatus: 'synced' as const,
                calendarLastSyncedAt: 5,
                calendarLastSyncError: null
            };
            (provider as unknown as { __replaceTask: (task: Task) => void }).__replaceTask(updated);
            return updated;
        });

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-content-task-sync-on-update"]').trigger('dblclick');
        await wrapper.get('[data-testid="task-editor-due-at"]').setValue('2026-05-24');
        await wrapper.get('[data-testid="task-editor-time-toggle"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-due-time"]').setValue('09:00');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');
        await flushPromises();

        expect((provider.updateTask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
            dueAt: new Date('2026-05-24T09:00:00').getTime()
        }));
        expect(wrapper.find('[data-testid="agent-task-sync-status-task-sync-on-update"]').exists()).toBe(true);
        resetTaskServiceForTests();
    });

    it('shows synced status for a date-only task after create', async () => {
        const provider = createTaskPanelProvider([]);
        (provider.createTask as ReturnType<typeof vi.fn>).mockImplementationOnce(async (task: Task) => {
            const created = {
                ...task,
                id: 'task-date-only-created',
                createdAt: 2,
                updatedAt: 2,
                calendarProviderId: 'google-calendar',
                calendarEventId: 'event-1',
                calendarSyncStatus: 'synced' as const,
                calendarLastSyncedAt: 5,
                calendarLastSyncError: null
            };
            (provider as unknown as { __appendTask: (task: Task) => void }).__appendTask(created);
            return created;
        });

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-add"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-title"]').setValue('Date-only synced task');
        await wrapper.get('[data-testid="task-editor-due-at"]').setValue('2026-05-24');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');
        await flushPromises();

        expect(wrapper.find('[data-testid="agent-task-sync-status-task-date-only-created"]').exists()).toBe(true);
        resetTaskServiceForTests();
    });

    it('shows overdue tasks in the global today view', async () => {
        const now = new Date();
        const provider = createTaskPanelProvider([
            createTask({
                id: 'task-overdue',
                title: 'Overdue task',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 0, 0, 0).getTime()
            }),
            createTask({
                id: 'task-future',
                title: 'Future task',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0).getTime()
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: null,
                tag: 'today'
            }
        });

        await flushPromises();

        expect(provider.getTasks).toHaveBeenCalledWith(null, null, false, 'today', null);
        expect(wrapper.text()).toContain('Overdue task');
        expect(wrapper.text()).not.toContain('Future task');
        resetTaskServiceForTests();
    });

    it('renders overdue dueAt metadata in red only for overdue open tasks', async () => {
        const now = new Date();
        const provider = createTaskPanelProvider([
            createTask({
                id: 'task-overdue-meta',
                title: 'Overdue meta task',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: now.getTime() - 60_000
            }),
            createTask({
                id: 'task-future-meta',
                title: 'Future meta task',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: now.getTime() + 60_000
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: '/docs/'
            }
        });

        await flushPromises();

        expect(wrapper.get('[data-testid="agent-task-due-at-task-overdue-meta"]').classes()).toContain('task-list-panel__meta--overdue');
        expect(wrapper.get('[data-testid="agent-task-due-at-task-future-meta"]').classes()).not.toContain('task-list-panel__meta--overdue');
        resetTaskServiceForTests();
    });

    it('shows only the first notes line in the list while preserving full multi-line notes in edit mode', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'task-multiline-notes',
                title: 'Task with multiline notes',
                notes: 'First line preview\nSecond line details\nThird line details',
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            })
        ]);

        setTaskServiceForTests(provider);
        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }
        });

        await flushPromises();

        expect(wrapper.text()).toContain('First line preview');
        expect(wrapper.text()).not.toContain('Second line details');
        expect(wrapper.text()).not.toContain('Third line details');

        await wrapper.get('[data-testid="agent-task-content-task-multiline-notes"]').trigger('dblclick');

        const notesEditor = wrapper.get('[data-testid="task-editor-notes"]');
        expect((notesEditor.element as HTMLTextAreaElement).value).toBe('First line preview\nSecond line details\nThird line details');
        resetTaskServiceForTests();
    });
});

function formatDateKey(base: Date, dayOffset: number): string {
    const target = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, 0, 0, 0, 0);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
