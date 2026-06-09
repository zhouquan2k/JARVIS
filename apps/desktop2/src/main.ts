import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createWorkspaceI18n } from '@packages/ui';
import '../../../packages/ui/src/theme/host-base.css';
import App from './App.vue';

const app = createApp(App);
app.use(createWorkspaceI18n({
  storage: typeof localStorage !== 'undefined' ? localStorage : undefined
}));
const pinia = createPinia();
app.use(pinia);
// In e2e mode, expose the Pinia instance so tests can drive store actions
// (e.g. switching providers) deterministically, bypassing UI disabled/async-init races.
if (import.meta.env.VITE_E2E === '1') {
  (window as unknown as { __pinia?: unknown }).__pinia = pinia;
}
app.mount('#app');
