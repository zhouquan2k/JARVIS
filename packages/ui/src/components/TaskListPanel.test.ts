// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { IContextProvider, Task, TaskQueryTag } from '@packages/core/src';
import TaskListPanel from './TaskListPanel.vue';

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

function createTaskPanelProvider(initialTasks: Task[]): IContextProvider {
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
        id: 'task-context',
        __replaceTask: (task: Task) => {
            tasks = tasks.map((item) => item.id === task.id ? task : item);
        },
        __appendTask: (task: Task) => {
            tasks.push(task);
        },
        initializeAccess: vi.fn(),
        getContext: vi.fn(),
        getConversations: vi.fn(),
        getTaskProvider: () => taskProvider,
        getProjectDocuments: vi.fn(),
        readDocument: vi.fn(),
        writeDocument: vi.fn(),
        createNode: vi.fn(),
        deleteNode: vi.fn(),
        renameNode: vi.fn(),
        searchInScope: vi.fn()
    } as unknown as IContextProvider;
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

        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/',
                contextProvider: provider
            }
        });

        await flushPromises();

        expect(wrapper.text()).toContain('Doc task');
        expect(wrapper.text()).not.toContain('Other task');
        await wrapper.get('[data-testid="agent-task-add"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-title"]').setValue('Scoped doc task');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');
        await flushPromises();

        const createTaskCall = (provider.getTaskProvider().createTask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
        expect(createTaskCall).toEqual(expect.objectContaining({
            documentPath: '/docs/guide.md',
            agentKey: '/docs/'
        }));
    });

    it('toggles completed tasks and supports task deletion', async () => {
        const provider = createTaskPanelProvider([
            createTask({ id: 'task-open', title: 'Open task', completed: false, agentKey: '/docs/' }),
            createTask({ id: 'task-done', title: 'Done task', completed: true, completedAt: 2, agentKey: '/docs/' })
        ]);

        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/',
                contextProvider: provider
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-complete-task-open"]').trigger('change');
        expect(provider.getTaskProvider().setTaskCompleted).toHaveBeenCalledWith('task-open', true);

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-completed-toggle"]').trigger('click');
        await wrapper.get('[data-testid="agent-task-completed-menu-task-done"]').trigger('click');
        await wrapper.get('[data-testid="agent-task-delete-completed-task-done"]').trigger('click');
        expect(provider.getTaskProvider().deleteTask).toHaveBeenCalledWith('task-done');
    });

    it('groups planned tasks by date in the global planned view', async () => {
        const now = new Date();
        const provider = createTaskPanelProvider([
            createTask({
                id: 'task-today',
                title: 'Later today',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0).getTime()
            }),
            createTask({
                id: 'task-future',
                title: 'Next week',
                documentPath: null,
                agentKey: '/docs/',
                dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 9, 0, 0, 0).getTime()
            })
        ]);

        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: null,
                tag: 'planned',
                groupByDate: true,
                contextProvider: provider
            }
        });

        await flushPromises();

        expect(provider.getTaskProvider().getTasks).toHaveBeenCalledWith(null, null, false, 'planned');
        expect(wrapper.get('[data-testid="task-group-title-' + formatDateKey(now, 0) + '"]').text()).toContain('Today');
        expect(wrapper.get('[data-testid="task-group-title-' + formatDateKey(now, 7) + '"]').text()).not.toBe('');
        expect(wrapper.get('[data-testid="agent-task-open-list"]').text()).toContain('Later today');
        expect(wrapper.get('[data-testid="agent-task-open-list"]').text()).toContain('Next week');
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

        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: '/docs/',
                contextProvider: provider
            }
        });

        await flushPromises();

        expect(provider.getTaskProvider().getTasks).toHaveBeenCalledWith(null, '/docs/', false, 'all');
        expect(wrapper.text()).toContain('Doc and agent task');
        expect(wrapper.text()).toContain('Agent only task');
        expect(wrapper.text()).not.toContain('Other agent task');
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

        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: '/docs/',
                contextProvider: provider
            }
        });

        await flushPromises();

        const taskRows = wrapper.findAll('[data-testid^="agent-task-item-"]');
        expect(taskRows).toHaveLength(3);
        expect(taskRows[0].text()).toContain('Earlier due task');
        expect(taskRows[1].text()).toContain('Later due task');
        expect(taskRows[2].text()).toContain('Undated task');
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

        (provider.getTaskProvider().updateTask as ReturnType<typeof vi.fn>).mockImplementationOnce(async (task: Task) => {
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

        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/',
                contextProvider: provider
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-content-task-sync-on-update"]').trigger('dblclick');
        await wrapper.get('[data-testid="task-editor-due-at"]').setValue('2026-05-24');
        await wrapper.get('[data-testid="task-editor-time-toggle"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-due-time"]').setValue('09:00');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');
        await flushPromises();

        expect((provider.getTaskProvider().updateTask as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
            dueAt: new Date('2026-05-24T09:00:00').getTime()
        }));
        expect(wrapper.find('[data-testid="agent-task-sync-status-task-sync-on-update"]').exists()).toBe(true);
    });

    it('shows synced status for a date-only task after create', async () => {
        const provider = createTaskPanelProvider([]);
        (provider.getTaskProvider().createTask as ReturnType<typeof vi.fn>).mockImplementationOnce(async (task: Task) => {
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

        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: '/docs/guide.md',
                agentKey: '/docs/',
                contextProvider: provider
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-add"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-title"]').setValue('Date-only synced task');
        await wrapper.get('[data-testid="task-editor-due-at"]').setValue('2026-05-24');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');
        await flushPromises();

        expect(wrapper.find('[data-testid="agent-task-sync-status-task-date-only-created"]').exists()).toBe(true);
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

        const wrapper = mount(TaskListPanel, {
            props: {
                documentPath: null,
                agentKey: null,
                tag: 'today',
                contextProvider: provider
            }
        });

        await flushPromises();

        expect(provider.getTaskProvider().getTasks).toHaveBeenCalledWith(null, null, false, 'today');
        expect(wrapper.text()).toContain('Overdue task');
        expect(wrapper.text()).not.toContain('Future task');
    });
});

function formatDateKey(base: Date, dayOffset: number): string {
    const target = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, 0, 0, 0, 0);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
