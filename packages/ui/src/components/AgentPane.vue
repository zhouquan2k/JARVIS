<template>
  <div data-testid="agent-pane">
    <AgentRightPane v-bind="props" @request-workspace-switch="emit('request-workspace-switch', $event)" />
  </div>
</template>

<script setup lang="ts">
import type { ContextDocument, IContextProvider, ResolvedAgentConfig } from '@packages/core/src';
import type { ChatRoutePath } from '../routes';
import type { OpenConversationRequest } from '../types/conversationLink';
import AgentRightPane from './AgentRightPane.vue';

const props = defineProps<{
  activeAgent?: ResolvedAgentConfig | null;
  activeAgentKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: ContextDocument | null;
  showAgentConversationList?: boolean;
  contextProvider?: IContextProvider | null;
  onFileChanged?: ((change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) => void | Promise<void>) | null;
  agentResolutionError?: string | null;
  restoreConversationId?: string | null;
  openConversationRequest?: OpenConversationRequest | null;
}>();

const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
}>();
</script>
