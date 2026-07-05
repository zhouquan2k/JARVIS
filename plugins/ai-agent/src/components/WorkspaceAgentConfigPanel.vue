<template>
  <AgentView
    v-if="selectedOwnerNode && resolvedScopeConfig && documentStore.activeScopeKey"
    :agent-key="documentStore.activeScopeKey"
    :agent="resolvedScopeConfig"
    :owner-node="selectedOwnerNode"
    :index-path="documentStore.scopeIndexPath"
    :index-document="documentStore.scopeIndexDocument"
    :index-draft-content="documentStore.scopeIndexDraftContent"
    :index-viewer-id="documentStore.scopeIndexViewerId"
    :index-pane-mode="documentStore.scopeIndexPaneMode"
    :index-is-saving="documentStore.scopeIndexIsSaving"
    :index-is-dirty="!!(documentStore.scopeIndexPath && documentStore.dirtyPaths[documentStore.scopeIndexPath])"
    :providers="chatStore.availableProviders"
    :builtin-tools="builtinTools"
    :model-load-states="chatStore.providerModelStates"
    :linkable-markdown-documents="agentIndexLinkableMarkdownDocuments"
    :linkable-conversations="agentIndexLinkableConversations"
    :linkable-reference-resources="agentIndexLinkableReferenceResources"
    @load-provider-models="chatStore.ensureProviderModelsLoaded"
    @save-agent-config="saveSelectedAgentConfig"
    @update-index-content="documentStore.updateScopeIndexDocument"
    @save-index-document="documentStore.flushScopeIndexDocument"
    @open-document-link="emit('open-document-link', $event)"
    @open-conversation-link="emit('open-conversation-link', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
    DEFAULT_WORKSPACE_SCOPE_KEY as DEFAULT_WORKSPACE_AGENT_KEY,
    type ResolvedAgentConfig,
    type AgentInheritanceMode,
    type ContextNode
} from '@plugins/ai-agent/src/internal';
import { useChatStore } from '../store/chat';
import { useDocumentWorkspaceStore, type MarkdownConversationLinkTarget } from '@packages/ui';
import { buildLinkableConversationEntries } from '../utils/conversationLink';
import { resolveScopedAgentConfigFromWorkspaceContext } from '../runtime/agents/config/resolveScopedAgentConfig';
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
    if (documentStore.selectedNodePath === '/' && documentStore.activeScopeData) {
        return {
            path: '/',
            name: 'Root',
            kind: 'directory',
            scopeKey: documentStore.activeScopeKey ?? DEFAULT_WORKSPACE_AGENT_KEY,
            ownsMetadata: true
        };
    }

    const activeNode = documentStore.activeNode;
    return activeNode?.kind === 'directory' && activeNode.ownsMetadata ? activeNode : null;
});

const resolvedScopeConfig = computed<ResolvedAgentConfig | null>(() => {
    return resolveScopedAgentConfigFromWorkspaceContext(
        documentStore.context,
        documentStore.activeScopeKey
    );
});

const agentIndexLinkableMarkdownDocuments = computed(() => {
    return documentStore.getLinkableMarkdownDocuments(documentStore.scopeIndexPath);
});

const agentIndexLinkableReferenceResources = computed(() => {
    return documentStore.getLinkableReferenceResources(documentStore.scopeIndexPath);
});

const agentIndexLinkableConversations = computed(() => {
    const agentKey = documentStore.activeScopeKey;
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

    const nextPatch: Record<string, unknown> = {};
    const clearedFields: string[] = [];

    if (patch.description !== undefined) {
        nextPatch.description = patch.description.trim();
    }
    if (patch.instructions !== undefined) {
        nextPatch.instructions = patch.instructions.trim();
    }
    if (patch.modelProviderName !== undefined) {
        nextPatch.modelProviderName = patch.modelProviderName.trim();
    }
    if (patch.modelName !== undefined) {
        nextPatch.modelName = patch.modelName.trim();
    }
    if (patch.inheritance === 'override') {
        nextPatch.inheritance = 'override';
    } else if (patch.inheritance !== undefined) {
        clearedFields.push('inheritance');
    }
    if (patch.inheritTools === true) {
        clearedFields.push('tools');
    } else if (patch.tools !== undefined) {
        nextPatch.tools = patch.tools;
    }

    await documentStore.saveFolderMetadata({
        ownerPath: selectedOwnerNode.value.path,
        patch: nextPatch,
        clearedFields
    });
}
</script>
