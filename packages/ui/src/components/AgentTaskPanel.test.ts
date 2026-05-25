// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { IContextProvider, Task } from '@packages/core/src';
import AgentTaskPanel from './AgentTaskPanel.vue';

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
        getTasks: vi.fn(async (documentPath?: string | null, agentKey?: string | null, completed?: boolean) => {
            return tasks.filter((task) => {
                if (documentPath) {
                    return task.documentPath === documentPath
                        && (agentKey == null || task.agentKey === agentKey)
                        && task.completed === completed;
                }

                if (agentKey) {
                    return task.agentKey === agentKey && task.completed === completed;
                }

                return task.agentKey === agentKey && task.completed === completed;
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

describe('AgentTaskPanel', () => {
    it('loads document-scoped tasks and hides project-scoped tasks', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'doc-task',
                title: 'Doc task',
                notes: 'Visible',
                completed: false,
                dueAt: new Date('2026-05-24T09:30').getTime(),
                priority: 'medium',
                documentPath: '/docs/guide.md',
                agentKey: '/docs/',
            }),
            createTask({
                id: 'project-task',
                title: 'Project task',
                documentPath: null,
                agentKey: '/docs/'
            })
        ]);

        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeAgentKey: '/docs/',
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: provider
            }
        });

        await flushPromises();

        expect(wrapper.text()).toContain('Doc task');
        expect(wrapper.text()).not.toContain('Project task');
        expect(wrapper.get('[data-testid="agent-task-due-at-doc-task"]').exists()).toBe(true);
    });

    it('renders due date without time when dueAt is midnight', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'midnight-task',
                title: 'Midnight task',
                notes: 'First line\nSecond line',
                completed: false,
                dueAt: new Date(2026, 4, 24, 0, 0, 0, 0).getTime(),
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            })
        ]);

        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeAgentKey: '/docs/',
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: provider
            }
        });

        await flushPromises();

        const dueAtText = wrapper.get('[data-testid="agent-task-due-at-midnight-task"]').text();
        expect(dueAtText).toBe('05/24');
        expect(wrapper.get('.agent-task-panel__notes').text()).toBe('First line\nSecond line');
    });

    it('renders due date with time when dueAt includes a non-zero time', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'timed-task',
                title: 'Timed task',
                dueAt: new Date(2026, 4, 24, 9, 30, 0, 0).getTime(),
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            })
        ]);

        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeAgentKey: '/docs/',
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: provider
            }
        });

        await flushPromises();

        expect(wrapper.get('[data-testid="agent-task-due-at-timed-task"]').text()).toBe('05/24 09:30');
        expect(wrapper.get('[data-testid="agent-task-item-timed-task"]').classes()).toContain('agent-task-panel__item--with-meta');
        expect(wrapper.get('[data-testid="agent-task-item-timed-task"] > [data-testid=\"agent-task-due-at-timed-task\"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-task-content-timed-task"]').find('[data-testid="agent-task-due-at-timed-task"]').exists()).toBe(false);
    });

    it('renders calendar sync status dots for synced and failed tasks', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'synced-task',
                title: 'Synced task',
                documentPath: '/docs/guide.md',
                calendarSyncStatus: 'synced'
            }),
            createTask({
                id: 'failed-task',
                title: 'Failed task',
                documentPath: '/docs/guide.md',
                calendarSyncStatus: 'failed'
            }),
            createTask({
                id: 'plain-task',
                title: 'Plain task',
                documentPath: '/docs/guide.md',
                calendarSyncStatus: null
            })
        ]);

        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: provider
            }
        });

        await flushPromises();

        expect(wrapper.get('[data-testid="agent-task-sync-status-synced-task"]').classes()).toContain('agent-task-panel__sync-status--synced');
        expect(wrapper.get('[data-testid="agent-task-sync-status-failed-task"]').classes()).toContain('agent-task-panel__sync-status--failed');
        expect(wrapper.find('[data-testid="agent-task-sync-status-plain-task"]').exists()).toBe(false);
    });

    it('loads agent-scoped tasks together with child document tasks', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'doc-task',
                title: 'Doc task',
                documentPath: '/docs/guide.md',
                agentKey: '/docs/'
            }),
            createTask({
                id: 'agent-task',
                title: 'Agent task',
                documentPath: null,
                agentKey: '/docs/'
            })
        ]);

        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeAgentKey: '/docs/',
                contextProvider: provider
            }
        });

        await flushPromises();

        expect(wrapper.text()).toContain('Doc task');
        expect(wrapper.text()).toContain('Agent task');
    });

    it('creates a document task with the current agent key preserved', async () => {
        const provider = createTaskPanelProvider([]);
        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeAgentKey: '/docs/',
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: provider
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-add"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-title"]').setValue('Scoped doc task');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');
        await flushPromises();

        const createTask = provider.getTaskProvider().createTask as ReturnType<typeof vi.fn>;
        expect(createTask.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
            documentPath: '/docs/guide.md',
            agentKey: '/docs/'
        }));
    });

    it('creates, completes, reopens, and deletes tasks inline', async () => {
        const provider = createTaskPanelProvider([]);
        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeAgentKey: '/docs/',
                selectedNodePath: '/docs',
                contextProvider: provider
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-add"]').trigger('click');
        await wrapper.get('[data-testid="task-editor-title"]').setValue('Project follow-up');
        await wrapper.get('[data-testid="task-editor-save"]').trigger('submit');
        await flushPromises();

        expect(wrapper.text()).toContain('Project follow-up');

        await wrapper.get('[data-testid="agent-task-complete-task-created"]').setValue(true);
        await flushPromises();
        expect(wrapper.text()).not.toContain('Project follow-up');

        await wrapper.get('[data-testid="agent-task-completed-toggle"]').trigger('click');
        await flushPromises();
        expect(wrapper.get('[data-testid="agent-task-completed-list"]').text()).toContain('Project follow-up');

        await wrapper.get('[data-testid="agent-task-reopen-task-created"]').setValue(false);
        await flushPromises();
        expect(wrapper.text()).toContain('Project follow-up');

        await wrapper.get('[data-testid="agent-task-menu-task-created"]').trigger('click');
        await wrapper.get('[data-testid="agent-task-delete-task-created"]').trigger('click');
        await flushPromises();
        expect(wrapper.text()).not.toContain('Project follow-up');
    });

    it('opens row actions from an overflow menu while keeping the task row compact', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'doc-task',
                title: 'Doc task',
                documentPath: '/docs/guide.md',
                agentKey: null
            })
        ]);

        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: provider
            }
        });

        await flushPromises();
        expect(wrapper.find('[data-testid="agent-task-menu-panel-doc-task"]').exists()).toBe(false);

        await wrapper.get('[data-testid="agent-task-menu-doc-task"]').trigger('click');
        expect(wrapper.find('[data-testid="agent-task-menu-panel-doc-task"]').exists()).toBe(true);
        expect(wrapper.findAll('.agent-task-panel__menu-trigger')).toHaveLength(1);
    });

    it('renders completed section as a disclosure toggle', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'done-task',
                title: 'Done task',
                completed: true,
                documentPath: '/docs/guide.md',
                agentKey: null,
                completedAt: 2
            })
        ]);

        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: provider
            }
        });

        await flushPromises();
        const toggle = wrapper.get('[data-testid="agent-task-completed-toggle"]');
        expect(toggle.attributes('aria-expanded')).toBe('false');

        await toggle.trigger('click');
        expect(toggle.attributes('aria-expanded')).toBe('true');
    });

    it('enters edit mode when double-clicking an open task row', async () => {
        const provider = createTaskPanelProvider([
            createTask({
                id: 'doc-task',
                title: 'Doc task',
                notes: 'Visible',
                documentPath: '/docs/guide.md',
                agentKey: null
            })
        ]);

        const wrapper = mount(AgentTaskPanel, {
            props: {
                activeDocument: { path: '/docs/guide.md' },
                contextProvider: provider
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-task-content-doc-task"]').trigger('dblclick');

        expect(wrapper.find('[data-testid="task-editor-inline"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="agent-task-item-doc-task"]').exists()).toBe(false);
        expect((wrapper.get('[data-testid="task-editor-title"]').element as HTMLInputElement).value).toBe('Doc task');
    });
});
