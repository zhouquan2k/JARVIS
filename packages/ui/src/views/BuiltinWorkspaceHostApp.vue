<template>
  <WorkspaceHostApp
    :current-route-path="currentRoutePath"
    :navigate-to="navigateTo"
    :context-provider="contextProvider"
    :contribution-query="contributionQuery"
    :runtime-context="runtimeContext"
    :show-history-source-switch="showHistorySourceSwitch"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import type {
    ContributionQuery,
    IContextProvider,
    WorkspaceRuntimeContext
} from '@packages/core/src';
import type {
    BuiltinWorkspaceRuntimeResult,
    CreateBuiltinWorkspaceRuntimeOptions
} from '../bootstrap/createBuiltinWorkspaceRuntime';
import { createBuiltinWorkspaceRuntime } from '../bootstrap/createBuiltinWorkspaceRuntime';
import type { ChatRoutePath } from '../routes';
import { installGlobalUnhandledErrorFallback } from '../utils/installGlobalUnhandledErrorFallback';
import WorkspaceHostApp from './WorkspaceHostApp.vue';

const props = withDefaults(defineProps<{
    currentRoutePath: ChatRoutePath;
    navigateTo: (path: ChatRoutePath) => void;
    contextProvider: IContextProvider;
    runtimeOptions: CreateBuiltinWorkspaceRuntimeOptions;
    showHistorySourceSwitch?: boolean;
    onRuntimeReady?: (runtime: BuiltinWorkspaceRuntimeResult) => void | Promise<void>;
}>(), {
    showHistorySourceSwitch: false,
    onRuntimeReady: undefined
});

const contributionQuery = shallowRef<ContributionQuery | null>(null);
const runtimeContext = shallowRef<WorkspaceRuntimeContext | null>(null);
let removeUnhandledErrorFallback: (() => void) | null = null;

onMounted(() => {
    removeUnhandledErrorFallback = installGlobalUnhandledErrorFallback({
        reportError: (message) => {
            runtimeContext.value?.postHostEvent({
                type: 'unhandled-error',
                message
            });
        }
    });

    void (async () => {
        try {
            const runtime = await createBuiltinWorkspaceRuntime(props.runtimeOptions);
            contributionQuery.value = runtime.contributionQuery;
            runtimeContext.value = runtime.runtimeContext;
            await props.onRuntimeReady?.(runtime);
        } catch (error) {
            console.error('Failed to initialize provider catalogs', error);
        }
    })();
});

onBeforeUnmount(() => {
    removeUnhandledErrorFallback?.();
    removeUnhandledErrorFallback = null;
});
</script>
