export type ChatRoutePath = '/' | '/knowledge' | '/chat' | '/compare';

export interface ChatRoute {
  path: ChatRoutePath;
  name: 'normal-chat' | 'knowledge-workspace' | 'compare-chat';
  label: string;
  labelKey?: 'routes.knowledgeWorkspace' | 'routes.normalChat' | 'routes.compareChat';
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
  }
];

export const PRIMARY_WORKSPACE_ROUTES: ChatRoute[] = CHAT_ROUTES.filter((route) => {
  return route.path === '/' || route.path === '/chat';
});
