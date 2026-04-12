<template>
  <section class="agent-view" data-testid="agent-view">
    <header class="agent-view__hero">
      <div class="agent-view__hero-main">
        <h2 class="agent-view__title">{{ agent.name }}</h2>
        <p class="agent-view__summary">{{ agent.description || t('shared.agentDescription') }}</p>
        <div class="agent-view__meta-bar">
          <div class="agent-view__meta">
            <span data-testid="agent-view-scope">{{ t('shared.agentScope', { scope: agent.scopePath || ownerNode.path }) }}</span>
            <span data-testid="agent-view-model">{{ t('shared.agentModel', { model: modelLabel }) }}</span>
            <span data-testid="agent-view-key">{{ t('shared.agentKey', { key: agentKey }) }}</span>
          </div>
          <button
            type="button"
            class="agent-view__toggle"
            data-testid="agent-view-instructions-toggle"
            :aria-expanded="isInstructionsExpanded ? 'true' : 'false'"
            @click="toggleInstructions"
          >
            <ChevronDown class="agent-view__toggle-chevron" :class="{ 'agent-view__toggle-chevron--expanded': isInstructionsExpanded }" :size="16" />
          </button>
        </div>
      </div>
      <div v-if="isInstructionsExpanded" class="agent-view__instructions-shell">
        <pre
          class="agent-view__instructions"
          data-testid="agent-view-instructions"
          >{{ agent.effectiveInstructions || t('shared.instructionsNotConfigured') }}</pre>
      </div>
    </header>

    <div class="agent-view__content-grid">
      <section class="agent-view__panel">
        <div class="agent-view__panel-header">
          <h3>{{ t('shared.documents') }}</h3>
          <span>{{ documents.length }}</span>
        </div>
        <div class="agent-view__panel-body">
          <div v-if="documents.length === 0" class="agent-view__empty" data-testid="agent-view-documents-empty">
            {{ t('shared.noMarkdownDocuments') }}
          </div>
          <div v-else class="agent-view__tree">
            <AgentDocumentTree
              :nodes="documents"
              @open-document="emit('open-document', $event)"
            />
          </div>
        </div>
      </section>

      <section class="agent-view__panel">
        <div class="agent-view__panel-header">
          <h3>{{ t('shared.localConversations') }}</h3>
          <span>{{ conversations.length }}</span>
        </div>
        <div class="agent-view__panel-body">
          <div v-if="conversations.length === 0" class="agent-view__empty" data-testid="agent-view-conversations-empty">
            {{ t('shared.currentAgentUnavailable') }}
          </div>
          <div v-else class="agent-view__list">
            <button
              v-for="conversation in sortedConversations"
              :key="conversation.id"
              type="button"
              class="agent-view__list-item"
              data-testid="agent-view-conversation"
              @click="emit('open-conversation', conversation.id)"
            >
              <span>{{ conversation.title }}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { DEFAULT_SCOPED_AGENT_CONFIG, type ContextNode, type Conversation, type ResolvedAgentConfig } from '@packages/core/src';
import AgentDocumentTree from './AgentDocumentTree.vue';
import { useWorkspaceI18n } from '../i18n';

const props = defineProps<{
  agentKey: string;
  agent: ResolvedAgentConfig;
  ownerNode: ContextNode;
  documents: ContextNode[];
  conversations: Conversation[];
}>();

const emit = defineEmits<{
  (event: 'open-document', path: string): void;
  (event: 'open-conversation', conversationId: string): void;
}>();

const isInstructionsExpanded = ref(false);
const { t } = useWorkspaceI18n();
const modelLabel = computed(() => {
  const provider = props.agent.modelProviderName?.trim() || DEFAULT_SCOPED_AGENT_CONFIG.modelProviderName?.trim() || t('shared.unknownProvider');
  const model = props.agent.modelName?.trim() || DEFAULT_SCOPED_AGENT_CONFIG.modelName?.trim() || t('shared.unknownModel');
  return `${provider} / ${model}`;
});
const sortedConversations = computed(() => {
  return [...props.conversations].sort((left, right) => right.updatedAt - left.updatedAt);
});

function toggleInstructions(): void {
  isInstructionsExpanded.value = !isInstructionsExpanded.value;
}
</script>

<style scoped>
.agent-view {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(16, 185, 129, 0.14), transparent 26%),
    radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.12), transparent 22%),
    linear-gradient(180deg, rgba(5, 10, 16, 0.98), rgba(9, 14, 22, 0.96));
}

.agent-view__hero,
.agent-view__panel {
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(14px);
}

.agent-view__hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
}

.agent-view__hero-main {
  display: flex;
  flex-direction: column;
}

.agent-view__title {
  margin: 0 0 6px;
  color: #f8fafc;
  font-size: 26px;
  line-height: 1.1;
}

.agent-view__summary {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.6;
}

.agent-view__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #94a3b8;
  font-size: 12px;
}

.agent-view__meta span {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
}

.agent-view__meta-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}

.agent-view__panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 16px;
}

.agent-view__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.agent-view__panel h3 {
  margin: 0;
  color: #f8fafc;
  font-size: 15px;
}

.agent-view__instructions-shell {
  display: flex;
  width: 100%;
}

.agent-view__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: #94a3b8;
  background: transparent;
  font: inherit;
  cursor: pointer;
  flex: 0 0 auto;
}

.agent-view__toggle:hover,
.agent-view__toggle:focus-visible {
  color: #e2e8f0;
  background: rgba(148, 163, 184, 0.12);
}

.agent-view__toggle-chevron {
  transform: rotate(0deg);
  transition: transform 160ms ease;
}

.agent-view__toggle-chevron--expanded {
  transform: rotate(180deg);
}

.agent-view__instructions {
  margin: 0;
  width: 100%;
  padding-top: 2px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #e2e8f0;
  font: inherit;
  line-height: 1.7;
}

.agent-view__empty {
  color: #94a3b8;
  font-size: 13px;
}

.agent-view__content-grid {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}

.agent-view__panel-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.agent-view__tree {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

@media (max-width: 960px) {
  .agent-view {
    overflow: auto;
  }

  .agent-view__content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-view__panel-body,
  .agent-view__tree {
    overflow: visible;
  }
}
</style>
