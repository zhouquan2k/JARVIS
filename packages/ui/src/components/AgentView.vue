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
        <section class="agent-view__editor-panel">
          <div class="agent-view__panel-header">
          <h3>{{ t('shared.agentEditor') }}</h3>
          <span v-if="isDirty" data-testid="agent-view-dirty">{{ t('shared.unsavedChanges') }}</span>
          </div>
          <div class="agent-view__editor">
            <label class="agent-view__field">
              <span>{{ t('shared.agentDescriptionLabel') }}</span>
              <input
                v-model="draftDescription"
                type="text"
                class="agent-view__control"
                data-testid="agent-view-description"
                :placeholder="t('shared.agentDescriptionPlaceholder')"
                :disabled="isSaving"
              >
            </label>
            <label class="agent-view__field">
              <span>{{ t('shared.agentModelSelection') }}</span>
              <ProviderModelSelector
                :providers="providers"
                :current-provider-id="draftModelProviderName"
                :current-model-id="draftModelName"
                :models-loading="selectedProviderLoading"
                :disabled="isSaving"
                provider-test-id="agent-view-provider"
                model-test-id="agent-view-model-select"
                compact
                @provider-change="onProviderChange"
                @model-change="onModelChange"
              />
            </label>
            <label class="agent-view__field">
              <span>{{ t('shared.agentInheritance') }}</span>
              <select
                v-model="draftInheritance"
                class="agent-view__control"
                data-testid="agent-view-inheritance"
                :disabled="isSaving"
              >
                <option value="merge">{{ t('shared.agentInheritanceMerge') }}</option>
                <option value="override">{{ t('shared.agentInheritanceOverride') }}</option>
              </select>
            </label>
            <label class="agent-view__field agent-view__field--prompt">
              <span>{{ t('shared.agentSystemPrompt') }}</span>
              <textarea
                v-model="draftInstructions"
                class="agent-view__textarea"
                data-testid="agent-view-prompt"
                :placeholder="t('shared.agentSystemPromptPlaceholder')"
                :disabled="isSaving"
              />
            </label>
            <section class="agent-view__field agent-view__field--tools">
              <span>{{ t('shared.agentTools') }}</span>
              <label class="agent-view__switch">
                <input
                  v-model="draftToolsInherited"
                  type="checkbox"
                  class="agent-view__switch-input"
                  data-testid="agent-view-tools-inherit"
                  :disabled="isSaving"
                >
                <span>{{ t('shared.agentToolsInherit') }}</span>
              </label>
              <p class="agent-view__hint">
                {{ draftToolsInherited ? t('shared.agentToolsInheritedReadOnly') : t('shared.agentToolsEditableHint') }}
              </p>
              <div v-if="draftToolsInherited" class="agent-view__tools-readonly" data-testid="agent-view-tools-readonly">
                <span
                  v-for="tool in resolvedToolDisplay"
                  :key="tool.id"
                  class="agent-view__tool-pill"
                >
                  {{ tool.label }}
                </span>
                <span v-if="resolvedToolDisplay.length === 0" class="agent-view__tool-empty">
                  {{ t('shared.agentToolsNone') }}
                </span>
              </div>
              <div v-else class="agent-view__tools-grid" data-testid="agent-view-tools-editable">
                <label
                  v-for="tool in builtinTools"
                  :key="tool.id"
                  class="agent-view__tool-option"
                >
                  <input
                    v-model="draftToolIds"
                    type="checkbox"
                    class="agent-view__tool-checkbox"
                    :value="tool.id"
                    :data-testid="`agent-view-tool-${tool.id}`"
                    :disabled="isSaving"
                  >
                  <span class="agent-view__tool-option-body">
                    <strong class="agent-view__tool-option-title">{{ tool.id }}</strong>
                    <span class="agent-view__tool-option-description">{{ tool.description }}</span>
                  </span>
                </label>
              </div>
            </section>
            <p v-if="saveError" class="agent-view__error" data-testid="agent-view-save-error">{{ saveError }}</p>
            <div class="agent-view__actions">
              <button
                type="button"
                class="agent-view__button agent-view__button--secondary"
                data-testid="agent-view-reset"
                :disabled="!isDirty || isSaving"
                @click="resetDraft"
              >
                {{ t('shared.reset') }}
              </button>
              <button
                type="button"
                class="agent-view__button"
                data-testid="agent-view-save"
                :disabled="!isDirty || isSaving"
                @click="saveAgentConfig"
              >
                {{ isSaving ? t('shared.saving') : t('shared.saveAgentConfig') }}
              </button>
            </div>
          </div>
        </section>
        <section class="agent-view__resolved">
          <h3>{{ t('shared.agentResolvedPrompt') }}</h3>
          <pre
            class="agent-view__instructions"
            data-testid="agent-view-instructions"
            >{{ agent.effectiveInstructions || t('shared.instructionsNotConfigured') }}</pre>
        </section>
      </div>
    </header>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { DEFAULT_SCOPED_AGENT_CONFIG, type AgentInheritanceMode, type AgentToolBinding, type AgentToolDefinition, type ContextNode, type ResolvedAgentConfig } from '@packages/core/src';
import type { ProviderConfig } from '@packages/core/config';
import ProviderModelSelector from './ProviderModelSelector.vue';
import { useWorkspaceI18n } from '../i18n';

export type AgentConfigEditPayload = {
  description?: string;
  instructions?: string;
  modelProviderName?: string;
  modelName?: string;
  inheritance?: AgentInheritanceMode;
  tools?: AgentToolBinding[];
  inheritTools?: boolean;
};

const props = defineProps<{
  agentKey: string;
  agent: ResolvedAgentConfig;
  ownerNode: ContextNode;
  providers: ProviderConfig[];
  builtinTools: AgentToolDefinition[];
  modelLoadStates?: Record<string, { loading?: boolean; loaded?: boolean }>;
}>();

const emit = defineEmits<{
  (event: 'load-provider-models', providerId: string): void;
  (event: 'save-agent-config', payload: AgentConfigEditPayload): void;
}>();

const isInstructionsExpanded = ref(false);
const draftDescription = ref('');
const draftInstructions = ref('');
const draftModelProviderName = ref('');
const draftModelName = ref('');
const draftInheritance = ref<AgentInheritanceMode>('merge');
const draftToolIds = ref<string[]>([]);
const draftToolsInherited = ref(false);
const isSaving = ref(false);
const saveError = ref('');
const { t } = useWorkspaceI18n();
const builtinToolMap = computed(() => new Map(props.builtinTools.map((tool) => [tool.id, tool])));
const resolvedToolDisplay = computed(() => {
  return (props.agent.tools ?? []).map((tool) => {
    const definition = builtinToolMap.value.get(tool.id);
    return {
      id: tool.id,
      label: tool.description?.trim() || definition?.description?.trim() || tool.id
    };
  });
});
const initialToolIds = computed(() => normalizeToolIds(props.agent.tools?.map((tool) => tool.id) ?? []));
const modelLabel = computed(() => {
  const provider = props.agent.modelProviderName?.trim() || DEFAULT_SCOPED_AGENT_CONFIG.modelProviderName?.trim() || t('shared.unknownProvider');
  const model = props.agent.modelName?.trim() || DEFAULT_SCOPED_AGENT_CONFIG.modelName?.trim() || t('shared.unknownModel');
  return `${provider} / ${model}`;
});
const selectedProviderLoading = computed(() => {
  return props.modelLoadStates?.[draftModelProviderName.value]?.loading === true;
});
const isDirty = computed(() => {
  return draftDescription.value.trim() !== (props.agent.description ?? '').trim()
    || draftInstructions.value.trim() !== (props.agent.instructions ?? '').trim()
    || draftModelProviderName.value.trim() !== (props.agent.modelProviderName ?? '').trim()
    || draftModelName.value.trim() !== (props.agent.modelName ?? '').trim()
    || draftInheritance.value !== (props.agent.inheritance ?? 'merge')
    || draftToolsInherited.value
    || !isSameToolSelection(draftToolIds.value, initialToolIds.value);
});

watch(
  () => props.agent,
  () => resetDraft(),
  { immediate: true }
);

watch(
  () => draftModelProviderName.value,
  (providerId) => requestModelsIfNeeded(providerId),
  { immediate: true }
);

function toggleInstructions(): void {
  isInstructionsExpanded.value = !isInstructionsExpanded.value;
}

function resetDraft(): void {
  draftDescription.value = props.agent.description ?? '';
  draftInstructions.value = props.agent.instructions ?? '';
  draftModelProviderName.value = props.agent.modelProviderName ?? props.providers[0]?.id ?? '';
  draftModelName.value = props.agent.modelName ?? '';
  draftInheritance.value = props.agent.inheritance ?? 'merge';
  draftToolIds.value = normalizeToolIds(props.agent.tools?.map((tool) => tool.id) ?? []);
  draftToolsInherited.value = false;
  saveError.value = '';
}

function requestModelsIfNeeded(providerId: string): void {
  const loadState = props.modelLoadStates?.[providerId];
  if (!providerId || loadState?.loaded || loadState?.loading) {
    return;
  }

  emit('load-provider-models', providerId);
}

function onProviderChange(providerId: string): void {
  draftModelProviderName.value = providerId;
  draftModelName.value = '';
}

function onModelChange(modelId: string): void {
  draftModelName.value = modelId;
}

function saveAgentConfig(): void {
  if (!isDirty.value || isSaving.value) {
    return;
  }

  const payload: AgentConfigEditPayload = {};
  if (draftDescription.value.trim() !== (props.agent.description ?? '').trim()) {
    payload.description = draftDescription.value;
  }
  if (draftInstructions.value.trim() !== (props.agent.instructions ?? '').trim()) {
    payload.instructions = draftInstructions.value;
  }
  if (draftModelProviderName.value.trim() !== (props.agent.modelProviderName ?? '').trim()) {
    payload.modelProviderName = draftModelProviderName.value;
  }
  if (draftModelName.value.trim() !== (props.agent.modelName ?? '').trim()) {
    payload.modelName = draftModelName.value;
  }
  if (draftInheritance.value !== (props.agent.inheritance ?? 'merge')) {
    payload.inheritance = draftInheritance.value;
  }
  if (draftToolsInherited.value) {
    payload.inheritTools = true;
  } else if (!isSameToolSelection(draftToolIds.value, initialToolIds.value)) {
    payload.tools = buildToolBindings(draftToolIds.value, props.builtinTools);
  }

  isSaving.value = true;
  saveError.value = '';
  try {
    emit('save-agent-config', payload);
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSaving.value = false;
  }
}

function normalizeToolIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function isSameToolSelection(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeToolIds(left).sort();
  const normalizedRight = normalizeToolIds(right).sort();
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function buildToolBindings(selectedIds: string[], definitions: AgentToolDefinition[]): AgentToolBinding[] {
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
  return normalizeToolIds(selectedIds).map((id) => {
    const definition = definitionMap.get(id);
    return {
      id,
      ...(definition?.description?.trim() ? { description: definition.description.trim() } : {})
    };
  });
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
  overflow-x: hidden;
  overflow-y: auto;
  background:
    radial-gradient(circle at top left, rgba(16, 185, 129, 0.14), transparent 26%),
    radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.12), transparent 22%),
    linear-gradient(180deg, rgba(5, 10, 16, 0.98), rgba(9, 14, 22, 0.96));
}

.agent-view__hero {
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

.agent-view__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.agent-view__panel-header h3,
.agent-view__resolved h3 {
  margin: 0;
  color: #f8fafc;
  font-size: 15px;
}

.agent-view__instructions-shell {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 16px;
}

.agent-view__editor-panel,
.agent-view__resolved {
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  padding-top: 14px;
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

.agent-view__editor {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}

.agent-view__field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 600;
}

.agent-view__field--prompt {
  flex: 1;
  min-height: 0;
}

.agent-view__field--tools {
  gap: 10px;
}

.agent-view__switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 600;
}

.agent-view__switch-input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #38bdf8;
}

.agent-view__hint {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.5;
}

.agent-view__tools-readonly {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.agent-view__tool-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.4;
}

.agent-view__tool-empty {
  color: #94a3b8;
  font-size: 12px;
}

.agent-view__tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.agent-view__tool-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 500;
}

.agent-view__tool-checkbox {
  margin-top: 2px;
  accent-color: #38bdf8;
}

.agent-view__tool-option-body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.agent-view__tool-option-title {
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
  word-break: break-word;
}

.agent-view__tool-option-description {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  word-break: break-word;
}

.agent-view__control,
.agent-view__textarea {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.38);
  color: #f8fafc;
  font: inherit;
  outline: none;
}

.agent-view__control {
  min-height: 36px;
  padding: 0 10px;
}

.agent-view__textarea {
  flex: 1;
  min-height: 150px;
  resize: vertical;
  padding: 10px;
  line-height: 1.55;
}

.agent-view__textarea--short {
  min-height: 96px;
}

.agent-view__control:focus-visible,
.agent-view__textarea:focus-visible {
  border-color: rgba(56, 189, 248, 0.72);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.16);
}

.agent-view__error {
  margin: 0;
  color: #fca5a5;
  font-size: 13px;
}

.agent-view__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.agent-view__button {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(56, 189, 248, 0.42);
  border-radius: 8px;
  background: rgba(14, 165, 233, 0.18);
  color: #e0f2fe;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.agent-view__button--secondary {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(148, 163, 184, 0.08);
  color: #cbd5e1;
}

.agent-view__button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 960px) {
}
</style>
