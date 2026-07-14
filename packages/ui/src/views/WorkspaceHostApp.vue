<template>
  <div class="app-shell">
    <AppTopBar
      :is-compare-mode="isCompareMode"
      :active-workspace-path="activeWorkspacePath"
      :workspace-options="workspaceOptions"
      :show-node-history-controls="isKnowledgeMode"
      :can-go-back-node-history="documentStore.canGoBackNodeHistory"
      :can-go-forward-node-history="documentStore.canGoForwardNodeHistory"
      @navigate-workspace="onNavigateWorkspace"
      @go-back-node-history="onGoBackNodeHistory"
      @go-forward-node-history="onGoForwardNodeHistory"
    />
    <div
      v-if="props.runtimeContext?.currentError"
      class="global-error-banner"
      data-testid="workspace-global-error"
      role="alert"
    >
      <span class="global-error-banner__message">{{ props.runtimeContext?.currentError }}</span>
      <button
        type="button"
        class="global-error-banner__close"
        data-testid="workspace-global-error-close"
        aria-label="Close error"
        @click="props.runtimeContext?.clearCurrentError()"
      >
        ×
      </button>
    </div>
    <main class="view-host">
      <DocumentWorkspaceView
        v-if="isKnowledgeMode"
        :context-provider="props.contextProvider"
        @request-workspace-switch="onNavigateWorkspace"
      />
      <component
        :is="activeGlobalViewComponent"
        v-else-if="activeGlobalViewComponent"
        v-bind="activeGlobalViewProps"
        @request-workspace-switch="onNavigateWorkspace"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';
import type { ContributionQuery, IContextProvider, WorkspaceRuntimeContext } from '@packages/core/src';
import AppTopBar from '../components/AppTopBar.vue';
import {
  contributionQueryKey,
  workspaceNavigationApiKey,
  workspaceNavigationStateKey,
  workspaceRouteKey,
  workspaceRuntimeContextKey,
  type WorkspaceNavigationState
} from '../plugins/injectionKeys';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';
import DocumentWorkspaceView from './DocumentWorkspaceView.vue';
import type { ChatRoute } from '../routes';
import type { ChatRoutePath } from '../routes';

const props = withDefaults(defineProps<{
  currentRoutePath: ChatRoutePath;
  navigateTo: (path: ChatRoutePath) => void;
  contextProvider: IContextProvider;
  contributionQuery?: ContributionQuery | null;
  runtimeContext?: WorkspaceRuntimeContext | null;
  showHistorySourceSwitch?: boolean;
}>(), {
  showHistorySourceSwitch: false
});

const documentStore = useDocumentWorkspaceStore();
const providedContributionQuery = computed(() => props.contributionQuery ?? null);
const providedRuntimeContext = computed(() => props.runtimeContext ?? null);
provide(contributionQueryKey, providedContributionQuery);
provide(workspaceRuntimeContextKey, providedRuntimeContext);
const currentRouteRef = computed(() => props.currentRoutePath);
provide(workspaceRouteKey, currentRouteRef);
const isCompareMode = computed(() => props.currentRoutePath === '/compare');
const isKnowledgeMode = computed(() => props.currentRoutePath === '/');
const activeWorkspacePath = computed<ChatRoutePath>(() => props.currentRoutePath === '/compare' ? '/chat' : props.currentRoutePath);
const globalViews = computed(() => props.contributionQuery?.getGlobalViews() ?? []);
const pendingNavigationTarget = ref<ChatRoutePath | null>(null);
const workspaceNavigationState = ref<WorkspaceNavigationState | null>(null);
const activeGlobalView = computed(() => {
  const targetRoutePath = props.currentRoutePath === '/compare' ? '/chat' : props.currentRoutePath;
  return globalViews.value.find((view) => view.routePath === targetRoutePath) ?? null;
});
const activeGlobalViewComponent = computed(() => activeGlobalView.value?.component ?? null);
const workspaceOptions = computed<ReadonlyArray<Pick<ChatRoute, 'path' | 'name' | 'label' | 'labelKey'>>>(() => {
  return [
    {
      path: '/',
      name: 'knowledge-workspace',
      label: 'Workspace',
      labelKey: 'routes.knowledgeWorkspace'
    },
    ...globalViews.value
      .filter((view) => view.routePath !== '/compare')
      .map((view) => ({
        path: view.routePath as ChatRoutePath,
        name: view.routeName as ChatRoute['name'],
        label: view.label,
        labelKey: view.labelKey as ChatRoute['labelKey']
      }))
  ];
});
const activeGlobalViewProps = computed(() => ({
  contextProvider: props.contextProvider,
  isCompareMode: isCompareMode.value,
  showHistorySourceSwitch: props.showHistorySourceSwitch
}));

provide(workspaceNavigationStateKey, workspaceNavigationState);
provide(workspaceNavigationApiKey, {
  async openNode(path: string, options?: WorkspaceNavigationState) {
    workspaceNavigationState.value = {
      tab: options?.tab ?? null,
      detailKey: options?.detailKey ?? null
    };

    if (props.currentRoutePath !== '/') {
      await onNavigateWorkspace('/');
    }

    await documentStore.openNode(path);
  }
});

async function syncRuntimeRouteState(nextRoutePath: ChatRoutePath, previousRoutePath?: ChatRoutePath) {
  await props.runtimeContext?.beforeRouteNavigate({
    currentRoutePath: previousRoutePath ?? nextRoutePath,
    nextRoutePath,
    selectedNodePath: documentStore.selectedNodePath,
    activePath: documentStore.activePath,
    activeScopeMetadata: documentStore.activeScopeMetadata
  });
}

async function onNavigateWorkspace(path: ChatRoutePath, options?: { revealSidebar?: boolean }) {
  pendingNavigationTarget.value = path;
  documentStore.exitConversationFocus();
  await props.runtimeContext?.beforeRouteNavigate({
    currentRoutePath: props.currentRoutePath,
    nextRoutePath: path,
    selectedNodePath: documentStore.selectedNodePath,
    activePath: documentStore.activePath,
    activeScopeMetadata: documentStore.activeScopeMetadata,
    revealSidebar: options?.revealSidebar
  });
  props.navigateTo(path);
}

watch(
  () => props.currentRoutePath,
  (nextRoutePath, previousRoutePath) => {
    if (pendingNavigationTarget.value === nextRoutePath) {
      pendingNavigationTarget.value = null;
      return;
    }

    void syncRuntimeRouteState(nextRoutePath, previousRoutePath);
  },
  { immediate: true, flush: 'sync' }
);

watch(
  () => props.runtimeContext,
  (runtimeContext, previousRuntimeContext) => {
    if (!runtimeContext || runtimeContext === previousRuntimeContext) {
      return;
    }

    void syncRuntimeRouteState(props.currentRoutePath);
  },
  { flush: 'sync' }
);

async function onGoBackNodeHistory(): Promise<void> {
  if (!isKnowledgeMode.value) {
    return;
  }

  await documentStore.goBackNodeHistory();
}

async function onGoForwardNodeHistory(): Promise<void> {
  if (!isKnowledgeMode.value) {
    return;
  }

  await documentStore.goForwardNodeHistory();
}

// Document follow-on: when conversation changes and has associated documentIds,
// auto-open the first document in the workspace.
watch(
  () => props.runtimeContext?.currentConversationDocumentIds,
  async (documentIds) => {
    if (!documentIds?.length) return;
    const firstId = documentIds[0];
    if (!firstId) return;
    try {
      const resolved = await props.contextProvider.resolveDocumentIds([firstId]);
      const node = resolved.get(firstId);
      if (node?.path && node.path !== documentStore.activePath) {
        await documentStore.openNode(node.path);
      }
    } catch {
      // silently ignore - document may not exist
    }
  }
);

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
  height: 100%;
  min-height: 0;
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

.global-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(127, 29, 29, 0.92);
  color: #fee2e2;
  font-size: 13px;
  line-height: 1.45;
}

.global-error-banner__message {
  min-width: 0;
}

.global-error-banner__close {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
}
</style>
