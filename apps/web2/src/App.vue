<template>
  <div class="web2-app-shell">
    <div
      v-if="offlineSupportWarning"
      class="web2-offline-warning"
      data-testid="web2-offline-warning"
      role="alert"
    >
      {{ offlineSupportWarning }}
    </div>
    <BuiltinWorkspaceHostApp
      :current-route-path="currentRoute.path"
      :navigate-to="navigateTo"
      :context-provider="contextProvider"
      :runtime-options="runtimeOptions"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { BuiltinWorkspaceHostApp } from '@packages/ui';
import { currentRoute, navigateTo } from './router';
import { createWeb2ContextProvider } from './context/createWeb2ContextProvider';
import { createWeb2RuntimeOptions } from './runtime/createWeb2RuntimeOptions';
import { resolveOfflineSupportWarning } from './pwa/offlineSupport';

const contextProvider = createWeb2ContextProvider({
  env: import.meta.env as Record<string, string | undefined>
});
const runtimeOptions = createWeb2RuntimeOptions();
const offlineSupportWarning = computed(() => {
  if (typeof window === 'undefined') {
    return null;
  }

  return resolveOfflineSupportWarning({
    isSecureContext: window.isSecureContext,
    protocol: window.location.protocol,
    hostname: window.location.hostname
  });
});
</script>

<style scoped>
.web2-app-shell {
  min-height: 100vh;
}

.web2-offline-warning {
  position: sticky;
  top: 0;
  z-index: 20;
  padding: 10px 14px;
  background: #7a2e0b;
  color: #fff3e8;
  border-bottom: 1px solid rgba(255, 243, 232, 0.18);
  font-size: 13px;
  line-height: 1.45;
}
</style>
