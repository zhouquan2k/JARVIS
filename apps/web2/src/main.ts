import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createWorkspaceI18n } from '@packages/ui';
import { registerSW } from 'virtual:pwa-register';
import '../../../packages/ui/src/theme/host-base.css';
import App from './App.vue';

if (typeof window !== 'undefined') {
  registerSW({ immediate: true });
}

const app = createApp(App);
const pinia = createPinia();
app.use(createWorkspaceI18n({
  storage: typeof localStorage !== 'undefined' ? localStorage : undefined
}));
app.use(pinia);

app.mount('#app');
