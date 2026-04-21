<template>
  <div class="pdf-viewer-shell" data-testid="document-pdf-viewer">
    <iframe
      v-if="pdfBlobUrl"
      :src="pdfBlobUrl"
      class="pdf-frame"
      :title="t('shared.openPdf')"
    />
    <div v-else class="unsupported-state" data-testid="document-pdf-fallback">
      <p>{{ t('shared.unsupportedPdf') }}</p>
      <a
        v-if="pdfOpenHref"
        :href="pdfOpenHref"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="document-pdf-open-link"
      >
        {{ t('shared.openPdf') }}
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { ContextDocument } from '@packages/core/src';
import { decodeBase64 } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';

defineOptions({
  inheritAttrs: false
});

const props = defineProps<{
  activeDocument: ContextDocument | null;
}>();
const { t } = useWorkspaceI18n();

const pdfBlobUrl = ref<string | null>(null);
const pdfOpenHref = computed(() => {
  const document = props.activeDocument;
  if (document?.mimeType !== 'application/pdf') {
    return null;
  }

  return pdfBlobUrl.value || `data:${document.mimeType};base64,${document.dataBase64}`;
});

watch(
  () => props.activeDocument,
  (document) => {
    if (document?.mimeType !== 'application/pdf') {
      revokePdfBlobUrl();
      return;
    }

    revokePdfBlobUrl();
    const bytes = decodeBase64(document.dataBase64);
    const blobBytes = new Uint8Array(bytes.byteLength);
    blobBytes.set(bytes);
    const blob = new Blob([blobBytes], { type: document.mimeType });
    pdfBlobUrl.value = URL.createObjectURL(blob);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  revokePdfBlobUrl();
});

function revokePdfBlobUrl() {
  if (!pdfBlobUrl.value) {
    return;
  }

  URL.revokeObjectURL(pdfBlobUrl.value);
  pdfBlobUrl.value = null;
}
</script>

<style scoped>
.pdf-viewer-shell,
.unsupported-state {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.pdf-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 0;
  background: rgba(15, 23, 42, 0.72);
}

.unsupported-state {
  align-items: center;
  justify-content: center;
  color: rgba(248, 250, 252, 0.84);
  font-size: 14px;
}
</style>
