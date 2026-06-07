<template>
  <div class="import-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="import-wizard-title">
    <section class="import-dialog-panel">
      <header class="import-dialog-header">
        <div>
          <h2 id="import-wizard-title">{{ t('shared.importDocument') }}</h2>
          <p class="import-dialog-subtitle">{{ t('shared.importWizardSubtitle') }}</p>
        </div>
        <button
          type="button"
          class="import-dialog-close"
          data-testid="import-wizard-close"
          :disabled="isRunning"
          @click="$emit('close')"
        >
          {{ t('shared.close') }}
        </button>
      </header>

      <ol class="import-stepper">
        <li :class="{ active: currentStep === 1 }">{{ t('shared.importStepSource') }}</li>
        <li :class="{ active: currentStep === 2 }">{{ t('shared.importStepConfigure') }}</li>
        <li :class="{ active: currentStep === 3 }">{{ t('shared.importStepExecute') }}</li>
      </ol>

      <!-- Step 1: Source selection -->
      <section v-if="currentStep === 1" class="import-step-body import-step-source" data-testid="import-step-source">
        <button
          v-for="source in sortedSources"
          :key="source.id"
          type="button"
          class="import-source-card"
          :class="{ selected: source.id === selectedSourceId }"
          :data-testid="`import-source-${source.id}`"
          @click="selectSource(source.id)"
        >
          <div class="import-source-icon-area">
            <span
              v-if="source.icon && source.icon.trimStart().startsWith('<')"
              class="import-source-icon-svg"
              v-html="source.icon"
            />
            <span v-else-if="source.icon" class="import-source-icon-emoji">{{ source.icon }}</span>
            <span v-else class="import-source-icon-fallback">{{ resolveSourceTitle(source).charAt(0) }}</span>
          </div>
          <div class="import-source-title">{{ resolveSourceTitle(source) }}</div>
        </button>
      </section>

      <!-- Step 2: Configure -->
      <section v-else-if="currentStep === 2" class="import-step-body import-step-configure" data-testid="import-step-configure">
        <label class="import-field">
          <span class="import-field-label">{{ t('shared.importTargetDirectory') }}</span>
          <select
            v-model="targetParentPath"
            class="import-select"
            data-testid="import-target-directory"
            :disabled="isRunning"
          >
            <option v-for="directory in directories" :key="directory.path" :value="directory.path">
              {{ directory.label }}
            </option>
          </select>
        </label>

        <div v-if="selectedFormComponent" class="import-source-form-wrap">
          <component
            :is="selectedFormComponent"
            :model-value="currentParams"
            :language-models="languageModels"
            :disabled="isRunning"
            data-testid="import-source-form"
            @update:model-value="updateCurrentParams"
          />
        </div>
      </section>

      <!-- Step 3: Execute -->
      <section v-else class="import-step-body import-step-execute" data-testid="import-step-execute">
        <div v-if="stageEntries.length" class="import-stage-list">
          <div
            v-for="stage in stageEntries"
            :key="stage.key"
            class="import-stage-row"
            :class="`import-stage-row--${stage.status}`"
          >
            <div class="import-stage-row-main">
              <span class="import-stage-indicator" :class="`import-stage-indicator--${stage.status}`" />
              <strong>{{ stage.label }}</strong>
              <span class="import-stage-status">{{ resolveStageStatus(stage.status) }}</span>
            </div>
            <p v-if="stage.detail" class="import-stage-detail">{{ stage.detail }}</p>
          </div>
        </div>
        <div v-else class="import-stage-waiting">
          <p class="import-stage-empty">{{ t('shared.importWizardWaitingToStart') }}</p>
        </div>
        <p v-if="executionError" class="import-stage-error" data-testid="import-stage-error">
          {{ executionError }}
        </p>
      </section>

      <footer class="import-dialog-footer">
        <button
          v-if="currentStep > 1"
          type="button"
          class="import-dialog-button"
          data-testid="import-wizard-back"
          :disabled="isRunning"
          @click="goBack"
        >
          {{ t('shared.back') }}
        </button>
        <button
          v-if="currentStep < 3"
          type="button"
          class="import-dialog-button primary"
          data-testid="import-wizard-next"
          :disabled="!selectedSource"
          @click="goNext"
        >
          {{ currentStep === 1 ? t('shared.next') : t('shared.startImport') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, ref } from 'vue';
import type { DocumentImportContribution, LanguageModelContribution } from '@packages/core';
import { useWorkspaceI18n } from '../i18n';

type DirectoryOption = {
  path: string;
  label: string;
};

type ImportStageUpdate = {
  key: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  detail?: string;
};

const props = defineProps<{
  sources: readonly DocumentImportContribution[];
  languageModels: readonly LanguageModelContribution[];
  directories: DirectoryOption[];
  initialTargetParentPath: string;
  runImport: (input: {
    contribution: DocumentImportContribution;
    params: unknown;
    targetParentPath: string;
    onStageChange: (stage: ImportStageUpdate) => void;
  }) => Promise<void>;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const { t } = useWorkspaceI18n();
const currentStep = ref<1 | 2 | 3>(1);
const selectedSourceId = ref(props.sources[0]?.id ?? '');
const targetParentPath = ref(props.initialTargetParentPath);
const paramsBySourceId = ref<Record<string, unknown>>({});
const stageEntries = ref<ImportStageUpdate[]>([]);
const executionError = ref('');
const isRunning = ref(false);

const sortedSources = computed(() => {
  return [...props.sources].sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.title.localeCompare(right.title, 'zh-Hans-CN');
  });
});

const selectedSource = computed(() => {
  return sortedSources.value.find((source) => source.id === selectedSourceId.value) ?? null;
});

const selectedFormComponent = computed(() => {
  const formComponent = selectedSource.value?.formComponent ?? null;
  if (formComponent && typeof formComponent === 'object') {
    return markRaw(formComponent);
  }

  return formComponent;
});

const currentParams = computed(() => {
  const source = selectedSource.value;
  if (!source) {
    return {};
  }

  const cached = paramsBySourceId.value[source.id];
  if (cached !== undefined) {
    return cached;
  }

  const initialParams = source.createInitialParams?.() ?? {};
  paramsBySourceId.value = {
    ...paramsBySourceId.value,
    [source.id]: initialParams
  };
  return initialParams;
});

function resolveSourceTitle(source: DocumentImportContribution): string {
  if (source.titleKey) {
    return t(source.titleKey);
  }

  return source.title;
}

function resolveStageStatus(status: ImportStageUpdate['status']): string {
  if (status === 'completed') {
    return t('shared.importStageCompleted');
  }

  if (status === 'failed') {
    return t('shared.importStageFailed');
  }

  return t('shared.importStageRunning');
}

function selectSource(sourceId: string) {
  selectedSourceId.value = sourceId;
}

function updateCurrentParams(nextValue: unknown) {
  const source = selectedSource.value;
  if (!source) {
    return;
  }

  paramsBySourceId.value = {
    ...paramsBySourceId.value,
    [source.id]: nextValue
  };
}

function goBack() {
  if (currentStep.value === 1 || isRunning.value) {
    return;
  }

  currentStep.value = currentStep.value === 3 ? 2 : 1;
}

async function goNext() {
  if (!selectedSource.value) {
    return;
  }

  if (currentStep.value === 1) {
    currentStep.value = 2;
    return;
  }

  currentStep.value = 3;
  isRunning.value = true;
  executionError.value = '';
  stageEntries.value = [];

  try {
    await props.runImport({
      contribution: selectedSource.value,
      params: currentParams.value,
      targetParentPath: targetParentPath.value,
      onStageChange(stage) {
        const index = stageEntries.value.findIndex((entry) => entry.key === stage.key);
        if (index >= 0) {
          stageEntries.value.splice(index, 1, stage);
          return;
        }

        stageEntries.value = [...stageEntries.value, stage];
      }
    });
    emit('close');
  } catch (error) {
    executionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isRunning.value = false;
  }
}
</script>

<style scoped>
/* ── Overlay & Panel ── */
.import-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.45);
  z-index: 30;
}

.import-dialog-panel {
  width: min(720px, 100%);
  max-height: min(90vh, 720px);
  overflow: auto;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
  padding: 28px 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Header ── */
.import-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.import-dialog-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.import-dialog-subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
}

.import-dialog-close {
  flex-shrink: 0;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  border-radius: 10px;
  padding: 7px 16px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.import-dialog-close:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

/* ── Stepper ── */
.import-stepper {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  list-style: none;
  padding: 0;
  margin: 24px 0 20px;
}

.import-stepper li {
  border-radius: 999px;
  background: #f1f5f9;
  color: #94a3b8;
  padding: 9px 12px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: background 0.15s, color 0.15s;
}

.import-stepper li.active {
  background: #ccfbf1;
  color: #0f766e;
}

/* ── Step body shared ── */
.import-step-body {
  flex: 1;
  min-height: 240px;
}

/* ── Step 1: Source selection ── */
.import-step-source {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(152px, 1fr));
  gap: 14px;
  align-content: start;
}

.import-source-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  padding: 24px 16px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.import-source-card:hover:not(.selected) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.import-source-card.selected {
  border-color: #0f766e;
  background: #f0fdfa;
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}

.import-source-icon-area {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.import-source-icon-svg {
  display: block;
  width: 60px;
  height: 60px;
}

.import-source-icon-svg :deep(svg) {
  width: 100%;
  height: 100%;
}

.import-source-icon-emoji {
  font-size: 40px;
  line-height: 1;
}

.import-source-icon-fallback {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: #e2e8f0;
  color: #475569;
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.import-source-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.3;
}

/* ── Step 2: Configure ── */
.import-step-configure {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.import-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.import-field-label {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.import-select {
  height: 42px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 14px;
  color: #0f172a;
  background: #fff;
  transition: border-color 0.12s;
}

.import-select:focus {
  outline: none;
  border-color: #0f766e;
}

.import-source-form-wrap {
  padding-top: 4px;
}

/* ── Step 3: Execute ── */
.import-step-execute {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-stage-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.import-stage-row {
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 14px 16px;
  background: #f8fafc;
}

.import-stage-row--running {
  border-color: #38bdf8;
  background: #f0f9ff;
}

.import-stage-row--completed {
  border-color: #86efac;
  background: #f0fdf4;
}

.import-stage-row--failed {
  border-color: #fca5a5;
  background: #fef2f2;
}

.import-stage-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.import-stage-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #94a3b8;
}

.import-stage-indicator--running {
  background: #0ea5e9;
  animation: pulse 1.2s ease-in-out infinite;
}

.import-stage-indicator--completed {
  background: #22c55e;
}

.import-stage-indicator--failed {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.import-stage-status {
  margin-left: auto;
  font-size: 13px;
  color: #64748b;
}

.import-stage-detail {
  margin: 8px 0 0 18px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.import-stage-waiting {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
}

.import-stage-empty {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
}

.import-stage-error {
  margin: 4px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  font-size: 14px;
  line-height: 1.5;
}

/* ── Footer ── */
.import-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #f1f5f9;
}

.import-dialog-button {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #374151;
  border-radius: 10px;
  padding: 9px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.import-dialog-button:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.import-dialog-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.import-dialog-button.primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #fff;
}

.import-dialog-button.primary:hover:not(:disabled) {
  background: #0d6b63;
  border-color: #0d6b63;
}
</style>
