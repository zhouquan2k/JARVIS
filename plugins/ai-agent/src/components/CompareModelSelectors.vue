<template>
  <div class="compare-selectors">
    <ProviderModelSelector
      :providers="providers"
      :current-provider-id="modelA.providerId"
      :current-model-id="modelA.modelId"
      :models-loading="modelALoading"
      :disabled="disabled"
      :compact="true"
      leading-label="A"
      provider-test-id="compare-provider-a"
      model-test-id="compare-model-a"
      @provider-change="$emit('update:modelAProviderId', $event)"
      @model-change="$emit('update:modelAModelId', $event)"
    />
    <ProviderModelSelector
      :providers="providers"
      :current-provider-id="modelB.providerId"
      :current-model-id="modelB.modelId"
      :models-loading="modelBLoading"
      :disabled="disabled"
      :compact="true"
      leading-label="B"
      provider-test-id="compare-provider-b"
      model-test-id="compare-model-b"
      @provider-change="$emit('update:modelBProviderId', $event)"
      @model-change="$emit('update:modelBModelId', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { ProviderConfig } from '@packages/core/config';
import ProviderModelSelector from './ProviderModelSelector.vue';

interface Selection {
  providerId: string;
  modelId: string;
}

defineProps<{
  providers: ProviderConfig[];
  modelA: Selection;
  modelB: Selection;
  modelALoading?: boolean;
  modelBLoading?: boolean;
  disabled?: boolean;
}>();

defineEmits<{
  (e: 'update:modelAProviderId', providerId: string): void;
  (e: 'update:modelAModelId', modelId: string): void;
  (e: 'update:modelBProviderId', providerId: string): void;
  (e: 'update:modelBModelId', modelId: string): void;
}>();
</script>

<style scoped>
.compare-selectors {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 920px) {
  .compare-selectors {
    align-items: stretch;
  }
}
</style>
