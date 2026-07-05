<template>
  <BuiltinWorkspaceHostApp
    :current-route-path="currentRoute.path"
    :navigate-to="navigateTo"
    :context-provider="contextProvider"
    :runtime-options="runtimeOptions"
    :show-history-source-switch="true"
  />
</template>

<script setup lang="ts">
import { BuiltinWorkspaceHostApp } from '@packages/ui';
import { currentRoute, navigateTo } from './router';
import { createDesktop2ContextProvider } from './context/createDesktop2ContextProvider';
import { createDesktop2RuntimeOptions } from './runtime/createDesktop2RuntimeOptions';

const contextProvider = createDesktop2ContextProvider();
const runtimeOptions = createDesktop2RuntimeOptions();
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

.app-shell {
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.view-host {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
