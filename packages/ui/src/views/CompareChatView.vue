<template>
  <div class="compare-container" data-testid="compare-chat-view">
    <header class="sticky-top">
      <p class="prompt-line" v-if="compareStore.prompt">当前问题：{{ compareStore.prompt }}</p>
      <nav class="tab-row">
        <button
          data-testid="tab-native"
          :class="{ active: compareStore.activeTab === 'native' }"
          @click="compareStore.setActiveTab('native')">
          原生输出
        </button>
        <button
          data-testid="tab-analysis"
          :class="{ active: compareStore.activeTab === 'analysis' }"
          @click="compareStore.setActiveTab('analysis')">
          深度剖析
        </button>
      </nav>
    </header>

    <main class="scroll-panel">
      <section v-if="compareStore.activeTab === 'native'" class="native-grid">
        <article class="output-card">
          <h3>Model A</h3>
          <div class="output-body" data-testid="output-a">
            <MarkdownContent v-if="compareStore.outputA" :source="compareStore.outputA" />
            <pre v-else>{{ outputPlaceholder }}</pre>
          </div>
        </article>
        <article class="output-card">
          <h3>Model B</h3>
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
          @keydown.enter.prevent="submitCompare"
          placeholder="输入问题后同时对比两个模型..."
          :disabled="isBusy || !isSelectionReady"
        />
        <button
          data-testid="compare-send"
          @click="submitCompare"
          :disabled="!inputPrompt.trim() || isBusy || !isSelectionReady"
        >
          开始对比
        </button>
        <button v-if="isBusy" class="stop-btn" @click="compareStore.abort()" data-testid="compare-stop">停止</button>
        <button class="new-btn" @click="startNewChat" :disabled="isBusy" data-testid="compare-new">新建聊天</button>
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

const compareStore = useCompareStore();
const inputPrompt = ref('');

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
  if (compareStore.stage === 'idle') return '等待输入...';
  if (compareStore.stage === 'generating') return '流式生成中...';
  return '暂无输出';
});

async function submitCompare() {
  const prompt = inputPrompt.value.trim();
  if (!prompt || isBusy.value || !isSelectionReady.value) return;
  await compareStore.executeCompare(prompt);
  inputPrompt.value = '';
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
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sticky-top,
.sticky-bottom {
  position: sticky;
  z-index: 2;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
}

.sticky-top {
  top: 0;
  border-bottom: 1px solid #dbeafe;
  padding: 8px 12px;
}

.prompt-line {
  margin: 10px 0 0;
  padding: 10px 12px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #f8fafc;
  color: #334155;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.tab-row {
  margin-top: 10px;
  display: flex;
  gap: 16px;
  border-bottom: 1px solid #dbeafe;
}

.tab-row button {
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: #64748b;
  padding: 8px 2px;
  font-size: 14px;
}

.tab-row button.active {
  color: #1d4ed8;
  border-bottom-color: #1d4ed8;
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
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
  min-height: 240px;
  min-width: 0;
}

.output-card h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #1e3a8a;
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
  color: #0f172a;
}

.sticky-bottom {
  bottom: 0;
  border-top: 1px solid #dbeafe;
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

textarea {
  flex: 1;
  min-height: 56px;
  min-width: 0;
  resize: vertical;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 10px;
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
  background: #dc2626;
  color: #fff;
}

.new-btn {
  background: #2563eb;
  color: #fff;
}

@media (max-width: 920px) {
  .native-grid {
    grid-template-columns: 1fr;
  }

  .input-row {
    flex-direction: column;
  }
}
</style>
