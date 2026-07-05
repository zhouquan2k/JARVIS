<template>
  <div class="move-dialog-overlay" role="alertdialog" aria-modal="true" aria-labelledby="move-error-title" @keydown.esc="$emit('dismiss')">
    <div class="move-dialog move-dialog--error">
      <h3 id="move-error-title" class="move-dialog-title">
        无法移动
      </h3>
      <p class="move-dialog-message" data-testid="move-error-message">
        {{ errorMessage }}
      </p>
      <div class="move-dialog-actions">
        <button
          type="button"
          class="move-dialog-button primary"
          data-testid="move-error-ok"
          @click="$emit('dismiss')"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  reason: 'cross-scope' | 'references-dir';
}>();

defineEmits<{
  (e: 'dismiss'): void;
}>();

const errorMessage = computed(() => {
  if (props.reason === 'cross-scope') {
    return '无法将文档移动到不同的目录作用域。跨作用域移动不被支持。';
  }
  return '无法移动 references/ 目录。该目录由系统管理，不支持手动移动。';
});
</script>

<style scoped>
.move-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.move-dialog {
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px;
  padding: 20px 24px;
  min-width: 300px;
  max-width: 440px;
  color: #f8fafc;
}

.move-dialog--error {
  border-color: rgba(248, 113, 113, 0.25);
}

.move-dialog-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #fca5a5;
}

.move-dialog-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #cbd5e1;
}

.move-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.move-dialog-button {
  border: 0;
  border-radius: 8px;
  padding: 7px 14px;
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  font-size: 13px;
  cursor: pointer;
}

.move-dialog-button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.move-dialog-button.primary {
  background: rgba(99, 102, 241, 0.72);
}

.move-dialog-button.primary:hover {
  background: rgba(99, 102, 241, 0.9);
}
</style>
