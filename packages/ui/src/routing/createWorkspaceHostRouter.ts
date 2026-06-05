import { computed, ref, type ComputedRef } from 'vue';
import { CHAT_ROUTES, type ChatRoutePath } from '../routes';

export interface WorkspaceHostRouter {
    currentRoute: ComputedRef<(typeof CHAT_ROUTES)[number]>;
    navigateTo(path: ChatRoutePath): void;
    isRouteActive(path: ChatRoutePath): boolean;
}

export interface CreateWorkspaceHostRouterOptions {
    readHash?: () => string;
    writeHash?: (hash: string) => void;
    subscribeHashChange?: (listener: () => void) => () => void;
}

function normalizeHash(hash: string): ChatRoutePath {
    const normalized = hash.replace(/^#/, '') || '/';
    if (normalized === '/compare') {
        return '/compare';
    }
    if (normalized === '/chat') {
        return '/chat';
    }
    if (normalized === '/all-tasks') {
        return '/all-tasks';
    }
    if (normalized === '/knowledge') {
        return '/';
    }
    return '/';
}

export function createWorkspaceHostRouter(options: CreateWorkspaceHostRouterOptions = {}): WorkspaceHostRouter {
    const readHash = options.readHash ?? (() => (typeof window === 'undefined' ? '' : window.location.hash));
    const writeHash = options.writeHash ?? ((hash: string) => {
        if (typeof window !== 'undefined') {
            window.location.hash = hash;
        }
    });
    const subscribeHashChange = options.subscribeHashChange ?? ((listener: () => void) => {
        if (typeof window === 'undefined') {
            return () => undefined;
        }

        window.addEventListener('hashchange', listener);
        return () => {
            window.removeEventListener('hashchange', listener);
        };
    });

    const syncHash = (path: ChatRoutePath) => {
        const targetHash = `#${path}`;
        if (readHash() !== targetHash) {
            writeHash(targetHash);
        }
    };

    const currentPath = ref<ChatRoutePath>(normalizeHash(readHash()));

    if (!readHash()) {
        syncHash(currentPath.value);
    }

    subscribeHashChange(() => {
        currentPath.value = normalizeHash(readHash());
    });

    return {
        currentRoute: computed(() => {
            return CHAT_ROUTES.find((route) => route.path === currentPath.value) ?? CHAT_ROUTES[0];
        }),
        navigateTo(path) {
            currentPath.value = path;
            syncHash(path);
        },
        isRouteActive(path) {
            return currentPath.value === path;
        }
    };
}
