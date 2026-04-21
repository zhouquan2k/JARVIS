<template>
  <div class="image-viewer-shell" data-testid="document-image-viewer">
    <img
      v-if="imageDataUrl"
      class="image-preview"
      :src="imageDataUrl"
      :alt="activePathLabel"
    >
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ContextDocument } from '@packages/core/src';

defineOptions({
  inheritAttrs: false
});

const props = defineProps<{
  activeDocument: ContextDocument | null;
}>();

const activePathLabel = computed(() => {
  const activePath = props.activeDocument?.path;
  if (!activePath) {
    return '';
  }

  const segments = activePath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? activePath;
});
const imageDataUrl = computed(() => {
  const document = props.activeDocument;
  if (!document?.mimeType.startsWith('image/')) {
    return null;
  }

  return `data:${document.mimeType};base64,${document.dataBase64}`;
});
</script>

<style scoped>
.image-viewer-shell {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 18px;
  box-sizing: border-box;
}

.image-preview {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
