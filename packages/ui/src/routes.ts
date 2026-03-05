import type { Component } from 'vue';
import CompareChatView from './views/CompareChatView.vue';
import NormalChatView from './views/NormalChatView.vue';

export type ChatRoutePath = '/' | '/compare';

export interface ChatRoute {
  path: ChatRoutePath;
  name: 'normal-chat' | 'compare-chat';
  component: Component;
  label: string;
}

export const CHAT_ROUTES: ChatRoute[] = [
  {
    path: '/',
    name: 'normal-chat',
    component: NormalChatView,
    label: '普通聊天'
  },
  {
    path: '/compare',
    name: 'compare-chat',
    component: CompareChatView,
    label: '对比聊天'
  }
];
