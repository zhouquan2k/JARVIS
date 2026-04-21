<template>
  <div class="attachment-composer">
    <input
      ref="fileInputRef"
      class="file-input"
      type="file"
      multiple
      @change="onInputChange"
    />

    <div class="composer-actions">
      <button
        class="attach-btn"
        type="button"
        :disabled="disabled"
        :title="disabledReason || undefined"
        data-testid="attachment-trigger"
        @click="fileInputRef?.click()"
      >
        <span class="attach-btn-icon">+</span>
        <span>{{ t('shared.attachments') }}</span>
      </button>
      <p v-if="disabledReason" class="hint-text" data-testid="attachment-disabled-reason">{{ disabledReason }}</p>
      <p v-if="error" class="error-text" data-testid="attachment-error">{{ error }}</p>
    </div>

    <div v-if="attachments.length > 0" class="draft-list">
      <button
        v-for="attachment in attachments"
        :key="attachment.id"
        class="draft-chip"
        type="button"
        @click="$emit('remove', attachment.id)"
      >
        <img
          v-if="attachment.type === 'image' && attachment.previewBase64"
          :src="`data:${attachment.mimeType};base64,${attachment.previewBase64}`"
          :alt="attachment.name"
        />
        <span class="draft-name">{{ attachment.name }}</span>
        <span class="draft-size">{{ formatSize(attachment.size) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { MessageAttachment } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';

defineProps<{
  attachments: MessageAttachment[];
  disabled?: boolean;
  disabledReason?: string | null;
  error?: string | null;
}>();

const emit = defineEmits<{
  (event: 'select-files', files: File[]): void;
  (event: 'remove', attachmentId: string): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const { t } = useWorkspaceI18n();

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  emit('select-files', Array.from(input.files || []));
  input.value = '';
}

function formatSize(size: number): string {
  if (size < 1024) {
    return `${size}B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)}KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}
</script>

<style scoped>
.attachment-composer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.file-input {
  display: none;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.draft-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  flex-basis: 100%;
}

.draft-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--cp-text-primary);
  cursor: pointer;
}

.draft-chip img {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 10px;
}

.draft-name {
  font-size: 13px;
  font-weight: 500;
}

.draft-size {
  font-size: 12px;
  color: var(--cp-text-muted);
}

.attach-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 999px;
  padding: 9px 12px;
  background: linear-gradient(180deg, rgba(53, 60, 72, 0.82), rgba(29, 34, 44, 0.9));
  color: var(--cp-text-primary);
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.attach-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attach-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
  line-height: 1;
}

.error-text {
  margin: 0;
  font-size: 12px;
  color: #fca5a5;
}

.hint-text {
  margin: 0;
  font-size: 12px;
  color: var(--cp-text-muted);
}
</style>
