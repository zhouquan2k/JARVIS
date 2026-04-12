<template>
  <aside class="knowledge-assistant-pane" data-testid="agent-pane">
    <header class="agent-banner" data-testid="agent-panel">
      <div class="agent-banner-main">
        <div class="agent-meta">
          <div class="agent-title-row">
            <div class="agent-name-group" data-testid="agent-name">
              <strong class="agent-name">{{ resolveAgentName(activeAgent) }}</strong>
              <span class="agent-name-path">（{{ resolveAgentDirectory(activeAgent) }}）</span>
            </div>
            <div class="agent-inline-meta">
              <span class="agent-model" data-testid="agent-model">{{ resolveAgentModelLabel(activeAgent) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="agentResolutionError" class="agent-error" data-testid="agent-error">
        {{ agentResolutionError }}
      </div>
    </header>

    <AgentConversationPanel
      class="agent-pane-chat"
      :active-agent-key="props.activeAgentKey"
      :active-path="props.activePath"
      :selected-node-path="props.selectedNodePath"
      :active-document="props.activeDocument"
      :show-agent-conversation-list="props.showAgentConversationList"
      :context-provider="props.contextProvider"
      :restore-conversation-id="props.restoreConversationId"
      @request-workspace-switch="emit('request-workspace-switch', $event)"
    />
  </aside>
</template>

<script setup lang="ts">
import { DEFAULT_SCOPED_AGENT_CONFIG, type ContextDocument, type IContextProvider, type ResolvedAgentConfig } from '@packages/core/src';
import { onBeforeUnmount, watch } from 'vue';
import type { ChatRoutePath } from '../routes';
import AgentConversationPanel from './AgentConversationPanel.vue';
import { useChatStore } from '../store/chat';
import { useWorkspaceI18n } from '../i18n';

const props = defineProps<{
  activeAgent?: ResolvedAgentConfig | null;
  activeAgentKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: ContextDocument | null;
  showAgentConversationList?: boolean;
  contextProvider?: IContextProvider | null;
  onFileChanged?: ((change: { path: string; beforeContent: string; afterContent: string }) => void | Promise<void>) | null;
  agentResolutionError?: string | null;
  restoreConversationId?: string | null;
}>();
const chatStore = useChatStore();
const { t } = useWorkspaceI18n();
const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
}>();

function resolveAgentName(agent: ResolvedAgentConfig | null | undefined): string {
  return agent?.name?.trim() || t('shared.workspaceAgent');
}

function resolveAgentModelLabel(agent: ResolvedAgentConfig | null | undefined): string {
  const provider = agent?.modelProviderName?.trim() || DEFAULT_SCOPED_AGENT_CONFIG.modelProviderName?.trim() || t('shared.unknownProvider');
  const model = agent?.modelName?.trim() || DEFAULT_SCOPED_AGENT_CONFIG.modelName?.trim() || t('shared.unknownModel');
  return `${provider} / ${model}`;
}

function resolveAgentConfigDirectory(agent: ResolvedAgentConfig): string {
  const sourcePath = agent.sourcePaths[agent.sourcePaths.length - 1];
  if (!sourcePath) {
    return agent.scopePath;
  }

  const lastSlashIndex = sourcePath.lastIndexOf('/');
  if (lastSlashIndex <= 0) {
    return '/';
  }

  return sourcePath.slice(0, lastSlashIndex);
}

function resolveAgentDirectory(agent: ResolvedAgentConfig | null | undefined): string {
  if (!agent) {
    return '/';
  }

  return resolveAgentConfigDirectory(agent);
}

watch(() => props.activeAgent ?? null, (agent) => {
  chatStore.setActiveAgentContext(agent);
}, { immediate: true, flush: 'sync' });

watch(
  () => [props.activeAgentKey ?? null, props.activePath ?? null, props.activeDocument ?? null, props.contextProvider ?? null, props.onFileChanged ?? null] as const,
  ([activeAgentKey, activePath, activeDocument, contextProvider, onFileChanged]) => {
    chatStore.setWorkspaceContext({
      activeAgentKey,
      activePath,
      activeDocument,
      contextProvider,
      onFileChanged
    });
  },
  { immediate: true, flush: 'sync' }
);

onBeforeUnmount(() => {
  chatStore.setActiveAgentContext(null);
  chatStore.setWorkspaceContext({
    activeAgentKey: null,
    activePath: null,
    activeDocument: null,
    contextProvider: null,
    onFileChanged: null
  });
});
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

.agent-banner {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.55));
}

.agent-banner-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.agent-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.agent-name-group {
  display: flex;
  align-items: baseline;
  gap: 2px;
  min-width: 0;
}

.agent-name {
  color: #f8fafc;
  font-size: 14px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-name-path {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  word-break: break-word;
}

.agent-inline-meta {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  margin-left: auto;
  text-align: right;
}

.agent-model,
.agent-sources,
.agent-loading {
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-error {
  color: #fecaca;
  font-size: 12px;
  line-height: 1.5;
}

.agent-pane-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
