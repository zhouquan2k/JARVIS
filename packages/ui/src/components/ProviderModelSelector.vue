<template>
  <div class="provider-model-selector">
    <select v-model="selectedProviderId" @change="onProviderChange" :disabled="providers.length === 0">
      <option v-for="p in providers" :key="p.id" :value="p.id">
        {{ p.name }}
      </option>
    </select>
    <select v-model="selectedModelId" @change="onModelChange" :disabled="currentModels.length === 0">
      <option v-for="m in currentModels" :key="m.id" :value="m.id">
        {{ m.name }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { ProviderConfig } from '@packages/core/config';

const props = defineProps<{
  providers: ProviderConfig[];
}>();

const emit = defineEmits<{
  (e: 'change', payload: { providerId: string; modelId: string }): void
}>();

const selectedProviderId = ref('');
const selectedModelId = ref('');

const currentProvider = computed(() => {
  return props.providers.find(p => p.id === selectedProviderId.value) || props.providers[0];
});

const currentModels = computed(() => {
  return currentProvider.value?.models || [];
});

function init() {
  if (props.providers.length > 0) {
    selectedProviderId.value = props.providers[0].id;
    selectedModelId.value = props.providers[0].defaultModel;
    emitChange();
  }
}

function onProviderChange() {
  selectedModelId.value = currentProvider.value.defaultModel;
  emitChange();
}

function onModelChange() {
  emitChange();
}

function emitChange() {
  if (!selectedProviderId.value || !selectedModelId.value) return;
  emit('change', { providerId: selectedProviderId.value, modelId: selectedModelId.value });
}

watch(() => props.providers, () => {
  init();
}, { deep: true });

onMounted(() => {
  init();
});
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
