<template>
  <aside class="knowledge-assistant-pane" data-testid="knowledge-assistant-pane">
    <header class="agent-banner" data-testid="knowledge-agent-panel">
      <div class="agent-banner-main">
        <div v-if="activeAgent" class="agent-meta">
          <div class="agent-title-row">
            <div class="agent-name-group" data-testid="knowledge-agent-name">
              <strong class="agent-name">{{ activeAgent.name }}</strong>
              <span class="agent-name-path">（{{ resolveAgentConfigDirectory(activeAgent) }}）</span>
            </div>
            <div class="agent-inline-meta">
              <span class="agent-model" data-testid="knowledge-agent-model">{{ resolveAgentModelLabel(activeAgent) }}</span>
            </div>
          </div>
        </div>
        <div v-else class="agent-meta">
          <div class="agent-title-row">
            <strong class="agent-name">未解析到作用域 Agent</strong>
            <div class="agent-inline-meta">
              <span class="agent-model">跟随当前聊天模型选择</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isResolvingAgent" class="agent-loading" data-testid="knowledge-agent-loading">
        正在解析 Agent...
      </div>
      <div v-else-if="agentResolutionError" class="agent-error" data-testid="knowledge-agent-error">
        {{ agentResolutionError }}
      </div>
    </header>

    <NormalChatView class="knowledge-assistant-chat" />
  </aside>
</template>

<script setup lang="ts">
import type { ContextDocument, IContextProvider, ResolvedAgentConfig } from '@packages/core/src';
import { onBeforeUnmount, watch } from 'vue';
import NormalChatView from '../views/NormalChatView.vue';
import { useChatStore } from '../store/chat';

const props = defineProps<{
  activeAgent?: ResolvedAgentConfig | null;
  activePath?: string | null;
  activeDocument?: Pick<ContextDocument, 'path' | 'content'> | null;
  contextProvider?: IContextProvider | null;
  onFileChanged?: ((change: { path: string; beforeContent: string; afterContent: string }) => void | Promise<void>) | null;
  agentResolutionError?: string | null;
  isResolvingAgent?: boolean;
}>();
const chatStore = useChatStore();

function resolveAgentModelLabel(agent: ResolvedAgentConfig): string {
  if (!agent.modelProviderName && !agent.modelName) {
    return '跟随当前聊天模型选择';
  }

  const provider = agent.modelProviderName?.trim() || '未指定 Provider';
  const model = agent.modelName?.trim() || '未指定模型';
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

watch(() => props.activeAgent ?? null, (agent) => {
  chatStore.setActiveAgentContext(agent);
}, { immediate: true });

watch(
  () => [props.activePath ?? null, props.activeDocument ?? null, props.contextProvider ?? null, props.onFileChanged ?? null] as const,
  ([activePath, activeDocument, contextProvider, onFileChanged]) => {
    chatStore.setWorkspaceContext({
      activePath,
      activeDocument,
      contextProvider,
      onFileChanged
    });
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  chatStore.setActiveAgentContext(null);
  chatStore.setWorkspaceContext({
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

.knowledge-assistant-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
