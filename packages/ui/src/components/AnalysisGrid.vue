<template>
  <div class="analysis-root" data-testid="analysis-grid-root">
    <div v-if="error" class="analysis-error" data-testid="analysis-error">
      <h4>分析结果解析失败</h4>
      <p>{{ error }}</p>
      <pre v-if="rawText">{{ rawText }}</pre>
    </div>

    <div v-else-if="result" class="analysis-grid" data-testid="analysis-grid">
      <section class="panel agreements">
        <h4>共识</h4>
        <p>{{ result.agreements }}</p>
      </section>
      <section class="panel">
        <h4>Model A 独有</h4>
        <p>{{ result.uniqueA }}</p>
      </section>
      <section class="panel">
        <h4>Model B 独有</h4>
        <p>{{ result.uniqueB }}</p>
      </section>
      <section class="panel">
        <h4>Model A 分歧</h4>
        <p>{{ result.conflictsA }}</p>
      </section>
      <section class="panel">
        <h4>Model B 分歧</h4>
        <p>{{ result.conflictsB }}</p>
      </section>
    </div>

    <div v-else class="analysis-streaming" data-testid="analysis-streaming">
      <h4>{{ loading ? '分析流进行中' : '等待分析结果' }}</h4>
      <pre>{{ rawText || '分析准备中...' }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AnalysisResult } from '@packages/core/src';

defineProps<{
  result: AnalysisResult | null;
  rawText: string;
  loading: boolean;
  error: string | null;
}>();
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
