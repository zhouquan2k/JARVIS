<template>
  <div class="move-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="move-confirm-title" @keydown.esc="$emit('cancel')">
    <div class="move-dialog">
      <h3 id="move-confirm-title" class="move-dialog-title">
        移动文档
      </h3>
      <p class="move-dialog-message" data-testid="move-confirm-message">
        将 <strong>{{ nodeName }}</strong> 移动到 <strong>{{ destinationPath }}</strong>？
      </p>
      <p v-if="hasOutgoingLinks" class="move-dialog-warning" data-testid="move-confirm-links-warning">
        此文档包含相对链接，移动后链接路径将自动更新。
      </p>
      <div class="move-dialog-actions">
        <button
          type="button"
          class="move-dialog-button"
          data-testid="move-confirm-cancel"
          @click="$emit('cancel')"
        >
          取消
        </button>
        <button
          type="button"
          class="move-dialog-button primary"
          data-testid="move-confirm-ok"
          @click="$emit('confirm')"
        >
          移动
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  nodeName: string;
  destinationPath: string;
  hasOutgoingLinks: boolean;
}>();

defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();
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
  min-width: 320px;
  max-width: 480px;
  color: #f8fafc;
}

.move-dialog-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #f8fafc;
}

.move-dialog-message {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.5;
  color: #cbd5e1;
}

.move-dialog-warning {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 6px;
  padding: 6px 10px;
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
