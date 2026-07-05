<template>
  <div v-if="imageGroups.length" class="annotation-layer">
    <div v-for="group in imageGroups" :key="group.payload.groupId" class="image-group">
      <button
        v-for="image in group.payload.images"
        :key="image.id"
        class="image-tile"
        type="button"
        @click="activeImage = image.remoteUrl || toDataUrl(image.mimeType, image.previewBase64)"
      >
        <img
          v-if="image.previewBase64"
          :src="toDataUrl(image.mimeType, image.previewBase64)"
          :alt="image.alt || image.id"
        />
      </button>
    </div>

    <button
      v-if="activeImage"
      class="lightbox"
      type="button"
      @click="activeImage = null"
    >
      <img :src="activeImage" alt="preview" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { WorkspaceImageGroupAnnotation, WorkspaceMessageAnnotation } from '../types/messageAnnotations';

const props = defineProps<{
  annotations?: WorkspaceMessageAnnotation[];
}>();

const activeImage = ref<string | null>(null);

const imageGroups = computed(() => (
  props.annotations || []
).filter((annotation): annotation is WorkspaceImageGroupAnnotation => annotation.kind === 'image_group'));

function toDataUrl(mimeType: string, previewBase64?: string) {
  return `data:${mimeType};base64,${previewBase64 || ''}`;
}
</script>

<style scoped>
.annotation-layer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.image-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.image-tile {
  border: none;
  padding: 0;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.image-tile img {
  width: 100%;
  height: 140px;
  object-fit: cover;
  display: block;
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(2, 6, 23, 0.92);
}

.lightbox img {
  max-width: min(88vw, 1200px);
  max-height: 88vh;
  border-radius: 20px;
}
</style>
