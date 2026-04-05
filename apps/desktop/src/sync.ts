import type { DeletedConversationStateStore, IConversationPersistProvider, SyncStateStore } from '@packages/core/src';
import {
    createMockSyncTransport,
    FetchSyncTransport,
    IndexedDBStorageProvider,
    resolveSyncBaseUrl,
    resolveSyncKey,
    SyncStorageProvider
} from '@packages/core/src';

type AppEnv = Record<string, string | undefined>;

function readBooleanEnv(env: AppEnv, key: string): boolean | null {
    const value = env[key];
    if (value === '1') {
        return true;
    }

    if (value === '0') {
        return false;
    }

    return null;
}

export function shouldUseMockDesktopSync(env: AppEnv): boolean {
    const explicit = readBooleanEnv(env, 'VITE_USE_MOCK_SYNC');
    if (explicit !== null) {
        return explicit;
    }

    return env.VITE_E2E === '1';
}

export interface CreateDesktopSyncStorageProviderOptions {
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
    env?: AppEnv;
    isDevelopment?: boolean;
    localStore?: IConversationPersistProvider;
    fetchImpl?: typeof fetch;
    stateStore?: SyncStateStore;
    deletedConversationStore?: DeletedConversationStateStore;
}

export function createDesktopSyncStorageProvider(options: CreateDesktopSyncStorageProviderOptions = {}) {
    const env = options.env ?? {};
    const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const useMockSync = shouldUseMockDesktopSync(env);
    const syncEnv = useMockSync && !env.VITE_SYNC_KEY && !env.CHATPRISM_SYNC_KEY
        ? {
            ...env,
            VITE_SYNC_KEY: 'desktop-e2e'
        }
        : env;
    const syncKey = resolveSyncKey({
        storage,
        env: syncEnv,
        isDevelopment: options.isDevelopment
    });

    return new SyncStorageProvider({
        localStore: options.localStore ?? new IndexedDBStorageProvider(),
        transport: useMockSync
            ? createMockSyncTransport(syncKey, { storage })
            : new FetchSyncTransport({
                syncKey,
                baseUrl: resolveSyncBaseUrl({ env: syncEnv }),
                fetchImpl: options.fetchImpl
            }),
        syncKey,
        stateStore: options.stateStore,
        deletedConversationStore: options.deletedConversationStore
    });
}
