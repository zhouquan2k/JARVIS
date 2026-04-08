export type ChatRoutePath = '/' | '/knowledge' | '/chat' | '/compare';

export interface ChatRoute {
  path: ChatRoutePath;
  name: 'normal-chat' | 'knowledge-workspace' | 'compare-chat';
  label: string;
}

export const CHAT_ROUTES: ChatRoute[] = [
  {
    path: '/',
    name: 'knowledge-workspace',
    label: '工作区'
  },
  {
    path: '/chat',
    name: 'normal-chat',
    label: '对话'
  },
  {
    path: '/compare',
    name: 'compare-chat',
    label: '对比聊天'
  }
];

export const PRIMARY_WORKSPACE_ROUTES: ChatRoute[] = CHAT_ROUTES.filter((route) => {
  return route.path === '/' || route.path === '/chat';
});
