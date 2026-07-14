<template>
  <div class="web2-app-shell">
    <div
      v-if="visibleOfflineSupportWarning"
      class="web2-offline-warning"
      data-testid="web2-offline-warning"
      role="alert"
    >
      {{ visibleOfflineSupportWarning }}
    </div>
    <div class="web2-app-host">
      <BuiltinWorkspaceHostApp
        :current-route-path="currentRoute.path"
        :navigate-to="navigateTo"
        :context-provider="contextProvider"
        :runtime-options="runtimeOptions"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { BuiltinWorkspaceHostApp } from '@packages/ui';
import { currentRoute, navigateTo } from './router';
import { createWeb2ContextProvider } from './context/createWeb2ContextProvider';
import { createWeb2RuntimeOptions } from './runtime/createWeb2RuntimeOptions';
import { resolveOfflineSupportWarning } from './pwa/offlineSupport';

const OFFLINE_WARNING_VISIBLE_MS = 5000;

const contextProvider = createWeb2ContextProvider({
  env: import.meta.env as Record<string, string | undefined>
});
const runtimeOptions = createWeb2RuntimeOptions();
const visibleOfflineSupportWarning = ref<string | null>(null);
let hideOfflineWarningTimer: number | null = null;

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

function clearOfflineWarningTimer(): void {
  if (hideOfflineWarningTimer !== null) {
    window.clearTimeout(hideOfflineWarningTimer);
    hideOfflineWarningTimer = null;
  }
}

function resetOfflineWarningVisibility(message: string | null): void {
  clearOfflineWarningTimer();
  visibleOfflineSupportWarning.value = message;

  if (!message) {
    return;
  }

  hideOfflineWarningTimer = window.setTimeout(() => {
    visibleOfflineSupportWarning.value = null;
    hideOfflineWarningTimer = null;
  }, OFFLINE_WARNING_VISIBLE_MS);
}

watch(offlineSupportWarning, (message) => {
  resetOfflineWarningVisibility(message);
}, { immediate: true });

onBeforeUnmount(() => {
  clearOfflineWarningTimer();
});
</script>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  min-height: 100%;
  margin: 0;
  overflow: hidden;
}

.web2-app-shell {
  position: relative;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.web2-app-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.web2-offline-warning {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  left: 12px;
  right: 12px;
  z-index: 80;
  padding: 10px 14px;
  background: #7a2e0b;
  color: #fff3e8;
  border: 1px solid rgba(255, 243, 232, 0.18);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
  font-size: 13px;
  line-height: 1.45;
  pointer-events: none;
}
</style>
