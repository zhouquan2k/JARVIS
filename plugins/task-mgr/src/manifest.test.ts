import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerTaskService = vi.fn();

vi.mock('./taskServiceRegistry', () => ({
    getTaskService: vi.fn(),
    registerTaskService
}));

describe('taskMgrPlugin', () => {
    beforeEach(() => {
        registerTaskService.mockReset();
    });

    it('passes desktop runtime sync env into the replica task service registration', async () => {
        const { taskMgrPlugin } = await import('./manifest');
        const fetchImpl = vi.fn() as unknown as typeof fetch;

        taskMgrPlugin.setup({
            registerGlobalView() {},
            registerRightPanelTab() {},
            registerWorkspaceSelectionView() {},
            registerInsertLinkType() {},
            registerDocumentImport() {},
            registerLanguageModel() {},
            registerNodePresentation() {},
            getContributionQuery() {
                return {} as never;
            },
            getRuntimeContext() {
                return {} as never;
            },
            getHostContext() {
                return {
                    environment: {
                        platform: 'desktop',
                        contextBaseUrl: 'https://hub.example/api/context'
                    },
                    hasCapability() {
                        return true;
                    },
                    getCapability(capability: string) {
                        if (capability === 'http-client') {
                            return fetchImpl;
                        }
                        if (capability === 'message-port') {
                            return {
                                runtimeEnv: {
                                    syncKey: 'desktop-e2e'
                                }
                            };
                        }
                        return null;
                    }
                } as never;
            }
        });

        expect(registerTaskService).toHaveBeenCalledWith({
            baseUrl: 'https://hub.example/api/context',
            syncBaseUrl: 'https://hub.example/api/sync',
            env: {
                CHATPRISM_SYNC_KEY: 'desktop-e2e'
            },
            fetchImpl
        });
    });
});
