<template>
  <div v-if="attachments.length > 0" class="message-attachments">
    <div
      v-for="attachment in attachments"
      :key="attachment.id"
      class="attachment-card"
    >
      <img
        v-if="attachment.type === 'image' && attachment.previewBase64"
        :src="`data:${attachment.mimeType};base64,${attachment.previewBase64}`"
        :alt="attachment.name"
      />
      <div class="attachment-meta">
        <strong>{{ attachment.name }}</strong>
        <span>{{ formatSize(attachment.size) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MessageAttachment } from '@packages/core/src';

defineProps<{
  attachments: MessageAttachment[];
}>();

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
.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.attachment-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 140px;
  max-width: 220px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
}

.attachment-card img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 10px;
}

.attachment-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.attachment-meta strong {
  font-size: 13px;
  color: var(--cp-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-meta span {
  font-size: 12px;
  color: var(--cp-text-muted);
}
</style>
