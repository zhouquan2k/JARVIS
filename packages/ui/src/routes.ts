export type ChatRoutePath = '/' | '/knowledge' | '/chat' | '/compare' | '/all-tasks';

export interface ChatRoute {
  path: ChatRoutePath;
  name: 'normal-chat' | 'knowledge-workspace' | 'compare-chat' | 'all-tasks';
  label: string;
  labelKey?: 'routes.knowledgeWorkspace' | 'routes.normalChat' | 'routes.compareChat' | 'routes.allTasks';
}

export const CHAT_ROUTES: ChatRoute[] = [
  {
    path: '/',
    name: 'knowledge-workspace',
    label: 'Workspace',
    labelKey: 'routes.knowledgeWorkspace'
  },
  {
    path: '/chat',
    name: 'normal-chat',
    label: 'Chat',
    labelKey: 'routes.normalChat'
  },
  {
    path: '/compare',
    name: 'compare-chat',
    label: 'Compare Chat',
    labelKey: 'routes.compareChat'
  },
  {
    path: '/all-tasks',
    name: 'all-tasks',
    label: 'All Tasks',
    labelKey: 'routes.allTasks'
  }
];

export const PRIMARY_WORKSPACE_ROUTES: ChatRoute[] = CHAT_ROUTES.filter((route) => {
  return route.path === '/' || route.path === '/all-tasks' || route.path === '/chat';
}).sort((left, right) => {
  const order: Record<ChatRoutePath, number> = {
    '/': 0,
    '/all-tasks': 1,
    '/chat': 2,
    '/compare': 3,
    '/knowledge': 4
  };

  return order[left.path] - order[right.path];
});
