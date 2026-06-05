<template>
  <BuiltinWorkspaceHostApp
    :current-route-path="currentRoute.path"
    :navigate-to="navigateTo"
    :context-provider="contextProvider"
    :runtime-options="runtimeOptions"
  />
</template>

<script setup lang="ts">
import { BuiltinWorkspaceHostApp } from '@packages/ui';
import { currentRoute, navigateTo } from './router';
import { createWeb2ContextProvider } from './context/createWeb2ContextProvider';
import { createWeb2RuntimeOptions } from './runtime/createWeb2RuntimeOptions';

const contextProvider = createWeb2ContextProvider({
  env: import.meta.env as Record<string, string | undefined>
});
const runtimeOptions = createWeb2RuntimeOptions();
</script>
