<template>
  <div ref="rootRef" class="dropdown-menu">
    <slot name="trigger" :trigger-props="triggerProps" />
    <slot v-if="modelValue" name="menu" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  closeOnEscape?: boolean;
}>(), {
  closeOnEscape: true
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const triggerProps = computed(() => ({
  'aria-expanded': props.modelValue
}));

function close(): void {
  if (props.modelValue) {
    emit('update:modelValue', false);
  }
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!props.modelValue) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node) || !rootRef.value?.contains(target)) {
    close();
  }
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (props.closeOnEscape && event.key === 'Escape') {
    close();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('keydown', handleWindowKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('keydown', handleWindowKeydown);
});
</script>
