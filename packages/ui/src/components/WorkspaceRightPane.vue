<template>
  <aside class="knowledge-assistant-pane" data-testid="workspace-right-pane">
    <div class="workspace-right-pane__tabs" data-testid="workspace-right-pane-tabs">
      <button
        v-for="tab in rightPanelTabs"
        :key="tab.id"
        type="button"
        class="workspace-right-pane__tab"
        :class="{ 'workspace-right-pane__tab--active': activeTab === tab.id }"
        :data-testid="`workspace-right-pane-tab-${tab.id}`"
        @click="activeTab = tab.id"
      >
        {{ tab.titleKey ? t(tab.titleKey as any) : tab.title }}
        <span v-if="resolveTabCount(tab.id) > 0" class="workspace-right-pane__tab-count">({{ resolveTabCount(tab.id) }})</span>
      </button>
    </div>

    <component
      :is="activeTabComponent"
      v-if="activeTabComponent"
      class="agent-pane-chat"
      :active-agent="props.activeAgent"
      :active-agent-key="props.activeAgentKey"
      :active-path="props.activePath"
      :selected-node-path="props.selectedNodePath"
      :active-document="props.activeDocument"
      :show-agent-conversation-list="props.showAgentConversationList"
      :context-provider="props.contextProvider"
      :open-conversation-request="props.openConversationRequest"
      @request-workspace-switch="emit('request-workspace-switch', $event)"
    />
  </aside>
</template>

<script setup lang="ts">
import type { ContextDocument, FolderMetadata, IContextProvider, WorkspaceTabContext } from '@packages/core/src';
import type { ResolvedAgentConfig } from '@plugins/ai-agent/api';
import { computed, inject, ref, watch } from 'vue';
import type { ChatRoutePath } from '../routes';
import { contributionQueryKey, workspaceRuntimeContextKey } from '../plugins/injectionKeys';
import type { OpenConversationRequest } from '../types/conversationLink';
import { useWorkspaceI18n } from '../i18n';

const props = defineProps<{
  activeAgent?: ResolvedAgentConfig | null;
  activeAgentKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: ContextDocument | null;
  showAgentConversationList?: boolean;
  contextProvider?: IContextProvider | null;
  onFileChanged?: ((change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) => void | Promise<void>) | null;
  agentResolutionError?: string | null;
  openConversationRequest?: OpenConversationRequest | null;
}>();
const { t } = useWorkspaceI18n();
const contributionQuery = inject(contributionQueryKey, null);
const runtimeContext = inject(workspaceRuntimeContextKey, null);
const rightPanelTabs = computed(() => contributionQuery?.value?.getRightPanelTabs() ?? []);
const activeTab = ref('');
const tabBadgeCounts = ref<Record<string, number>>({});
const activeTabComponent = computed(() => {
  return rightPanelTabs.value.find((tab) => tab.id === activeTab.value)?.component ?? null;
});
const activeScopeMetadata = computed<FolderMetadata | null>(() => {
  const scopeKey = props.activeAgentKey?.trim() || null;
  return scopeKey
    ? { scopeKey, data: (props.activeAgent ?? {}) as unknown as Record<string, unknown> }
    : null;
});
const workspaceTabContext = computed<WorkspaceTabContext>(() => ({
  activeScopeMetadata: activeScopeMetadata.value,
  activeScopeKey: props.activeAgentKey?.trim() || null,
  activePath: props.activePath?.trim() || null,
  selectedNodePath: props.selectedNodePath?.trim() || null,
  activeDocument: props.activeDocument ?? null,
  contextProvider: props.contextProvider ?? null,
  runtimeContext: runtimeContext?.value ?? null,
  openConversationId: props.openConversationRequest?.conversationId ?? null,
  openConversationNonce: props.openConversationRequest?.nonce ?? null,
  showAgentConversationList: props.showAgentConversationList === true
}));

async function refreshTabBadgeCounts(): Promise<void> {
  const nextCounts: Record<string, number> = {};
  for (const tab of rightPanelTabs.value) {
    if (!tab.getBadgeCount) {
      continue;
    }

    try {
      const count = await tab.getBadgeCount(workspaceTabContext.value);
      nextCounts[tab.id] = Number.isFinite(count) ? Math.max(0, count) : 0;
    } catch {
      nextCounts[tab.id] = 0;
    }
  }
  tabBadgeCounts.value = nextCounts;
}

watch(rightPanelTabs, (tabs) => {
  if (tabs.length === 0) {
    activeTab.value = '';
    return;
  }

  if (tabs.some((tab) => tab.id === activeTab.value)) {
    return;
  }

  activeTab.value = tabs.find((tab) => tab.defaultActive)?.id ?? tabs[0]!.id;
}, { immediate: true });

watch(
  workspaceTabContext,
  () => {
    void refreshTabBadgeCounts();
  },
  { immediate: true }
);

watch(
  [rightPanelTabs, workspaceTabContext] as const,
  ([tabs, context]) => {
    const autoActivatedTab = tabs.find((tab) => tab.shouldAutoActivate?.(context) === true);
    if (autoActivatedTab) {
      activeTab.value = autoActivatedTab.id;
    }
  },
  { immediate: true, flush: 'sync' }
);

function resolveTabCount(tabId: string): number {
  return tabBadgeCounts.value[tabId] ?? 0;
}

const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
}>();
</script>

<style scoped>
.knowledge-assistant-pane {
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(9, 13, 20, 0.92));
}

.workspace-right-pane__tabs {
  display: flex;
  align-items: flex-end;
  gap: 0;
  padding: 0 14px;
  border-bottom: 1px solid rgba(71, 85, 105, 0.48);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.78), rgba(15, 23, 42, 0.52));
}

.workspace-right-pane__tab {
  position: relative;
  border: 0;
  border-radius: 0;
  padding: 13px 18px 11px;
  background: transparent;
  color: rgba(148, 163, 184, 0.9);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    color 140ms ease,
    background-color 140ms ease;
}

.workspace-right-pane__tab:hover {
  color: rgba(226, 232, 240, 0.96);
  background: rgba(30, 41, 59, 0.28);
}

.workspace-right-pane__tab--active {
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.24);
}

.workspace-right-pane__tab-count {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.72;
}

.workspace-right-pane__tab--active::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, #22c55e, #38bdf8);
}

.agent-pane-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
