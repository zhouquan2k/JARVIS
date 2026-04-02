<template>
  <div class="provider-model-selector" :class="{ compact }">
    <span v-if="leadingLabel" class="selector-badge">{{ leadingLabel }}</span>
    <label class="select-shell provider-shell">
      <span class="sr-only">选择 Provider</span>
      <select
        :data-testid="providerTestId"
        v-model="selectedProviderId"
        class="select-control"
        @change="onProviderChange"
        :disabled="disabled || providers.length === 0">
        <option v-for="provider in providers" :key="provider.id" :value="provider.id">
          {{ provider.name }}
        </option>
      </select>
    </label>
    <label class="select-shell model-shell">
      <span class="sr-only">选择模型</span>
      <select
        :data-testid="modelTestId"
        v-model="selectedModelId"
        class="select-control"
        @change="onModelChange"
        :disabled="disabled || modelsLoading || currentModels.length === 0">
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
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProviderConfig } from '@packages/core/config';

const props = withDefaults(defineProps<{
  providers: ProviderConfig[];
  currentProviderId: string;
  currentModelId: string;
  modelsLoading?: boolean;
  disabled?: boolean;
  providerTestId?: string;
  modelTestId?: string;
  leadingLabel?: string;
  compact?: boolean;
}>(), {
  providerTestId: 'normal-provider',
  modelTestId: 'normal-model',
  leadingLabel: '',
  compact: false,
  disabled: false
});

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
  --selector-control-height: 35px;
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  flex: 0 1 auto;
}

.selector-badge {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: var(--cp-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.select-shell {
  position: relative;
  display: flex;
  align-items: center;
  min-height: var(--selector-control-height);
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(34, 39, 48, 0.96), rgba(22, 26, 34, 0.98)),
    rgba(17, 24, 39, 0.96);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 30px rgba(0, 0, 0, 0.18);
}

.select-shell::after {
  content: '';
  position: absolute;
  right: 16px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid rgba(226, 232, 240, 0.78);
  border-bottom: 1.5px solid rgba(226, 232, 240, 0.78);
  transform: translateY(-70%) rotate(45deg);
  pointer-events: none;
}

.provider-shell {
  flex: 0 0 auto;
  width: clamp(148px, 14vw, 184px);
}

.model-shell {
  flex: 0 0 auto;
  width: clamp(188px, 19vw, 248px);
}

.provider-model-selector.compact .provider-shell {
  width: clamp(140px, 15vw, 172px);
}

.provider-model-selector.compact .model-shell {
  width: clamp(170px, 17vw, 214px);
}

.select-control {
  width: 100%;
  height: var(--selector-control-height);
  min-width: 0;
  padding: 0 42px 0 14px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--cp-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  outline: none;
  appearance: none;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.select-control:focus-visible {
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.26);
}

.select-control:disabled {
  color: var(--cp-text-muted);
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 720px) {
  .provider-model-selector {
    flex-direction: column;
    align-items: stretch;
  }

  .provider-shell,
  .model-shell {
    flex-basis: auto;
  }
}
</style>
