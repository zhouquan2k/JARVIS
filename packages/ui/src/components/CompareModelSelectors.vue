<template>
  <div class="compare-selectors">
    <section class="selector-row">
      <span class="selector-label">A</span>
      <select
        data-testid="compare-provider-a"
        v-model="aProviderId"
        @change="onProviderAChange"
        :disabled="disabled || providers.length === 0">
        <option v-for="provider in providers" :key="provider.id" :value="provider.id">
          {{ provider.name }}
        </option>
      </select>
      <select
        data-testid="compare-model-a"
        v-model="aModelId"
        @change="emitModelA"
        :disabled="disabled || modelsA.length === 0">
        <option v-for="model in modelsA" :key="model.id" :value="model.id">
          {{ model.name }}
        </option>
      </select>
    </section>

    <section class="selector-row">
      <span class="selector-label">B</span>
      <select
        data-testid="compare-provider-b"
        v-model="bProviderId"
        @change="onProviderBChange"
        :disabled="disabled || providers.length === 0">
        <option v-for="provider in providers" :key="provider.id" :value="provider.id">
          {{ provider.name }}
        </option>
      </select>
      <select
        data-testid="compare-model-b"
        v-model="bModelId"
        @change="emitModelB"
        :disabled="disabled || modelsB.length === 0">
        <option v-for="model in modelsB" :key="model.id" :value="model.id">
          {{ model.name }}
        </option>
      </select>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProviderConfig } from '@packages/core/config';

interface Selection {
  providerId: string;
  modelId: string;
}

const props = defineProps<{
  providers: ProviderConfig[];
  modelA: Selection;
  modelB: Selection;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelA', payload: Selection): void;
  (e: 'update:modelB', payload: Selection): void;
}>();

const aProviderId = ref(props.modelA.providerId);
const aModelId = ref(props.modelA.modelId);
const bProviderId = ref(props.modelB.providerId);
const bModelId = ref(props.modelB.modelId);

const providerA = computed(() => props.providers.find((item) => item.id === aProviderId.value));
const providerB = computed(() => props.providers.find((item) => item.id === bProviderId.value));
const modelsA = computed(() => providerA.value?.models ?? []);
const modelsB = computed(() => providerB.value?.models ?? []);

watch(() => props.modelA, (value) => {
  aProviderId.value = value.providerId;
  aModelId.value = value.modelId;
}, { deep: true });

watch(() => props.modelB, (value) => {
  bProviderId.value = value.providerId;
  bModelId.value = value.modelId;
}, { deep: true });

function onProviderAChange() {
  const provider = providerA.value;
  if (!provider) return;
  aModelId.value = provider.defaultModel;
  emitModelA();
}

function onProviderBChange() {
  const provider = providerB.value;
  if (!provider) return;
  bModelId.value = provider.defaultModel;
  emitModelB();
}

function emitModelA() {
  if (!aProviderId.value || !aModelId.value) return;
  emit('update:modelA', { providerId: aProviderId.value, modelId: aModelId.value });
}

function emitModelB() {
  if (!bProviderId.value || !bModelId.value) return;
  emit('update:modelB', { providerId: bProviderId.value, modelId: bModelId.value });
}
</script>

<style scoped>
.compare-selectors {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 320px;
}

.selector-label {
  margin: 0;
  font-size: 13px;
  color: #0f172a;
  width: 14px;
  font-weight: 600;
}

select {
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  padding: 6px 8px;
  background: #fff;
  font-size: 13px;
  min-width: 0;
}

.selector-row select:first-of-type {
  flex: 1;
}

.selector-row select:last-of-type {
  flex: 1;
}

@media (max-width: 720px) {
  .selector-row {
    min-width: 100%;
  }
}
</style>
