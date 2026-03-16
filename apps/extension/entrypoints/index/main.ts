import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '../../../../packages/ui/src/theme/host-base.css';
import App from '../../src/App.vue';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
