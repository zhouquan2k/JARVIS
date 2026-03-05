<template>
  <header class="top-nav">
    <h1 class="brand">{{ title }}</h1>
    <button
      class="mode-switch"
      :class="{ active: isCompareMode }"
      @click="$emit('toggleMode')"
      data-testid="mode-switch"
      :aria-pressed="isCompareMode">
      <span class="switch-label">对比模式</span>
      <span class="switch-track">
        <span class="switch-thumb" />
      </span>
    </button>
    <span v-if="isCompareMode" class="compare-stage">{{ compareStageLabel }}</span>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type Stage = 'idle' | 'generating' | 'analyzing' | 'completed' | 'failed';

const props = withDefaults(defineProps<{
  title?: string;
  isCompareMode: boolean;
  compareStage: Stage;
}>(), {
  title: 'ChatPrism'
});

defineEmits<{
  (event: 'toggleMode'): void;
}>();

const compareStageLabel = computed(() => {
  switch (props.compareStage) {
    case 'generating':
      return '并发生成中';
    case 'analyzing':
      return '分析中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return '待开始';
  }
});
</script>

<style scoped>
.top-nav {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  z-index: 20;
}

.brand {
  margin: 0;
  font-size: 22px;
  line-height: 1;
  color: #0f172a;
}

.mode-switch {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  border-radius: 999px;
  padding: 6px 10px 6px 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.switch-label {
  font-size: 13px;
  color: #334155;
}

.switch-track {
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: #cbd5e1;
  position: relative;
  transition: background-color 0.2s ease;
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.mode-switch.active {
  border-color: #1d4ed8;
  background: #eff6ff;
}

.mode-switch.active .switch-label {
  color: #1d4ed8;
}

.mode-switch.active .switch-track {
  background: #3b82f6;
}

.mode-switch.active .switch-thumb {
  transform: translateX(14px);
}

.compare-stage {
  margin-left: auto;
  font-size: 12px;
  color: #1d4ed8;
  background: #dbeafe;
  padding: 4px 10px;
  border-radius: 999px;
}

@media (max-width: 920px) {
  .brand {
    font-size: 20px;
  }
}
</style>
