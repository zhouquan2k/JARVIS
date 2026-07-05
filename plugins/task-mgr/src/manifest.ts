import type { PluginManifest } from '@packages/core';
import AgentTaskPanel from './components/AgentTaskPanel.vue';
import AllTasksWorkspaceView from './views/AllTasksWorkspaceView.vue';
import { getTaskService, registerTaskService } from './taskServiceRegistry';

type DesktopTaskRuntimeBridge = {
    runtimeEnv?: {
        syncKey?: string;
    };
};

function resolveTaskContextBaseUrl(api: Parameters<PluginManifest['setup']>[0]): string | undefined {
    return api.getHostContext().environment.contextBaseUrl?.trim() || undefined;
}

function resolveTaskSyncBaseUrl(api: Parameters<PluginManifest['setup']>[0]): string | undefined {
    const contextBaseUrl = resolveTaskContextBaseUrl(api);
    if (!contextBaseUrl?.endsWith('/api/context')) {
        return undefined;
    }

    return `${contextBaseUrl.slice(0, -'/api/context'.length)}/api/sync`;
}

function resolveTaskRuntimeEnv(api: Parameters<PluginManifest['setup']>[0]): Record<string, string | undefined> | undefined {
    const bridge = api.getHostContext().getCapability<DesktopTaskRuntimeBridge>('message-port');
    const syncKey = bridge?.runtimeEnv?.syncKey?.trim();

    if (!syncKey) {
        return undefined;
    }

    return {
        CHATPRISM_SYNC_KEY: syncKey
    };
}

export const taskMgrPlugin: PluginManifest = {
    id: 'task-mgr',
    name: 'Task Manager',
    version: '1.0.0',
    defaultEnabled: true,
    setup(api) {
        const fetchImpl = api.getHostContext().getCapability<typeof fetch>('http-client') ?? undefined;
        registerTaskService({
            baseUrl: resolveTaskContextBaseUrl(api),
            syncBaseUrl: resolveTaskSyncBaseUrl(api),
            env: resolveTaskRuntimeEnv(api),
            fetchImpl
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
