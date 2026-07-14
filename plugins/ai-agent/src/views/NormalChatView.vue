<template>
  <div
    :class="['chat-container', isAgentMode ? 'agent-mode' : 'standard-mode']"
    data-testid="normal-chat-view"
  >
    <div class="chat-main">
      <div class="chat-thread">
        <div class="chat-messages" ref="messagesRef" data-testid="normal-messages" @scroll="onMessagesScroll">
          <div v-if="chatStore.isExternalPreviewLoading" class="loading-banner" data-testid="external-preview-loading">
            {{ t('shared.loadingConversation') }}
          </div>

          <template v-if="displayConversation">
            <TransitionGroup name="thread-message" tag="div" class="message-list">
              <div
                v-for="msg in renderedMessages"
                :key="msg.id"
                :class="[
                  'message',
                  msg.role,
                  {
                    'question-root': isQuestionRoot(msg),
                    'question-active': isActiveQuestion(msg),
                    'question-starred': isStarredMessage(msg)
                  }
                ]"
                :data-question-id="isQuestionRoot(msg) ? getMessageQuestionKey(msg) : undefined"
              >
                <div v-if="msg.role === 'user'" class="user-message-row">
                  <div class="user-bubble-shell">
                    <div class="content user-content">{{ msg.content || t('shared.sendingAttachments') }}</div>
                    <button
                      v-if="canEditMessage(msg)"
                      type="button"
                      class="message-edit-btn"
                      data-testid="message-edit"
                      :aria-label="t('shared.editQuestion')"
                      :title="t('shared.editQuestion')"
                      @click="startEditingMessage(msg)"
                    >
                      <svg viewBox="0 0 20 20" class="message-edit-icon" focusable="false" aria-hidden="true">
                        <path
                          d="M12.9 3.4a1.5 1.5 0 0 1 2.1 0l1.6 1.6a1.5 1.5 0 0 1 0 2.1l-7.7 7.7-3.4.9.9-3.4 7.7-7.7Z"
                          fill="none"
                          stroke="currentColor"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.6"
                        />
                        <path
                          d="M11.8 4.5 15.5 8.2"
                          fill="none"
                          stroke="currentColor"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.6"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <MessageAttachmentStrip
                  v-if="resolveMessageAttachments(msg).length > 0"
                  :attachments="resolveMessageAttachments(msg)"
                />
                <template v-if="msg.role === 'assistant'">
                  <!-- New structured group message: ≥2 members → tabbed view -->
                  <template v-if="msg.groupMembers && msg.groupMembers.length > 1">
                    <GroupMessageTabs
                      :message-id="msg.id"
                      :group-members="msg.groupMembers"
                      :group-summary="msg.groupSummary"
                    />
                  </template>
                  <!-- Single-member group message → plain bubble -->
                  <template v-else-if="msg.groupMembers && msg.groupMembers.length === 1">
                    <MarkdownContent
                      class="content markdown-body"
                      :source="msg.groupMembers[0].content"
                    />
                  </template>
                  <!-- Legacy group message (old ### heading format) -->
                  <template v-else-if="buildGroupMemberBlocks(msg).length > 0">
                    <div
                      v-for="seg in buildGroupMemberBlocks(msg)"
                      :key="seg.key"
                      class="group-member-block"
                    >
                      <div class="group-member-name">{{ seg.name }}</div>
                      <MarkdownContent
                        class="content markdown-body"
                        :source="seg.content"
                      />
                    </div>
                  </template>
                  <!-- Normal message -->
                  <template v-else>
                    <template
                      v-for="block in buildAssistantRenderBlocks(msg)"
                      :key="block.key"
                    >
                      <MarkdownContent
                        v-if="block.type === 'markdown'"
                        class="content markdown-body"
                        :source="block.content"
                        :annotations="block.annotations"
                      />
                      <MessageFunctionalParts
                        v-else
                        :parts="block.parts"
                      />
                    </template>
                  </template>
                </template>
              </div>
            </TransitionGroup>
          </template>

          <div
            v-if="archiveProgressParts.length > 0"
            class="message assistant archive-progress-message"
            data-testid="archive-progress-message"
          >
            <MessageFunctionalParts :parts="archiveProgressParts" />
          </div>

          <div v-if="chatStore.isGenerating" class="message assistant">
            <div class="content typing">{{ t('shared.typing') }}</div>
          </div>

          <div v-if="chatStore.currentError" class="error" data-testid="normal-error">
            <span>{{ resolvedHostRecoveryMessage || chatStore.currentError }}</span>
            <button
              v-if="resolvedHostRecoveryActionLabel"
              type="button"
              class="auth-recovery-btn"
              data-testid="normal-host-recovery"
              :disabled="resolvedHostRecoveryActionDisabled"
              @click="requestHostRecovery"
            >
              {{ resolvedHostRecoveryActionLabel }}
            </button>
          </div>
        </div>

        <button
          v-if="showQuestionIndexToggle"
          type="button"
          class="chat-index-toggle"
          data-testid="question-panel-open"
          @click="chatStore.setQuestionIndexPanelOpen(true)"
        >
          {{ t('shared.showOutline') }}
        </button>
      </div>

      <QuestionIndexPanel
        v-if="showQuestionIndexPanel"
        class="chat-index-panel"
        data-testid="question-index-panel"
      />
    </div>

    <div
      class="chat-inputarea"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <template v-if="!isPreviewing">
        <div class="toolbar-stack">
          <div
            v-if="showSelectorRow && isLiveGroupConversation && groupCandidateMembers.length > 0"
            class="group-model-tools"
            data-testid="group-model-tools"
          >
            <span class="dom-pages-label">{{ t('shared.openDomPageHint') }}</span>
            <div
              v-for="member in groupCandidateMembers"
              :key="member.providerId"
              class="group-model-tool"
              :class="{ 'is-selected': isGroupMemberSelected(member.providerId) }"
              :data-testid="`group-model-tool-${member.providerId}`"
              :data-selected="isGroupMemberSelected(member.providerId) ? 'true' : 'false'"
            >
              <label
                class="group-member-toggle"
              >
                <input
                  type="checkbox"
                  class="group-member-checkbox"
                  :checked="isGroupMemberSelected(member.providerId)"
                  :data-testid="`group-member-toggle-${member.providerId}`"
                  @change="onToggleGroupMember(member.providerId)"
                />
                <span>{{ member.name }}</span>
              </label>
              <button
                type="button"
                class="group-model-link"
                :data-testid="`dom-page-btn-${member.providerId}`"
                @click="chatStore.revealControlledPage(member.providerId)"
              >↗</button>
              <button
                type="button"
                class="group-model-link"
                :data-testid="`group-member-mention-${member.providerId}`"
                @click="insertMention(member.name)"
              >@</button>
            </div>
            <div
              v-if="summaryDomPageButton"
              class="group-model-tool group-summary-tool"
              data-testid="group-summary-tool"
            >
              <span>{{ summaryDomPageButton.label }}</span>
              <button
                type="button"
                class="group-model-link"
                aria-label="打开总结窗口"
                :data-testid="`dom-page-btn-${summaryDomPageButton.id}`"
                @click="chatStore.revealControlledPage(summaryDomPageButton.id)"
              >↗</button>
            </div>
          </div>
          <div
            v-else-if="currentSingleDomProvider !== null"
            class="dom-pages-bar"
            data-testid="dom-pages-bar"
          >
            <span class="dom-pages-label">{{ t('shared.openDomPageHint') }}</span>
            <button
              type="button"
              class="dom-page-btn"
              :data-testid="`dom-page-btn-${currentSingleDomProvider.id}`"
              @click="chatStore.revealControlledPage(currentSingleDomProvider.id)"
            >{{ currentSingleDomProvider.name }} ↗</button>
          </div>
          <div
            v-if="isEditingQuestion"
            class="edit-resend-banner"
            data-testid="edit-resend-banner"
          >
            <div class="edit-resend-copy">
              <strong>{{ t('shared.editingQuestion') }}</strong>
              <span>{{ t('shared.editResendWarning') }}</span>
            </div>
            <button
              type="button"
              class="edit-resend-cancel"
              data-testid="edit-resend-cancel"
              @click="chatStore.cancelQuestionEdit()"
            >
              {{ t('shared.cancelEditQuestion') }}
            </button>
          </div>
          <div
            v-if="showSelectorRow"
            class="selector-row"
            data-testid="selector-row"
          >
            <ProviderModelSelector
              :providers="chatStore.availableProviders"
              :current-provider-id="chatStore.currentProviderId"
              :current-model-id="chatStore.currentModelId"
              :models-loading="chatStore.isCurrentProviderModelsLoading"
              :disabled="false"
              @provider-change="onProviderChange"
              @model-change="onModelChange"
            />

            <ReasoningEffortSelector
              :value="chatStore.currentReasoningEffort"
              :disabled="isInputDisabled"
              @change="onReasoningEffortChange"
            />

            <ModelOptionToggleGroup
              v-if="modelOptionDefinitions.length > 0"
              :options="modelOptionDefinitions"
              :value="chatStore.currentModelOptions"
              :disabled="isInputDisabled"
              @change="onModelOptionChange"
            />
          </div>

          <div v-if="chatStore.isCurrentProviderModelsLoading" class="auth-warning">
            {{ t('shared.providerCatalogLoading') }}
          </div>
          <div v-else-if="!effectiveIsAuthenticated" class="auth-warning" data-testid="normal-auth-warning">
            <span>{{ resolvedAuthUnavailableText }}</span>
            <button
              v-if="resolvedAuthRecoveryActionLabel"
              type="button"
              class="auth-recovery-btn"
              data-testid="normal-auth-recovery"
              :disabled="resolvedAuthRecoveryActionDisabled"
              @click="requestAuthRecovery"
            >
              {{ resolvedAuthRecoveryActionLabel }}
            </button>
          </div>
        </div>

        <div
          v-if="chatStore.archiveFeedback"
          :class="['archive-feedback', `tone-${chatStore.archiveFeedback.tone}`]"
          data-testid="archive-feedback"
        >
          {{ chatStore.archiveFeedback.message }}
        </div>

        <div class="input-row">
          <AttachmentComposer
            class="input-attachment-drafts"
            mode="draft-list"
            :attachments="chatStore.draftAttachments"
            @remove="chatStore.removeDraftAttachment"
          />
          <textarea
            ref="inputRef"
            data-testid="normal-input"
            v-model="draftPrompt"
            @input="syncInputHeight"
            @paste="onPaste"
            @keydown="onInputKeydown"
            :placeholder="t('shared.chatInputPlaceholder')"
            :disabled="isInputDisabled"
          />
          <div class="input-actions">
            <div v-if="!chatStore.isGenerating" class="secondary-actions" data-testid="secondary-actions">
              <AttachmentComposer
                compact
                mode="trigger"
                :attachments="chatStore.draftAttachments"
                :disabled="attachmentsDisabled"
                :disabled-reason="null"
                :error="chatStore.attachmentError"
                @select-files="onSelectFiles"
              />
              <button
                v-if="!isAgentMode"
                type="button"
                class="secondary-action-btn"
                data-testid="workspace-restore"
                :title="t('shared.collapseToPanel')"
                :aria-label="t('shared.collapseToPanel')"
                @click="requestWorkspaceSwitch('/')"
              >
                <PanelRightClose class="action-icon" :size="16" aria-hidden="true" />
              </button>
              <button
                v-if="shouldShowToolbarCollapseToggle"
                type="button"
                class="toolbar-collapse-toggle"
                :aria-expanded="!isTopToolbarCollapsed"
                :aria-label="isTopToolbarCollapsed ? t('shared.expandToolbar') : t('shared.collapseToolbar')"
                :title="isTopToolbarCollapsed ? t('shared.expandToolbar') : t('shared.collapseToolbar')"
                data-testid="toolbar-collapse-toggle"
                @click="toggleTopToolbarCollapsed"
              >
                <PanelTopOpen class="action-icon" :size="16" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="secondary-action-btn"
                data-testid="normal-new-chat"
                :title="t('shared.newChat')"
                :aria-label="t('shared.newChat')"
                :disabled="isInputDisabled"
                @click="startNewChat"
              >
                <SquarePen class="action-icon" :size="16" aria-hidden="true" />
              </button>
            </div>
            <button
              v-if="!chatStore.isGenerating"
              data-testid="normal-send"
              :title="t('shared.chatSendHint')"
              :aria-label="t('shared.send')"
              @click="send()"
              :disabled="(!draftPrompt.trim() && chatStore.draftAttachments.length === 0) || isInputDisabled"
            >
              <ArrowUp class="send-icon" :size="17" aria-hidden="true" />
            </button>
            <button
              v-else
              @click="chatStore.abortGeneration()"
              class="stop-btn"
              data-testid="normal-stop"
              :title="t('shared.stopGeneration')"
            >
              {{ t('shared.stop') }}
            </button>
          </div>
        </div>
      </template>

      <div v-else class="preview-actions">
        <div>
          <p class="eyebrow">{{ t('shared.previewReadonly') }}</p>
          <h3>{{ t('shared.previewConfirm') }}</h3>
        </div>
        <div class="preview-button-row">
          <button
            class="ghost-btn"
            type="button"
            data-testid="preview-back"
            @click="chatStore.exitPreview()"
          >
          {{ t('shared.returnActiveConversation') }}
          </button>
          <button
            class="import-btn"
            type="button"
            data-testid="preview-import"
            @click="chatStore.importPreviewConversation()"
          >
          {{ t('shared.importToLocal') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConversationMessage, MessageAnnotation, MessageFunctionalPart } from '@plugins/ai-agent/src/internal';
import { computed, nextTick, onMounted, ref, watch, type PropType } from 'vue';
import { ArrowUp, PanelRightClose, PanelTopOpen, SquarePen } from 'lucide-vue-next';
import AttachmentComposer from '../components/AttachmentComposer.vue';
import GroupMessageTabs from '../components/GroupMessageTabs.vue';
import { MarkdownContent } from '@packages/ui';
import MessageAttachmentStrip from '../components/MessageAttachmentStrip.vue';
import { MessageFunctionalParts } from '@packages/ui';
import ModelOptionToggleGroup from '../components/ModelOptionToggleGroup.vue';
import ProviderModelSelector from '../components/ProviderModelSelector.vue';
import QuestionIndexPanel from '../components/QuestionIndexPanel.vue';
import ReasoningEffortSelector from '../components/ReasoningEffortSelector.vue';
import { useChatStore } from '../store/chat';
import { resolveGroupMembers } from '../providers/model/MultiModelGroupProvider';
import type { GroupMember } from '../group/groupTypes';
import { useAiAgentHostBridge } from '../runtime/plugin/hostBridge';
import type { ChatRoutePath } from '@packages/ui';
import { isPromptSubmitHotkey, useWorkspaceI18n, translateWorkspaceMessage } from '@packages/ui';

const props = defineProps({
  showQuestionIndex: {
    type: Boolean,
    default: false
  },
  authStatusOverride: {
    type: null as unknown as PropType<boolean | null>,
    default: null
  },
  authUnavailableMessage: {
    type: String,
    default: () => translateWorkspaceMessage('shared.currentProviderUnavailable')
  },
  authRecoveryActionLabel: {
    type: String,
    default: ''
  },
  authRecoveryActionDisabled: {
    type: Boolean,
    default: false
  },
  hostRecoveryMessage: {
    type: String,
    default: ''
  },
  hostRecoveryActionLabel: {
    type: String,
    default: ''
  },
  hostRecoveryActionDisabled: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
  (event: 'request-auth-recovery'): void;
  (event: 'request-host-recovery'): void;
}>();

const chatStore = useChatStore();
const hostBridge = useAiAgentHostBridge();
const { t } = useWorkspaceI18n();
const isAuthenticated = ref(false);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const isTopToolbarCollapsed = ref(false);
const forceNextMessageScroll = ref(false);
let scrollSyncFrame: number | null = null;
const MESSAGE_BOTTOM_THRESHOLD_PX = 32;

type AssistantRenderBlock =
  | {
      key: string;
      type: 'markdown';
      content: string;
      annotations?: MessageAnnotation[];
    }
  | {
      key: string;
      type: 'functional-parts';
      parts: MessageFunctionalPart[];
    };

type GroupMemberBlock = {
  key: string;
  name: string;
  providerId: string;
  content: string;
  isDom: boolean;
};

function isDomMember(member: GroupMember): boolean {
  return member.providerId.endsWith('-dom');
}

async function refreshAuthStatus() {
  isAuthenticated.value = await chatStore.checkAuth();
}

function clampFunctionalPartIndex(part: MessageFunctionalPart, contentLength: number): number {
  if (typeof part.afterCharIndex !== 'number' || !Number.isFinite(part.afterCharIndex)) {
    return contentLength;
  }

  return Math.max(0, Math.min(contentLength, Math.floor(part.afterCharIndex)));
}

function sliceAnnotationsForRange(
  annotations: MessageAnnotation[] | undefined,
  start: number,
  end: number,
  isLastSlice: boolean
): MessageAnnotation[] | undefined {
  if (!annotations?.length || start >= end) {
    return undefined;
  }

  const sliced: MessageAnnotation[] = annotations.flatMap((annotation): MessageAnnotation[] => {
    if (annotation.kind === 'image_group') {
      if (annotation.range === null) {
        return isLastSlice ? [annotation] : [];
      }

      const overlapStart = Math.max(annotation.range.start, start);
      const overlapEnd = Math.min(annotation.range.end, end);
      if (overlapStart >= overlapEnd) {
        return [];
      }

      return [{
        ...annotation,
        range: {
          start: overlapStart - start,
          end: overlapEnd - start
        }
      }];
    }

    const overlapStart = Math.max(annotation.range.start, start);
    const overlapEnd = Math.min(annotation.range.end, end);
    if (overlapStart >= overlapEnd) {
      return [];
    }

    return [{
      ...annotation,
      range: {
        start: overlapStart - start,
        end: overlapEnd - start
      }
    }];
  });

  return sliced.length > 0 ? sliced : undefined;
}

function buildAssistantRenderBlocks(message: ConversationMessage): AssistantRenderBlock[] {
  const content = message.content || '';
  const contentLength = content.length;
  const groupedParts = new Map<number, MessageFunctionalPart[]>();

  for (const part of message.functionalParts || []) {
    const insertionIndex = clampFunctionalPartIndex(part, contentLength);
    const existing = groupedParts.get(insertionIndex);
    if (existing) {
      existing.push(part);
    } else {
      groupedParts.set(insertionIndex, [part]);
    }
  }

  const insertionIndexes = [...groupedParts.keys()].sort((left, right) => left - right);
  const blocks: AssistantRenderBlock[] = [];
  let cursor = 0;

  for (const insertionIndex of insertionIndexes) {
    if (insertionIndex > cursor) {
      blocks.push({
        key: `markdown-${message.id}-${cursor}-${insertionIndex}`,
        type: 'markdown',
        content: content.slice(cursor, insertionIndex),
        annotations: sliceAnnotationsForRange(message.annotations, cursor, insertionIndex, false)
      });
      cursor = insertionIndex;
    }

    const parts = groupedParts.get(insertionIndex);
    if (parts?.length) {
      blocks.push({
        key: `functional-${message.id}-${insertionIndex}`,
        type: 'functional-parts',
        parts
      });
    }
  }

  if (cursor < contentLength) {
    blocks.push({
      key: `markdown-${message.id}-${cursor}-${contentLength}`,
      type: 'markdown',
      content: content.slice(cursor),
      annotations: sliceAnnotationsForRange(message.annotations, cursor, contentLength, true)
    });
  } else if (blocks.length === 0 && contentLength > 0) {
    blocks.push({
      key: `markdown-${message.id}-full`,
      type: 'markdown',
      content,
      annotations: message.annotations
    });
  }

  return blocks;
}

const displayConversation = computed(() => chatStore.displayConversation);
const isPreviewing = computed(() => chatStore.isPreviewing);

// 当前会话若为 group provider，解析其参与成员（用于把合并回复按成员分段渲染、底部受控页按钮）。
// 实时态（非预览）始终读 store 勾选状态，与 sendMessage 使用同一数据源，确保底部按钮与发送成员一致；
// 预览态读被预览会话的持久化 groupMembers（历史存档）。
const currentGroupMembers = computed<GroupMember[]>(() => {
  if (!isPreviewing.value) {
    const providerId = chatStore.currentProviderId;
    if (providerId !== 'group') return [];
    const members = chatStore.currentGroupMembers;
    if (Array.isArray(members) && members.length > 0) return members;
    return chatStore.currentModelId ? resolveGroupMembers(chatStore.currentModelId) : [];
  }
  const selection = displayConversation.value?.modelSelection;
  const providerId = selection?.providerId;
  const modelId = selection?.modelId;
  const members = selection?.groupMembers;
  if (providerId !== 'group') return [];
  if (Array.isArray(members) && members.length > 0) return members;
  return modelId ? resolveGroupMembers(modelId) : [];
});
const domGroupMembers = computed(() => currentGroupMembers.value.filter(isDomMember));
const SUMMARY_DOM_PROVIDER_ID = 'gemini-dom-summary';

// 顶部勾选区：群聊候选成员池（仅实时编辑当前会话时展示，不用于预览）。
const isLiveGroupConversation = computed(() => !isPreviewing.value && chatStore.currentProviderId === 'group');
const groupCandidateMembers = computed<GroupMember[]>(() => chatStore.groupCandidateMembers);
function isGroupMemberSelected(providerId: string): boolean {
  return chatStore.currentGroupMembers.some((member) => member.providerId === providerId);
}
function onToggleGroupMember(providerId: string) {
  chatStore.toggleGroupMember(providerId);
}
const currentSingleDomProvider = computed(() => {
  const providerId = chatStore.currentProviderId;
  if (!providerId || providerId === 'group' || !providerId.endsWith('-dom')) {
    return null;
  }
  return chatStore.availableProviders.find((p) => p.id === providerId) ?? null;
});
const summaryDomPageButton = computed(() => {
  if (domGroupMembers.value.length === 0) {
    return null;
  }
  return {
    id: SUMMARY_DOM_PROVIDER_ID,
    label: t('shared.openSummaryDomPage')
  };
});

/**
 * 将 group 合并回复（`### {成员名}` 分段拼接）拆成逐成员块。
 * 对所有 group 启用（group 消息不携带 annotations/functionalParts，分段渲染无损失）：
 * 每个成员一个样式化标题；仅 dom 成员额外显示「原始会话」链接。非 group 会话返回 []。
 */
function buildGroupMemberBlocks(message: ConversationMessage): GroupMemberBlock[] {
  const members = currentGroupMembers.value;
  if (members.length === 0) {
    return [];
  }

  const memberByName = new Map(members.map((member) => [member.name, member]));
  const content = message.content || '';
  const headerPattern = /^### (.+)$/gm;
  const boundaries: Array<{ member: GroupMember; contentStart: number; headerStart: number }> = [];

  for (const match of content.matchAll(headerPattern)) {
    const member = memberByName.get(match[1].trim());
    if (!member || typeof match.index !== 'number') {
      continue;
    }
    boundaries.push({
      member,
      headerStart: match.index,
      contentStart: match.index + match[0].length
    });
  }

  return boundaries.map((boundary, index) => {
    const end = index + 1 < boundaries.length ? boundaries[index + 1].headerStart : content.length;
    return {
      key: `group-${message.id}-${index}`,
      name: boundary.member.name,
      providerId: boundary.member.providerId,
      content: content.slice(boundary.contentStart, end).trim(),
      isDom: isDomMember(boundary.member)
    };
  });
}
const renderedMessages = computed(() => isPreviewing.value ? displayConversation.value?.messages || [] : chatStore.visibleMessages);
const modelOptionDefinitions = computed(() => chatStore.currentModelOptionDefinitions);
const isAgentMode = computed(() => chatStore.workspaceMode === 'agent');
const hasDraftAttachments = computed(() => chatStore.draftAttachments.length > 0);
const showSelectorRow = computed(() => !isTopToolbarCollapsed.value || hasDraftAttachments.value);
const shouldShowToolbarCollapseToggle = computed(() => isAgentMode.value || isLiveGroupConversation.value);
const archiveProgressParts = computed(() => {
  return chatStore.archiveConversationProgressPart ? [chatStore.archiveConversationProgressPart] : [];
});
const isEditingQuestion = computed(() => !!chatStore.editingQuestionId);
const draftPrompt = computed({
  get: () => chatStore.draftPrompt,
  set: (value: string) => chatStore.setDraftPrompt(value)
});
const hasQuestionIndexContent = computed(() => {
  if (!props.showQuestionIndex || chatStore.isPreviewing) {
    return false;
  }

  return chatStore.visibleMessages.some((message) => message.role === 'user');
});
const showQuestionIndexPanel = computed(() => {
  return hasQuestionIndexContent.value && chatStore.isQuestionIndexPanelOpen;
});
const showQuestionIndexToggle = computed(() => {
  return hasQuestionIndexContent.value && !chatStore.isQuestionIndexPanelOpen;
});
const hasExplicitAuthOverride = computed(() => {
  const authStatusOverride = hostBridge.authStatusOverride.value ?? props.authStatusOverride;
  const authUnavailableMessage = hostBridge.authUnavailableMessage.value || props.authUnavailableMessage;
  const authRecoveryActionLabel = hostBridge.authRecoveryActionLabel.value || props.authRecoveryActionLabel;
  const authRecoveryActionDisabled = hostBridge.authRecoveryActionDisabled.value || props.authRecoveryActionDisabled;

  if (authStatusOverride === true) {
    return true;
  }

  if (authStatusOverride !== false) {
    return false;
  }

  return authUnavailableMessage !== t('shared.currentProviderUnavailable')
    || authRecoveryActionLabel.length > 0
    || authRecoveryActionDisabled;
});
const resolvedAuthStatusOverride = computed(() => hostBridge.authStatusOverride.value ?? props.authStatusOverride);
const effectiveIsAuthenticated = computed(() => {
  if (!hasExplicitAuthOverride.value || resolvedAuthStatusOverride.value === null) {
    return isAuthenticated.value;
  }

  return resolvedAuthStatusOverride.value;
});
const resolvedAuthUnavailableText = computed(() => {
  return hostBridge.authUnavailableMessage.value || props.authUnavailableMessage || t('shared.currentProviderUnavailable');
});
const resolvedAuthRecoveryActionLabel = computed(() => {
  return hostBridge.authRecoveryActionLabel.value || props.authRecoveryActionLabel;
});
const resolvedAuthRecoveryActionDisabled = computed(() => {
  return hostBridge.authRecoveryActionDisabled.value || props.authRecoveryActionDisabled;
});
const resolvedHostRecoveryMessage = computed(() => {
  return hostBridge.hostRecoveryMessage.value || props.hostRecoveryMessage;
});
const resolvedHostRecoveryActionLabel = computed(() => {
  return hostBridge.hostRecoveryActionLabel.value || props.hostRecoveryActionLabel;
});
const resolvedHostRecoveryActionDisabled = computed(() => {
  return hostBridge.hostRecoveryActionDisabled.value || props.hostRecoveryActionDisabled;
});
const isInputDisabled = computed(() => {
  return chatStore.isGenerating || !effectiveIsAuthenticated.value || chatStore.isCurrentProviderModelsLoading || !chatStore.currentModelId;
});
const attachmentsDisabled = computed(() => {
  return isInputDisabled.value || !chatStore.currentProviderSupportsAttachments;
});
const messageQuestionMeta = computed(() => {
  const meta = new Map<string, { questionKey: string; starred: boolean; root: boolean }>();
  const currentConversation = chatStore.currentConversation;
  if (isPreviewing.value || !currentConversation) {
    return meta;
  }

  const starredByQuestionKey = new Map<string, boolean>();
  for (const message of currentConversation.messages) {
    if (message.role !== 'user') {
      continue;
    }

    starredByQuestionKey.set(message.questionId || `legacy:${message.id}`, message.starred === true);
  }

  let pendingLegacyQuestionKey: string | null = null;
  for (const message of currentConversation.messages) {
    if (message.role === 'user') {
      const questionKey = message.questionId || `legacy:${message.id}`;
      const starred = starredByQuestionKey.get(questionKey) === true;
      meta.set(message.id, {
        questionKey,
        starred,
        root: true
      });
      pendingLegacyQuestionKey = message.questionId ? null : questionKey;
      continue;
    }

    if (message.questionId) {
      meta.set(message.id, {
        questionKey: message.questionId,
        starred: starredByQuestionKey.get(message.questionId) === true,
        root: false
      });
      pendingLegacyQuestionKey = null;
      continue;
    }

    if (pendingLegacyQuestionKey) {
      meta.set(message.id, {
        questionKey: pendingLegacyQuestionKey,
        starred: starredByQuestionKey.get(pendingLegacyQuestionKey) === true,
        root: false
      });
      pendingLegacyQuestionKey = null;
    }
  }

  return meta;
});

onMounted(async () => {
  await refreshAuthStatus();
  nextTick(() => {
    syncInputHeight();
    // 视图切换（workspace/对话）会重挂载本组件，此处恢复上次滚动位置。
    // 双层等待（nextTick + rAF）让 Markdown 渲染后的高度基本稳定再定位。
    requestAnimationFrame(() => {
      restoreMessagesScrollTop();
    });
  });
});

watch(() => renderedMessages.value, () => {
  if (isPreviewing.value) {
    return;
  }
  const shouldScrollToLatest = forceNextMessageScroll.value || isMessagesNearBottom();
  forceNextMessageScroll.value = false;
  nextTick(() => {
    if (shouldScrollToLatest) {
      scrollMessagesToBottom();
    }
    syncActiveQuestionFromScroll();
  });
}, { deep: true });

watch(
  () => [displayConversation.value?.id, isPreviewing.value] as const,
  ([conversationId, previewing], previous) => {
    const [previousConversationId, wasPreviewing] = previous ?? [null, false];
    const shouldResetScroll = conversationId !== previousConversationId || previewing !== wasPreviewing;
    if (!shouldResetScroll) {
      return;
    }

    nextTick(() => {
      if (!messagesRef.value) {
        return;
      }

      forceNextMessageScroll.value = false;
      messagesRef.value.scrollTop = 0;
      syncActiveQuestionFromScroll();
    });
  }
);

watch(
  () => [
    chatStore.currentProviderId,
    chatStore.currentModelId,
    chatStore.isCurrentProviderModelsLoading
  ] as const,
  async ([providerId, modelId, isLoading]) => {
    if (!providerId || !modelId || isLoading) {
      return;
    }

    await refreshAuthStatus();
  },
  { immediate: true }
);

watch([isAgentMode, isLiveGroupConversation], ([agentMode, liveGroupMode]) => {
  isTopToolbarCollapsed.value = agentMode || liveGroupMode;
}, { immediate: true });

watch(hasDraftAttachments, (value) => {
  if (value) {
    isTopToolbarCollapsed.value = false;
  } else if (shouldShowToolbarCollapseToggle.value) {
    isTopToolbarCollapsed.value = true;
  }
});

function insertMention(name: string) {
  const textarea = inputRef.value;
  const mention = `@${name} `;
  if (!textarea) {
    chatStore.setDraftPrompt(draftPrompt.value + mention);
    return;
  }
  const start = textarea.selectionStart ?? draftPrompt.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = draftPrompt.value.slice(0, start);
  const after = draftPrompt.value.slice(end);
  const newValue = before + mention + after;
  chatStore.setDraftPrompt(newValue);
  nextTick(() => {
    textarea.focus();
    const cursor = start + mention.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

watch(() => chatStore.draftFocusRequestKey, () => {
  nextTick(() => {
    syncInputHeight();
    inputRef.value?.focus();
    const end = inputRef.value?.value.length || 0;
    inputRef.value?.setSelectionRange(end, end);
  });
});

watch(() => draftPrompt.value, () => {
  nextTick(() => {
    syncInputHeight();
  });
});

watch(() => chatStore.pendingScrollQuestionId, (questionId) => {
  if (!questionId || isPreviewing.value) {
    return;
  }

  nextTick(() => {
    const selectorValue = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(questionId)
      : questionId.replace(/"/gu, '\\"');
    const target = messagesRef.value?.querySelector<HTMLElement>(`[data-question-id="${selectorValue}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    chatStore.setActiveQuestion(questionId);
    chatStore.requestScrollToQuestion(null);
  });
});

watch(
  () => chatStore.attachmentProviderId,
  (providerId) => {
    if (providerId) {
      void chatStore.ensureAttachmentCapabilityLoaded(providerId);
    }
  },
  { immediate: true }
);

async function send(e?: Event) {
  if (e) e.preventDefault();
  if (
    (!chatStore.draftPrompt.trim() && chatStore.draftAttachments.length === 0)
    || !effectiveIsAuthenticated.value
    || chatStore.isGenerating
    || isPreviewing.value
    || chatStore.isCurrentProviderModelsLoading
    || !chatStore.currentModelId
  ) {
    return;
  }

  forceNextMessageScroll.value = true;
  await chatStore.sendDraft();
}

function getMessageQuestionKey(message: ConversationMessage): string | null {
  return messageQuestionMeta.value.get(message.id)?.questionKey || null;
}

function requestWorkspaceSwitch(path: ChatRoutePath): void {
  emit('request-workspace-switch', path);
}

async function requestAuthRecovery(): Promise<void> {
  emit('request-auth-recovery');
  await hostBridge.requestAuthRecovery();
}

async function requestHostRecovery(): Promise<void> {
  emit('request-host-recovery');
  await hostBridge.requestHostRecovery();
}

function isQuestionRoot(message: ConversationMessage): boolean {
  return messageQuestionMeta.value.get(message.id)?.root === true;
}

function isStarredMessage(message: ConversationMessage): boolean {
  return messageQuestionMeta.value.get(message.id)?.starred === true;
}

function isActiveQuestion(message: ConversationMessage): boolean {
  const questionKey = getMessageQuestionKey(message);
  return !!questionKey && questionKey === chatStore.activeQuestionId;
}

function canEditMessage(message: ConversationMessage): boolean {
  return !isPreviewing.value && message.role === 'user' && !!getMessageQuestionKey(message);
}

function startEditingMessage(message: ConversationMessage) {
  const questionKey = getMessageQuestionKey(message);
  if (!questionKey) {
    return;
  }

  chatStore.startQuestionEdit(questionKey);
}

function resolveMessageAttachments(message: ConversationMessage) {
  if (message.attachments?.length) {
    return message.attachments;
  }

  return message.requestSnapshot?.attachments || [];
}

function isMessagesNearBottom(): boolean {
  const container = messagesRef.value;
  if (!container) {
    return false;
  }

  return container.scrollHeight - container.scrollTop - container.clientHeight <= MESSAGE_BOTTOM_THRESHOLD_PX;
}

function scrollMessagesToBottom(): void {
  const container = messagesRef.value;
  if (!container) {
    return;
  }

  container.scrollTop = container.scrollHeight;
}

function syncActiveQuestionFromScroll() {
  if (isPreviewing.value || !messagesRef.value) {
    return;
  }

  const roots = Array.from(messagesRef.value.querySelectorAll<HTMLElement>('[data-question-id]'));
  if (roots.length === 0) {
    chatStore.setActiveQuestion(null);
    return;
  }

  const containerTop = messagesRef.value.getBoundingClientRect().top;
  const threshold = containerTop + 96;
  let activeQuestionId = roots[0].dataset.questionId || null;
  for (const root of roots) {
    if (root.getBoundingClientRect().top <= threshold) {
      activeQuestionId = root.dataset.questionId || activeQuestionId;
      continue;
    }
    break;
  }

  chatStore.setActiveQuestion(activeQuestionId);
}

function onMessagesScroll() {
  if (scrollSyncFrame !== null) {
    cancelAnimationFrame(scrollSyncFrame);
  }

  scrollSyncFrame = requestAnimationFrame(() => {
    scrollSyncFrame = null;
    syncActiveQuestionFromScroll();
    persistMessagesScrollTop();
  });
}

function persistMessagesScrollTop(): void {
  const container = messagesRef.value;
  const conversationId = chatStore.displayConversation?.id;
  if (!container || !conversationId) {
    return;
  }

  chatStore.setConversationScrollTop(conversationId, container.scrollTop);
}

function restoreMessagesScrollTop(): void {
  const container = messagesRef.value;
  const conversationId = chatStore.displayConversation?.id;
  if (!container || !conversationId) {
    return;
  }

  const savedScrollTop = chatStore.conversationScrollTops[conversationId];
  if (typeof savedScrollTop !== 'number') {
    return;
  }

  container.scrollTop = savedScrollTop;
  syncActiveQuestionFromScroll();
}

function syncInputHeight() {
  const input = inputRef.value;
  if (!input) {
    return;
  }

  input.style.height = '50px';
  input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
}

function onInputKeydown(event: KeyboardEvent) {
  if (isPromptSubmitHotkey(event)) {
    event.preventDefault();
    void send();
  }
}

async function onSelectFiles(files: File[]) {
  await chatStore.queueAttachments(files);
}

async function rejectUnsupportedAttachmentInput() {
  await chatStore.ensureAttachmentCapabilityLoaded();
  if (chatStore.currentProviderSupportsAttachments) {
    return false;
  }

  return true;
}

async function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || []);
  if (files.length === 0) {
    return;
  }

  event.preventDefault();
  if (await rejectUnsupportedAttachmentInput()) {
    return;
  }

  await onSelectFiles(files);
}

async function onDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length === 0) {
    return;
  }

  if (await rejectUnsupportedAttachmentInput()) {
    return;
  }

  await onSelectFiles(files);
}

async function onProviderChange(providerId: string) {
  await chatStore.setCurrentModelProviderByUser(providerId);
}

function onModelChange(modelId: string) {
  chatStore.setCurrentModelByUser(modelId);
}

function onModelOptionChange(payload: { key: string; enabled: boolean }) {
  chatStore.setCurrentModelOption(payload.key, payload.enabled);
}

function onReasoningEffortChange(value: 'low' | 'medium' | 'high') {
  chatStore.setCurrentReasoningEffort(value);
}

function toggleTopToolbarCollapsed() {
  isTopToolbarCollapsed.value = !isTopToolbarCollapsed.value;
}

async function startNewChat() {
  await chatStore.startNewConversation({ boundNodeName: null });
}
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: transparent;
}

.chat-container.standard-mode {
  --standard-action-column-width: 48px;
  --standard-toolbar-offset: 58px;
  background:
    radial-gradient(circle at top center, rgba(59, 130, 246, 0.05), transparent 36%),
    linear-gradient(180deg, rgba(9, 12, 18, 0.14), rgba(9, 12, 18, 0));
}

.chat-main {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.chat-thread {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 28px 24px 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
}

.chat-messages::-webkit-scrollbar {
  width: 10px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
  background: rgba(148, 163, 184, 0.4);
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.62);
}

.chat-index-panel {
  flex: 0 0 auto;
}

.chat-index-toggle {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 3;
  height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.chat-index-toggle:hover,
.chat-index-toggle:focus-visible {
  background: rgba(30, 41, 59, 0.94);
  border-color: rgba(96, 165, 250, 0.34);
  transform: translateY(-1px);
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.loading-banner {
  align-self: flex-start;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.12);
  color: #bfdbfe;
  font-size: 13px;
}

.group-model-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
}

.group-model-tool {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 3px 8px;
  border-radius: 999px;
  background: transparent;
  color: var(--cp-text-secondary, rgba(255, 255, 255, 0.45));
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--cp-border);
  transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
}

.group-model-tool.is-selected {
  background: rgba(99, 179, 237, 0.15);
  color: #90cdf4;
  border-color: rgba(99, 179, 237, 0.35);
}

.group-summary-tool {
  color: var(--cp-text-muted);
}

.group-summary-tool .group-model-link {
  display: inline-flex;
  min-width: 1em;
  color: var(--cp-accent);
  font-weight: 700;
  opacity: 1;
}

.group-member-toggle {
  display: inline-flex;
  align-items: center;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  font-size: 13px;
  line-height: 1;
  gap: 4px;
}

.group-member-checkbox {
  margin: 0;
  accent-color: var(--cp-accent);
  cursor: pointer;
}

.group-model-link {
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  opacity: 0.85;
}

.group-model-link:hover {
  opacity: 1;
  color: var(--cp-text-primary);
}

.preview-actions h3 {
  margin: 0;
  color: var(--cp-text-primary);
}

.message {
  width: min(100%, 840px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 0;
  border-radius: 18px;
  transition: background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.message.user,
.message.assistant {
  align-self: center;
}

.content {
  word-wrap: break-word;
  color: var(--cp-text-primary);
}

.group-member-block {
  display: flex;
  flex-direction: column;
}

/* 成员标题做成"分区标签"样式，明显区别于正文：accent 色 + 小字号 + 字距 + 下划线分隔。 */
.group-member-name {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cp-accent);
  margin: 16px 0 6px;
  padding-bottom: 3px;
  border-bottom: 1px solid var(--cp-border);
}

.group-member-name::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cp-accent);
}

.group-member-block:first-child .group-member-name {
  margin-top: 0;
}

.dom-pages-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.dom-pages-label {
  font-size: 12px;
  color: var(--cp-text-muted);
}

.dom-page-btn {
  font-size: 12px;
  padding: 2px 10px;
  border: 1px solid var(--cp-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cp-text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.dom-page-btn:hover {
  background: var(--cp-sidebar-hover);
  color: var(--cp-text-primary);
}

.dom-conversation-link {
  align-self: flex-start;
  margin-top: 2px;
  font-size: 12px;
  color: var(--cp-text-faint);
  text-decoration: none;
  transition: color 0.15s ease;
}

.dom-conversation-link:hover {
  color: var(--cp-accent);
  text-decoration: underline;
}

.question-root {
  scroll-margin-top: 18px;
}

.question-active {
  background: transparent;
}

.question-starred {
  box-shadow: none;
  background: transparent;
}

.message.user {
  align-items: flex-end;
}

.user-message-row {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  width: 100%;
}

.user-bubble-shell {
  position: relative;
  display: inline-flex;
  align-items: flex-end;
  justify-content: flex-end;
  max-width: min(78%, 620px);
}

.message.assistant {
  align-items: flex-start;
}

.message.assistant :deep(.markdown-wrapper) {
  width: 100%;
}

.message.assistant :deep(.markdown-content) {
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.user-content {
  white-space: pre-wrap;
  max-width: 100%;
  padding: 12px 16px;
  padding-right: 44px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(42, 108, 230, 0.94), rgba(31, 95, 212, 0.94));
  color: #eef5ff;
  box-shadow: 0 18px 36px rgba(14, 55, 122, 0.22);
}

.message-edit-btn {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(226, 232, 240, 0.78);
  background: rgba(15, 23, 42, 0.64);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.message-edit-btn:hover,
.message-edit-btn:focus-visible {
  background: rgba(30, 41, 59, 0.86);
  border-color: rgba(96, 165, 250, 0.4);
  color: #f8fafc;
  transform: translateY(-1px);
}

.message-edit-icon {
  width: 15px;
  height: 15px;
  display: block;
  flex: 0 0 auto;
}

.message.user :deep(.message-attachments) {
  justify-content: flex-end;
}

.typing {
  color: rgba(243, 244, 246, 0.72);
  font-style: italic;
}

.error {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(239, 68, 68, 0.18);
  color: #fecaca;
}

.chat-inputarea {
  border-top: 1px solid var(--cp-border);
  padding: 15px 10px 15px;
  background: rgba(7, 10, 18, 0.86);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  /* gap: 14px; */
}

.chat-container.standard-mode .chat-messages {
  padding: 32px 32px 18px;
}

.chat-container.standard-mode .chat-inputarea {
  padding: 18px 18px 20px;
  background:
    linear-gradient(180deg, rgba(9, 12, 18, 0.92), rgba(7, 10, 18, 0.98)),
    radial-gradient(circle at top center, rgba(59, 130, 246, 0.08), transparent 38%);
}

.toolbar-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-resend-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(250, 204, 21, 0.24);
  border-radius: 14px;
  background: rgba(120, 53, 15, 0.2);
  color: #fde68a;
}

.edit-resend-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.edit-resend-copy strong {
  font-size: 13px;
}

.edit-resend-copy span {
  font-size: 12px;
  color: rgba(254, 240, 138, 0.9);
}

.edit-resend-cancel {
  flex: 0 0 auto;
  padding: 8px 12px;
  border: 1px solid rgba(253, 224, 71, 0.24);
  border-radius: 999px;
  color: #fef3c7;
  background: rgba(15, 23, 42, 0.35);
  cursor: pointer;
}

.chat-container.standard-mode .toolbar-stack {
  gap: 16px;
}

.toolbar-collapse-toggle {
  align-self: flex-start;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: rgba(148, 163, 184, 0.92);
  font-size: 12px;
  line-height: 1.2;
  text-decoration: none;
}

.toolbar-collapse-toggle:not(:disabled):hover,
.toolbar-collapse-toggle:not(:disabled):focus-visible {
  background: transparent;
  color: rgba(226, 232, 240, 0.96);
  text-decoration: underline;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.chat-container.standard-mode .selector-row {
  gap: 14px;
  align-items: flex-start;
}

.auth-warning {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.12);
  color: #fcd34d;
  font-size: 12px;
  line-height: 1.3;
}

.auth-recovery-btn {
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(252, 211, 77, 0.28);
  background: rgba(250, 204, 21, 0.18);
  color: #fef3c7;
}

.auth-recovery-btn:not(:disabled) {
  box-shadow: inset 0 0 0 1px rgba(252, 211, 77, 0.16);
}

.auth-recovery-btn:not(:disabled):hover,
.auth-recovery-btn:not(:disabled):focus-visible {
  background: rgba(250, 204, 21, 0.28);
  border-color: rgba(252, 211, 77, 0.42);
}

.archive-feedback {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.45;
}

.archive-feedback.tone-success {
  background: rgba(34, 197, 94, 0.16);
  color: #bbf7d0;
}

.archive-feedback.tone-info {
  background: rgba(59, 130, 246, 0.14);
  color: #bfdbfe;
}

.archive-feedback.tone-error {
  background: rgba(239, 68, 68, 0.18);
  color: #fecaca;
}

.archive-status {
  color: rgba(226, 232, 240, 0.82);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.input-row,
.preview-button-row {
  display: flex;
  gap: 10px;
}

.chat-container.standard-mode .input-attachment-drafts {
  position: absolute;
  right: calc(var(--standard-action-column-width) + 14px);
  bottom: calc(100% + 8px);
  max-width: min(680px, 72vw);
}

.chat-container.standard-mode .input-row {
  position: relative;
  align-items: stretch;
  gap: 0;
  margin-top: 8px;
  padding-right: calc(var(--standard-action-column-width) + 14px);
}

.input-actions {
  display: flex;
  flex-direction: column;
  /* gap: 8px; */
  align-items: flex-end;
  justify-content: space-between;
  align-self: stretch;
  margin-top: -20px;
}

.chat-container.standard-mode .input-actions {
  position: absolute;
  top: calc(-1 * var(--standard-toolbar-offset));
  right: 0;
  bottom: 0;
  width: var(--standard-action-column-width);
  min-width: var(--standard-action-column-width);
  align-self: auto;
  margin-top: 0;
  align-items: center;
}

.secondary-actions {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

textarea {
  flex: 1;
  box-sizing: border-box;
  resize: none;
  min-height: 50px;
  max-height: 240px;
  overflow-y: auto;
  padding: 15px 18px;
  border-radius: 20px;
  border: 1px solid var(--cp-border);
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 38%),
    rgba(255, 255, 255, 0.05);
  color: var(--cp-text-primary);
  font: inherit;
}

.chat-container.standard-mode textarea {
  min-height: 88px;
  padding: 18px 20px;
  border-radius: 26px;
  border-color: rgba(148, 163, 184, 0.14);
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.1), transparent 42%),
    rgba(255, 255, 255, 0.045);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 14px 34px rgba(0, 0, 0, 0.18);
}

textarea:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

button {
  padding: 10px 16px;
  border-radius: 14px;
  border: none;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-row button {
  min-height: 50px;
  width: auto;
  min-width: 0;
}

button[data-testid="normal-send"] {
  width: 44px;
  height: 44px;
  min-height: 44px;
  padding: 0;
  border-radius: 14px;
  border: 1px solid rgba(96, 165, 250, 0.22);
  background: linear-gradient(180deg, #2d5ea8 0%, #234d8f 100%);
  color: #f8fbff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 10px 20px rgba(35, 77, 143, 0.28);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
}

.chat-container.standard-mode button[data-testid="normal-send"] {
  width: 48px;
  height: 48px;
  min-height: 48px;
  border-radius: 16px;
}

button[data-testid="normal-send"]:not(:disabled):hover,
button[data-testid="normal-send"]:not(:disabled):focus-visible {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 14px 24px rgba(35, 77, 143, 0.32);
  background: linear-gradient(180deg, #3569b8 0%, #28569c 100%);
}

button[data-testid="normal-send"]:disabled {
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(71, 85, 105, 0.34);
  color: rgba(226, 232, 240, 0.7);
  box-shadow: none;
}

.secondary-action-btn,
.toolbar-collapse-toggle {
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  color: rgba(226, 232, 240, 0.82);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.chat-container.standard-mode .secondary-actions {
  gap: 10px;
  min-height: 38px;
  justify-content: center;
}

.chat-container.standard-mode .secondary-action-btn,
.chat-container.standard-mode .toolbar-collapse-toggle {
  width: 28px;
  height: 28px;
  min-height: 28px;
  color: rgba(226, 232, 240, 0.9);
}

.secondary-action-btn:not(:disabled):hover,
.secondary-action-btn:not(:disabled):focus-visible,
.toolbar-collapse-toggle:not(:disabled):hover,
.toolbar-collapse-toggle:not(:disabled):focus-visible {
  background: transparent;
  color: #f8fafc;
  text-decoration: none;
}

.send-icon {
  width: 17px;
  height: 17px;
  display: block;
  stroke-width: 2.4;
}

.action-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.stop-btn {
  background: rgba(255, 255, 255, 0.08) !important;
  color: var(--cp-text-primary);
}

.thread-message-leave-active {
  transition: opacity 220ms ease, transform 220ms ease, max-height 220ms ease;
  overflow: hidden;
}

.thread-message-leave-from {
  opacity: 1;
  transform: scale(1);
  max-height: 320px;
}

.thread-message-leave-to {
  opacity: 0;
  transform: scale(0.97);
  max-height: 0;
}

.preview-actions {
  border: 1px solid var(--cp-border);
  border-radius: 18px;
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.preview-button-row {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ghost-btn {
  background: rgba(255, 255, 255, 0.08);
  color: var(--cp-text-primary);
}

.import-btn {
  background: var(--cp-accent);
  color: white;
}

@media (max-width: 920px) {
  .input-row,
  .preview-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .selector-row {
    align-items: stretch;
  }

  .preview-button-row {
    justify-content: stretch;
  }

  .preview-button-row button {
    width: 100%;
  }

  .input-actions {
    flex-direction: row;
    justify-content: flex-end;
    align-items: center;
  }

  .chat-container.standard-mode .input-row {
    margin-top: 0;
    padding-right: 0;
    gap: 14px;
  }

  .chat-container.standard-mode .input-actions {
    position: static;
    top: auto;
    right: auto;
    bottom: auto;
    width: auto;
    min-width: 0;
    align-self: flex-end;
  }
}
</style>
