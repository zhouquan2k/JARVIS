<template>
  <AgentView
    v-if="selectedOwnerNode && documentStore.activeAgent && documentStore.activeAgentKey"
    :agent-key="documentStore.activeAgentKey"
    :agent="documentStore.activeAgent"
    :owner-node="selectedOwnerNode"
    :index-path="documentStore.agentIndexPath"
    :index-document="documentStore.agentIndexDocument"
    :index-draft-content="documentStore.agentIndexDraftContent"
    :index-viewer-id="documentStore.agentIndexViewerId"
    :index-pane-mode="documentStore.agentIndexPaneMode"
    :index-is-saving="documentStore.agentIndexIsSaving"
    :index-is-dirty="!!(documentStore.agentIndexPath && documentStore.dirtyPaths[documentStore.agentIndexPath])"
    :providers="chatStore.availableProviders"
    :builtin-tools="builtinTools"
    :model-load-states="chatStore.providerModelStates"
    :linkable-markdown-documents="agentIndexLinkableMarkdownDocuments"
    :linkable-conversations="agentIndexLinkableConversations"
    :linkable-reference-resources="agentIndexLinkableReferenceResources"
    @load-provider-models="chatStore.ensureProviderModelsLoaded"
    @save-agent-config="saveSelectedAgentConfig"
    @update-index-content="documentStore.updateAgentIndexDocument"
    @save-index-document="documentStore.flushAgentIndexDocument"
    @open-document-link="emit('open-document-link', $event)"
    @open-conversation-link="emit('open-conversation-link', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
    DEFAULT_WORKSPACE_SCOPE_KEY as DEFAULT_WORKSPACE_AGENT_KEY,
    type AgentInheritanceMode,
    type ContextNode
} from '@plugins/ai-agent/src/internal';
import { useChatStore } from '../store/chat';
import { useDocumentWorkspaceStore } from '@packages/ui/src/store/documentWorkspace';
import type { MarkdownConversationLinkTarget } from '@packages/ui/src/types/conversationLink';
import { buildLinkableConversationEntries } from '@packages/ui/src/utils/conversationLink';
import AgentView from './AgentView.vue';
import { createBuiltinWorkspaceToolDefinitions } from '../runtime/agents/tools/builtinWorkspaceTools';

const chatStore = useChatStore();
const documentStore = useDocumentWorkspaceStore();
const builtinTools = createBuiltinWorkspaceToolDefinitions();

const emit = defineEmits<{
    (event: 'open-document-link', path: string): void;
    (event: 'open-conversation-link', target: MarkdownConversationLinkTarget): void;
}>();

const selectedOwnerNode = computed<ContextNode | null>(() => {
    if (documentStore.selectedNodePath === '/' && documentStore.activeAgent) {
        return {
            path: '/',
            name: 'Root',
            kind: 'directory',
            scopeKey: documentStore.activeAgentKey ?? DEFAULT_WORKSPACE_AGENT_KEY,
            ownsMetadata: true
        };
    }

    const activeNode = documentStore.activeNode;
    return activeNode?.kind === 'directory' && activeNode.ownsMetadata ? activeNode : null;
});

const agentIndexLinkableMarkdownDocuments = computed(() => {
    return documentStore.getLinkableMarkdownDocuments(documentStore.agentIndexPath);
});

const agentIndexLinkableReferenceResources = computed(() => {
    return documentStore.getLinkableReferenceResources(documentStore.agentIndexPath);
});

const agentIndexLinkableConversations = computed(() => {
    const agentKey = documentStore.activeAgentKey;
    return agentKey ? buildLinkableConversationEntries(chatStore.getConversationsByAgent(agentKey)) : [];
});

async function saveSelectedAgentConfig(patch: {
    description?: string;
    instructions?: string;
    modelProviderName?: string;
    modelName?: string;
    inheritance?: AgentInheritanceMode;
    tools?: Array<{ id: string; description?: string }>;
    inheritTools?: boolean;
}): Promise<void> {
    if (!selectedOwnerNode.value) {
        return;
    }

    await documentStore.saveAgentConfig({
        ownerPath: selectedOwnerNode.value.path,
        patch
    });
}
</script>
