<template>
  <div class="provider-model-selector">
    <select
      data-testid="normal-provider"
      v-model="selectedProviderId"
      @change="onProviderChange"
      :disabled="providers.length === 0">
      <option v-for="provider in providers" :key="provider.id" :value="provider.id">
        {{ provider.name }}
      </option>
    </select>
    <select
      data-testid="normal-model"
      v-model="selectedModelId"
      @change="onModelChange"
      :disabled="modelsLoading || currentModels.length === 0">
      <option v-if="modelsLoading" value="">
        加载模型中...
      </option>
      <option v-else-if="currentModels.length === 0" value="">
        无可用模型
      </option>
      <option v-for="model in currentModels" :key="model.id" :value="model.id">
        {{ model.name }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProviderConfig } from '@packages/core/config';

const props = defineProps<{
  providers: ProviderConfig[];
  currentProviderId: string;
  currentModelId: string;
  modelsLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'provider-change', providerId: string): void;
  (e: 'model-change', modelId: string): void;
}>();

const selectedProviderId = ref(props.currentProviderId);
const selectedModelId = ref(props.currentModelId);

const currentProvider = computed(() => {
  return props.providers.find((provider) => provider.id === selectedProviderId.value) || props.providers[0];
});

const currentModels = computed(() => {
  if (props.modelsLoading) {
    return [];
  }

  return currentProvider.value?.models || [];
});

watch(() => props.currentProviderId, (value) => {
  selectedProviderId.value = value;
}, { immediate: true });

watch(() => props.currentModelId, (value) => {
  selectedModelId.value = value;
}, { immediate: true });

function onProviderChange() {
  if (!selectedProviderId.value) return;
  selectedModelId.value = '';
  emit('provider-change', selectedProviderId.value);
}

function onModelChange() {
  if (!selectedModelId.value) return;
  emit('model-change', selectedModelId.value);
}
</script>

<style scoped>
.provider-model-selector {
  display: flex;
  gap: 8px;
  align-items: center;
}

select {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #ddd;
  background: white;
  font-size: 14px;
  outline: none;
}
</style>
