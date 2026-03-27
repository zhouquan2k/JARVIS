<template>
  <aside class="knowledge-assistant-pane" data-testid="knowledge-assistant-pane">
    <NormalChatView class="knowledge-assistant-chat" />
  </aside>
</template>

<script setup lang="ts">
import NormalChatView from '../views/NormalChatView.vue';
</script>

<style scoped>
.knowledge-assistant-pane {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(9, 13, 20, 0.92));
}

.knowledge-assistant-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
