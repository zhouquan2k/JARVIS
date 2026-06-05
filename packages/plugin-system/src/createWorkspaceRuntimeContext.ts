import type {
    WorkspaceErrorSource,
    WorkspaceHostEvent,
    WorkspacePluginMessage,
    WorkspaceRuntimeContext,
    WorkspaceRouteNavigationInput,
    WorkspaceSelectionChangedEvent
} from '@packages/core';

export function createWorkspaceRuntimeContext(): WorkspaceRuntimeContext {
    const errorSources: WorkspaceErrorSource[] = [];
    const beforeRouteNavigateHandlers: Array<(input: WorkspaceRouteNavigationInput) => Promise<void> | void> = [];
    const workspaceSelectionChangedHandlers: Array<(input: WorkspaceSelectionChangedEvent) => Promise<void> | void> = [];
    const pluginMessages = new Map<string, WorkspacePluginMessage>();
    const pluginMessageListeners = new Set<(messages: readonly WorkspacePluginMessage[]) => void>();
    const hostEventListeners = new Set<(event: WorkspaceHostEvent) => void>();

    const notifyPluginMessageListeners = () => {
        const snapshot = [...pluginMessages.values()];
        for (const listener of pluginMessageListeners) {
            listener(snapshot);
        }
    };

    const context: WorkspaceRuntimeContext = {
        get currentError() {
            for (let index = errorSources.length - 1; index >= 0; index -= 1) {
                const currentError = errorSources[index]?.getCurrentError() ?? null;
                if (currentError) {
                    return currentError;
                }
            }

            return null;
        },
        clearCurrentError() {
            for (let index = errorSources.length - 1; index >= 0; index -= 1) {
                const source = errorSources[index];
                if (source?.getCurrentError()) {
                    source.clearCurrentError();
                    return;
                }
            }
        },
        async beforeRouteNavigate(input) {
            for (const handler of beforeRouteNavigateHandlers) {
                await handler(input);
            }
        },
        async publishWorkspaceSelectionChanged(input) {
            for (const handler of workspaceSelectionChangedHandlers) {
                await handler(input);
            }
        },
        registerCurrentErrorSource(source) {
            errorSources.push(source);
            return () => {
                const index = errorSources.indexOf(source);
                if (index >= 0) {
                    errorSources.splice(index, 1);
                }
            };
        },
        registerBeforeRouteNavigateHandler(handler) {
            beforeRouteNavigateHandlers.push(handler);
            return () => {
                const index = beforeRouteNavigateHandlers.indexOf(handler);
                if (index >= 0) {
                    beforeRouteNavigateHandlers.splice(index, 1);
                }
            };
        },
        registerWorkspaceSelectionChangedHandler(handler) {
            workspaceSelectionChangedHandlers.push(handler);
            return () => {
                const index = workspaceSelectionChangedHandlers.indexOf(handler);
                if (index >= 0) {
                    workspaceSelectionChangedHandlers.splice(index, 1);
                }
            };
        },
        getPluginMessages() {
            return [...pluginMessages.values()];
        },
        subscribePluginMessages(listener) {
            pluginMessageListeners.add(listener);
            listener([...pluginMessages.values()]);
            return () => {
                pluginMessageListeners.delete(listener);
            };
        },
        postPluginMessage(message) {
            if (!message) {
                return;
            }

            if (message.message.trim().length === 0) {
                pluginMessages.delete(message.id);
            } else {
                pluginMessages.set(message.id, message);
            }
            notifyPluginMessageListeners();
        },
        postHostEvent(event) {
            for (const listener of hostEventListeners) {
                listener(event);
            }
        },
        subscribeHostEvent(listener) {
            hostEventListeners.add(listener);
            return () => {
                hostEventListeners.delete(listener);
            };
        }
    };

    return context;
}
