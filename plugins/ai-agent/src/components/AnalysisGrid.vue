<template>
  <div class="analysis-root" data-testid="analysis-grid-root">
    <div v-if="error" class="analysis-error" data-testid="analysis-error">
      <h4>{{ t('shared.analysisFailed') }}</h4>
      <p>{{ error }}</p>
      <pre v-if="rawText">{{ rawText }}</pre>
    </div>

    <div v-else-if="result" class="analysis-grid" data-testid="analysis-grid">
      <section class="panel agreements">
        <h4>{{ t('shared.consensus') }}</h4>
        <p>{{ result.agreements }}</p>
      </section>
      <section class="panel">
        <h4>{{ t('shared.uniqueA') }}</h4>
        <p>{{ result.uniqueA }}</p>
      </section>
      <section class="panel">
        <h4>{{ t('shared.uniqueB') }}</h4>
        <p>{{ result.uniqueB }}</p>
      </section>
      <section class="panel">
        <h4>{{ t('shared.conflictsA') }}</h4>
        <p>{{ result.conflictsA }}</p>
      </section>
      <section class="panel">
        <h4>{{ t('shared.conflictsB') }}</h4>
        <p>{{ result.conflictsB }}</p>
      </section>
    </div>

    <div v-else class="analysis-streaming" data-testid="analysis-streaming">
      <h4>{{ loading ? t('shared.analysisStreaming') : t('shared.waitingAnalysis') }}</h4>
      <pre>{{ rawText || t('shared.analysisPreparing') }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AnalysisResult } from '@plugins/ai-agent/src/internal';
import { useWorkspaceI18n } from '@packages/ui';

defineProps<{
  result: AnalysisResult | null;
  rawText: string;
  loading: boolean;
  error: string | null;
}>();

const { t } = useWorkspaceI18n();
</script>

<style scoped>
.analysis-root {
  min-height: 100%;
}

.analysis-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.panel {
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}

.agreements {
  grid-column: 1 / -1;
  background: #f8fafc;
  border-color: #cbd5e1;
}

h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #334155;
}

p {
  margin: 0;
  white-space: pre-wrap;
  color: #0f172a;
}

.analysis-streaming,
.analysis-error {
  border: 1px solid #d4d4d8;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
}

.analysis-error {
  border-color: #fca5a5;
  background: #fef2f2;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 48vh;
  overflow: auto;
}

@media (max-width: 720px) {
  .analysis-grid {
    grid-template-columns: 1fr;
  }
}
</style>
