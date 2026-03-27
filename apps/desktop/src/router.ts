import { computed, ref } from 'vue';
import { CHAT_ROUTES, type ChatRoutePath } from '@packages/ui';

function normalizeHash(hash: string): ChatRoutePath {
    const normalized = hash.replace(/^#/, '') || '/';
    if (normalized === '/compare') {
        return '/compare';
    }
    if (normalized === '/chat') {
        return '/chat';
    }
    if (normalized === '/knowledge') {
        return '/';
    }
    return '/';
}

function syncHash(path: ChatRoutePath) {
    const targetHash = `#${path}`;
    if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
    }
}

const currentPath = ref<ChatRoutePath>(
    typeof window === 'undefined' ? '/' : normalizeHash(window.location.hash)
);

if (typeof window !== 'undefined') {
    if (!window.location.hash) {
        syncHash(currentPath.value);
    }

    window.addEventListener('hashchange', () => {
        currentPath.value = normalizeHash(window.location.hash);
    });
}

export const currentRoute = computed(() => {
    return CHAT_ROUTES.find((route) => route.path === currentPath.value) ?? CHAT_ROUTES[0];
});

export function navigateTo(path: ChatRoutePath) {
    currentPath.value = path;
    if (typeof window !== 'undefined') {
        syncHash(path);
    }
}
