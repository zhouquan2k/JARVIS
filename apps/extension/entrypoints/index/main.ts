import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createWorkspaceI18n } from '@packages/ui';
import '../../../../packages/ui/src/theme/host-base.css';
import App from '../../src/App.vue';

const app = createApp(App);
app.use(createWorkspaceI18n({
  storage: typeof localStorage !== 'undefined' ? localStorage : undefined
}));
app.use(createPinia());
app.mount('#app');
