import { createWorkspaceHostRouter, type ChatRoutePath } from '@packages/ui';

const router = createWorkspaceHostRouter();

export const currentRoute = router.currentRoute;

export function navigateTo(path: ChatRoutePath) {
    router.navigateTo(path);
}
