import type { PluginManifest } from '@packages/core';
import AgentTaskPanel from './components/AgentTaskPanel.vue';
import AllTasksWorkspaceView from './views/AllTasksWorkspaceView.vue';
import { getTaskService, registerTaskService } from './taskServiceRegistry';

function resolveTaskContextBaseUrl(api: Parameters<PluginManifest['setup']>[0]): string | undefined {
    return api.getHostContext().environment.contextBaseUrl?.trim() || undefined;
}

export const taskMgrPlugin: PluginManifest = {
    id: 'task-mgr',
    name: 'Task Manager',
    version: '1.0.0',
    defaultEnabled: true,
    setup(api) {
        registerTaskService({
            baseUrl: resolveTaskContextBaseUrl(api)
        });
        api.registerGlobalView({
            id: 'all-tasks',
            routePath: '/all-tasks',
            routeName: 'all-tasks',
            label: 'All Tasks',
            labelKey: 'routes.allTasks',
            workspaceMode: 'conversation',
            component: AllTasksWorkspaceView,
            order: 10
        });
        api.registerRightPanelTab({
            id: 'tasks',
            title: 'Tasks',
            titleKey: 'shared.taskTab',
            component: AgentTaskPanel,
            order: 10,
            defaultActive: true,
            async getBadgeCount(input) {
                const contextProvider = input.contextProvider;
                const documentPath = input.activeDocument?.path?.trim() || null;
                const documentId = input.activeDocument?.documentId;
                const agentKey = input.activeScopeKey?.trim() || null;
                if (!contextProvider || (!documentPath && !agentKey)) {
                    return 0;
                }

                try {
                    const openTasks = await getTaskService().getTasks(documentPath, agentKey, false, 'all', documentId);
                    return openTasks.length;
                } catch {
                    return 0;
                }
            }
        });
    }
};
