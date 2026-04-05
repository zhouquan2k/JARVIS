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

export function shouldUseMockWebSync(env: AppEnv): boolean {
    const explicit = readBooleanEnv(env, 'VITE_USE_MOCK_SYNC');
    if (explicit !== null) {
        return explicit;
    }

    return env.VITE_E2E === '1';
}

export interface CreateWebSyncStorageProviderOptions {
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
    env?: AppEnv;
    isDevelopment?: boolean;
    localStore?: IConversationPersistProvider;
    fetchImpl?: typeof fetch;
    stateStore?: SyncStateStore;
    deletedConversationStore?: DeletedConversationStateStore;
}

export function createWebSyncStorageProvider(options: CreateWebSyncStorageProviderOptions = {}) {
    const env = options.env ?? {};
    const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const syncKey = resolveSyncKey({
        storage,
        env,
        isDevelopment: options.isDevelopment
    });

    return new SyncStorageProvider({
        localStore: options.localStore ?? new IndexedDBStorageProvider(),
        transport: shouldUseMockWebSync(env)
            ? createMockSyncTransport(syncKey, { storage })
            : new FetchSyncTransport({
                syncKey,
                baseUrl: resolveSyncBaseUrl({ env }),
                fetchImpl: options.fetchImpl
            }),
        syncKey,
        stateStore: options.stateStore,
        deletedConversationStore: options.deletedConversationStore
    });
}
