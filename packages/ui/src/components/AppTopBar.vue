<template>
  <header class="top-nav">
    <h1 class="brand">{{ title }}</h1>
    <div class="top-meta">
      <span v-if="isCompareMode" class="mode-pill">对比聊天</span>
      <span v-if="isCompareMode" class="compare-stage">{{ compareStageLabel }}</span>
    </div>
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(15, 19, 27, 0.94), rgba(11, 14, 20, 0.9)),
    rgba(7, 10, 18, 0.92);
  backdrop-filter: blur(10px);
  z-index: 20;
}

.brand {
  margin: 0;
  font-size: 22px;
  line-height: 1;
  color: #f3f4f6;
}

.top-meta {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.mode-pill,
.compare-stage {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
}

.mode-pill {
  border: 1px solid rgba(129, 140, 248, 0.22);
  background: rgba(99, 102, 241, 0.12);
  color: #c7d2fe;
}

.compare-stage {
  color: #d1d5db;
  background: rgba(255, 255, 255, 0.06);
}

@media (max-width: 920px) {
  .brand {
    font-size: 20px;
  }
}
</style>
