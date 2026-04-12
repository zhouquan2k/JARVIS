<template>
  <div class="compare-container" data-testid="compare-chat-view">
    <header class="sticky-top">
      <p class="prompt-line" v-if="compareStore.prompt">{{ t('shared.currentQuestion', { prompt: compareStore.prompt }) }}</p>
      <nav class="tab-row">
        <button
          data-testid="tab-native"
          :class="{ active: compareStore.activeTab === 'native' }"
          @click="compareStore.setActiveTab('native')">
          {{ t('shared.originalOutput') }}
        </button>
        <button
          data-testid="tab-analysis"
          :class="{ active: compareStore.activeTab === 'analysis' }"
          @click="compareStore.setActiveTab('analysis')">
          {{ t('shared.analysisOutput') }}
        </button>
      </nav>
    </header>

    <main class="scroll-panel">
      <section v-if="compareStore.activeTab === 'native'" class="native-grid">
        <article class="output-card output-card-a">
          <h3>{{ t('shared.modelA') }}</h3>
          <div class="output-body" data-testid="output-a">
            <MarkdownContent v-if="compareStore.outputA" :source="compareStore.outputA" />
            <pre v-else>{{ outputPlaceholder }}</pre>
          </div>
        </article>
        <article class="output-card output-card-b">
          <h3>{{ t('shared.modelB') }}</h3>
          <div class="output-body" data-testid="output-b">
            <MarkdownContent v-if="compareStore.outputB" :source="compareStore.outputB" />
            <pre v-else>{{ outputPlaceholder }}</pre>
          </div>
        </article>
      </section>

      <section v-else class="analysis-panel">
        <AnalysisGrid
          :result="compareStore.analysisResult"
          :raw-text="compareStore.analysisRaw"
          :loading="isBusy"
          :error="compareStore.analysisError"
        />
      </section>
    </main>

    <footer class="sticky-bottom">
      <CompareModelSelectors
        :providers="compareStore.availableProviders"
        :model-a="{ providerId: compareStore.modelAProviderId, modelId: compareStore.modelAModelId }"
        :model-b="{ providerId: compareStore.modelBProviderId, modelId: compareStore.modelBModelId }"
        :model-a-loading="compareStore.isModelALoading"
        :model-b-loading="compareStore.isModelBLoading"
        :disabled="isBusy"
        @update:model-a-provider-id="onModelAProviderChange"
        @update:model-a-model-id="onModelAModelChange"
        @update:model-b-provider-id="onModelBProviderChange"
        @update:model-b-model-id="onModelBModelChange"
      />

      <div class="input-row">
        <textarea
          v-model="inputPrompt"
          data-testid="compare-input"
          @keydown="onInputKeydown"
          :placeholder="t('shared.compareInputPlaceholder')"
          :disabled="isBusy || !isSelectionReady"
        />
        <div class="input-actions">
          <p class="shortcut-hint">{{ t('shared.compareShortcutHint') }}</p>
          <div class="button-row">
            <button
              data-testid="compare-send"
              @click="submitCompare"
              :disabled="!inputPrompt.trim() || isBusy || !isSelectionReady"
            >
              {{ t('shared.beginComparison') }}
            </button>
            <button v-if="isBusy" class="stop-btn" @click="compareStore.abort()" data-testid="compare-stop">{{ t('shared.stop') }}</button>
            <button class="new-btn" @click="startNewChat" :disabled="isBusy" data-testid="compare-new">{{ t('shared.newChat') }}</button>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AnalysisGrid from '../components/AnalysisGrid.vue';
import CompareModelSelectors from '../components/CompareModelSelectors.vue';
import MarkdownContent from '../components/MarkdownContent.vue';
import { useCompareStore } from '../store/compare';
import { isPromptSubmitHotkey } from '../utils/promptHotkeys';
import { useWorkspaceI18n } from '../i18n';

const compareStore = useCompareStore();
const inputPrompt = ref('');
const { t } = useWorkspaceI18n();

const isBusy = computed(() => compareStore.stage === 'generating' || compareStore.stage === 'analyzing');
const isSelectionReady = computed(() => {
  return compareStore.availableProviders.length > 0
    && !!compareStore.modelAProviderId
    && !!compareStore.modelAModelId
    && !!compareStore.modelBProviderId
    && !!compareStore.modelBModelId
    && !compareStore.isModelALoading
    && !compareStore.isModelBLoading;
});

const outputPlaceholder = computed(() => {
  if (compareStore.stage === 'idle') return t('shared.waitingInput');
  if (compareStore.stage === 'generating') return t('shared.streamingOutput');
  return t('shared.noOutput');
});

async function submitCompare() {
  const prompt = inputPrompt.value.trim();
  if (!prompt || isBusy.value || !isSelectionReady.value) return;
  await compareStore.executeCompare(prompt);
  inputPrompt.value = '';
}

function onInputKeydown(event: KeyboardEvent) {
  if (!isPromptSubmitHotkey(event)) {
    return;
  }

  event.preventDefault();
  void submitCompare();
}

async function onModelAProviderChange(providerId: string) {
  await compareStore.setModelA(providerId);
}

function onModelAModelChange(modelId: string) {
  compareStore.setModelAId(modelId);
}

async function onModelBProviderChange(providerId: string) {
  await compareStore.setModelB(providerId);
}

function onModelBModelChange(modelId: string) {
  compareStore.setModelBId(modelId);
}

function startNewChat() {
  compareStore.startNewCompare();
  inputPrompt.value = '';
}
</script>

<style scoped>
.compare-container {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(148, 163, 184, 0.08), transparent 30%),
    radial-gradient(circle at bottom right, rgba(71, 85, 105, 0.14), transparent 24%),
    linear-gradient(180deg, #22262f 0%, #2a2f39 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sticky-top,
.sticky-bottom {
  position: sticky;
  z-index: 2;
  background: rgba(28, 33, 41, 0.9);
  backdrop-filter: blur(10px);
}

.sticky-top {
  top: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 12px;
}

.prompt-line {
  margin: 10px 0 0;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: #d1d5db;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.tab-row {
  margin-top: 10px;
  display: flex;
  gap: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tab-row button {
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: #9ca3af;
  padding: 8px 2px;
  font-size: 14px;
}

.tab-row button.active {
  color: #f3f4f6;
  border-bottom-color: #cbd5e1;
}

.scroll-panel {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding: 12px;
}

.native-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-height: 100%;
  align-content: start;
}

.output-card {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 14px;
  min-height: 240px;
  min-width: 0;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.12);
}

.output-card-a {
  background:
    linear-gradient(180deg, rgba(56, 68, 86, 0.5), rgba(39, 47, 60, 0.72)),
    rgba(41, 49, 61, 0.9);
}

.output-card-b {
  background:
    linear-gradient(180deg, rgba(72, 64, 82, 0.42), rgba(46, 44, 57, 0.72)),
    rgba(49, 47, 60, 0.9);
}

.output-card h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #e5e7eb;
}

.analysis-panel {
  min-height: 100%;
  min-width: 0;
}

.output-body {
  flex: 1;
  min-height: 210px;
  min-width: 0;
  overflow: auto;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #e5e7eb;
}

.sticky-bottom {
  bottom: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-row {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.input-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.shortcut-hint {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}

.button-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

textarea {
  flex: 1;
  min-height: 56px;
  min-width: 0;
  resize: vertical;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  color: #f3f4f6;
}

textarea:focus {
  outline: none;
  border-color: rgba(203, 213, 225, 0.28);
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.12);
}

.input-row button {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
}

.input-row button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stop-btn {
  background: rgba(220, 38, 38, 0.92);
  color: #fff;
}

.new-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

@media (max-width: 920px) {
  .native-grid {
    grid-template-columns: 1fr;
  }

  .input-row {
    flex-direction: column;
  }

  .input-actions {
    align-items: stretch;
  }

  .button-row {
    justify-content: flex-start;
  }
}
</style>
