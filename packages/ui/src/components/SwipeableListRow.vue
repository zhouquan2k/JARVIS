<template>
  <div
    ref="rootRef"
    class="swipeable-row"
    :class="{ 'swipeable-row--enabled': enabled, 'swipeable-row--open': enabled && isOpen }"
  >
    <div
      v-if="enabled"
      class="swipeable-row__actions"
      :style="{ width: `${revealWidth}px` }"
      data-testid="swipeable-row-actions"
      aria-hidden="false"
    >
      <slot name="actions" :close="close" />
    </div>
    <div
      ref="trackRef"
      class="swipeable-row__track"
      :class="{ 'swipeable-row__track--animated': !isSwiping }"
      :style="enabled ? { transform: `translateX(${-offset}px)` } : undefined"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSwipe } from '@vueuse/core';

const props = withDefaults(
  defineProps<{
    /** When false the row renders as a plain pass-through (desktop / mouse). */
    enabled?: boolean;
    /** Reveal panel width in px. */
    revealWidth?: number;
    /** Controlled open state, lets a parent coordinate one-open-at-a-time. */
    open?: boolean;
  }>(),
  {
    enabled: false,
    revealWidth: 84,
    open: false
  }
);

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);

// Distance the track is shifted to the left, in px (0 = closed).
const offset = ref(props.open ? props.revealWidth : 0);
const isOpen = ref(props.open);

// Threshold (px) past which a release snaps to the open position.
const OPEN_SNAP_THRESHOLD = 32;
// Horizontal movement must dominate before we treat the gesture as a swipe,
// otherwise we let the vertical scroll win.
const DIRECTION_LOCK_THRESHOLD = 10;

let baseOffset = 0;
let directionLocked: 'horizontal' | 'vertical' | null = null;

const { isSwiping, lengthX, lengthY } = useSwipe(trackRef, {
  passive: false,
  threshold: 4,
  onSwipeStart() {
    if (!props.enabled) {
      return;
    }
    baseOffset = offset.value;
    directionLocked = null;
  },
  onSwipe(event: TouchEvent) {
    if (!props.enabled) {
      return;
    }

    // useSwipe reports lengthX>0 when moving left (start.x - end.x).
    const movedX = lengthX.value;
    const movedY = lengthY.value;

    if (directionLocked === null) {
      if (Math.abs(movedX) > DIRECTION_LOCK_THRESHOLD || Math.abs(movedY) > DIRECTION_LOCK_THRESHOLD) {
        directionLocked = Math.abs(movedX) >= Math.abs(movedY) ? 'horizontal' : 'vertical';
      }
    }

    if (directionLocked !== 'horizontal') {
      // Let the browser handle vertical scrolling.
      return;
    }

    // Prevent the page from scrolling while we drive the horizontal reveal.
    if (event.cancelable) {
      event.preventDefault();
    }

    const next = baseOffset + movedX;
    offset.value = clamp(next, 0, props.revealWidth);
  },
  onSwipeEnd() {
    if (!props.enabled || directionLocked !== 'horizontal') {
      directionLocked = null;
      return;
    }
    directionLocked = null;
    setOpen(offset.value >= OPEN_SNAP_THRESHOLD);
  }
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function setOpen(next: boolean): void {
  offset.value = next ? props.revealWidth : 0;
  if (isOpen.value !== next) {
    isOpen.value = next;
    emit('update:open', next);
  }
}

function close(): void {
  setOpen(false);
}

watch(
  () => props.open,
  (next) => {
    if (next !== isOpen.value) {
      setOpen(next);
    }
  }
);

watch(
  () => props.enabled,
  (next) => {
    if (!next) {
      // Reset any revealed state when swipe is disabled (e.g. viewport widened).
      offset.value = 0;
      if (isOpen.value) {
        isOpen.value = false;
        emit('update:open', false);
      }
    }
  }
);

defineExpose({ close });
</script>

<style scoped>
.swipeable-row {
  position: relative;
  width: 100%;
  /* No overflow:hidden here — it would clip consumers' absolutely-positioned
     popups (e.g. an action dropdown). The reveal panel stays within the row
     bounds and is occluded by the opaque track while closed. */
}

.swipeable-row__actions {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  overflow: hidden;
}

.swipeable-row__track {
  position: relative;
  width: 100%;
  will-change: transform;
}

/* Opaque background occludes the reveal panel behind the track while closed.
   Consumers set --swipeable-row-bg to their surface color. */
.swipeable-row--enabled .swipeable-row__track {
  background: var(--swipeable-row-bg, transparent);
  touch-action: pan-y;
}

.swipeable-row__track--animated {
  transition: transform 0.18s ease;
}

/* When swipe is disabled the row is a plain pass-through with no transform. */
.swipeable-row:not(.swipeable-row--enabled) .swipeable-row__track {
  touch-action: auto;
}
</style>
