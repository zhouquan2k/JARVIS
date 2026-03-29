<template>
  <div class="chat-container" data-testid="normal-chat-view">
    <div class="chat-main">
      <div class="chat-thread">
        <div class="chat-messages" ref="messagesRef" data-testid="normal-messages" @scroll="onMessagesScroll">
          <div v-if="chatStore.isExternalPreviewLoading" class="loading-banner" data-testid="external-preview-loading">
            正在加载对话内容...
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
                <div v-if="msg.role === 'user'" class="content user-content">{{ msg.content || '已发送附件' }}</div>
                <MessageAttachmentStrip v-if="msg.attachments?.length" :attachments="msg.attachments" />
                <MarkdownContent
                  v-if="msg.role === 'assistant'"
                  class="content markdown-body"
                  :source="msg.content"
                  :annotations="msg.annotations"
                />
              </div>
            </TransitionGroup>
          </template>

          <div v-if="chatStore.isGenerating" class="message assistant">
            <div class="content typing">typing...</div>
          </div>

          <div v-if="chatStore.currentError" class="error" data-testid="normal-error">
            {{ chatStore.currentError }}
          </div>
        </div>

        <button
          v-if="showQuestionIndexToggle"
          type="button"
          class="chat-index-toggle"
          data-testid="question-panel-open"
          @click="chatStore.setQuestionIndexPanelOpen(true)"
        >
          显示大纲
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
            v-if="!isTopToolbarCollapsed"
            class="selector-row"
            data-testid="selector-row"
          >
            <AttachmentComposer
              :attachments="chatStore.draftAttachments"
              :disabled="isInputDisabled"
              :error="chatStore.attachmentError"
              @select-files="onSelectFiles"
              @remove="chatStore.removeDraftAttachment"
            />

            <ProviderModelSelector
              :providers="chatStore.availableProviders"
              :current-provider-id="chatStore.currentProviderId"
              :current-model-id="chatStore.currentModelId"
              :models-loading="chatStore.isCurrentProviderModelsLoading"
              :disabled="isInputDisabled"
              @provider-change="onProviderChange"
              @model-change="onModelChange"
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
            正在加载当前 Provider 的模型目录
          </div>
          <div v-else-if="!effectiveIsAuthenticated" class="auth-warning" data-testid="normal-auth-warning">
            <span>{{ authUnavailableText }}</span>
            <button
              v-if="authRecoveryActionLabel"
              type="button"
              class="auth-recovery-btn"
              data-testid="normal-auth-recovery"
              :disabled="authRecoveryActionDisabled"
              @click="emit('request-auth-recovery')"
            >
              {{ authRecoveryActionLabel }}
            </button>
          </div>
        </div>

        <div class="input-row">
          <textarea
            ref="inputRef"
            data-testid="normal-input"
            v-model="draftPrompt"
            @input="syncInputHeight"
            @paste="onPaste"
            @keydown="onInputKeydown"
            placeholder="输入内容，按 Enter 换行，Ctrl/Cmd + Enter 发送"
            :disabled="isInputDisabled"
          />
          <div class="input-actions">
            <div v-if="!chatStore.isGenerating" class="secondary-actions" data-testid="secondary-actions">
              <button
                v-if="isAgentMode"
                type="button"
                class="toolbar-collapse-toggle"
                :aria-expanded="String(!isTopToolbarCollapsed)"
                :aria-label="isTopToolbarCollapsed ? '展开顶部工具栏' : '折叠顶部工具栏'"
                :title="isTopToolbarCollapsed ? '展开选项' : '折叠选项'"
                data-testid="toolbar-collapse-toggle"
                @click="toggleTopToolbarCollapsed"
              >
                <PanelTopOpen class="action-icon" :size="16" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="secondary-action-btn"
                data-testid="normal-new-chat"
                title="新建聊天"
                aria-label="新建聊天"
                :disabled="isInputDisabled"
                @click="startNewChat"
              >
                <SquarePen class="action-icon" :size="16" aria-hidden="true" />
              </button>
            </div>
            <button
              v-if="!chatStore.isGenerating"
              data-testid="normal-send"
              title="Enter 换行，Ctrl/Cmd + Enter 发送"
              aria-label="发送"
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
              title="停止当前生成"
            >
              停止生成
            </button>
          </div>
        </div>
      </template>

      <div v-else class="preview-actions">
        <div>
          <p class="eyebrow">只读预览</p>
          <h3>确认后将保存为本地会话，并立即恢复输入区。</h3>
        </div>
        <div class="preview-button-row">
          <button
            class="ghost-btn"
            type="button"
            data-testid="preview-back"
            @click="chatStore.exitPreview()"
          >
            返回活动会话
          </button>
          <button
            class="import-btn"
            type="button"
            data-testid="preview-import"
            @click="chatStore.importPreviewConversation()"
          >
            导入到本地
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConversationMessage } from '@packages/core/src';
import { computed, nextTick, onMounted, ref, watch, type PropType } from 'vue';
import { ArrowUp, PanelTopOpen, SquarePen } from 'lucide-vue-next';
import AttachmentComposer from '../components/AttachmentComposer.vue';
import MarkdownContent from '../components/MarkdownContent.vue';
import MessageAttachmentStrip from '../components/MessageAttachmentStrip.vue';
import ModelOptionToggleGroup from '../components/ModelOptionToggleGroup.vue';
import ProviderModelSelector from '../components/ProviderModelSelector.vue';
import QuestionIndexPanel from '../components/QuestionIndexPanel.vue';
import { useChatStore } from '../store/chat';
import { isPromptSubmitHotkey } from '../utils/promptHotkeys';

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
    default: '当前 Provider 鉴权不可用'
  },
  authRecoveryActionLabel: {
    type: String,
    default: ''
  },
  authRecoveryActionDisabled: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits<{
  (event: 'request-auth-recovery'): void;
}>();

const chatStore = useChatStore();
const isAuthenticated = ref(false);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const isTopToolbarCollapsed = ref(false);
let scrollSyncFrame: number | null = null;

async function refreshAuthStatus() {
  isAuthenticated.value = await chatStore.checkAuth();
}

const displayConversation = computed(() => chatStore.displayConversation);
const isPreviewing = computed(() => chatStore.isPreviewing);
const renderedMessages = computed(() => isPreviewing.value ? displayConversation.value?.messages || [] : chatStore.visibleMessages);
const modelOptionDefinitions = computed(() => chatStore.currentModelOptionDefinitions);
const isAgentMode = computed(() => chatStore.activeAgentContext !== null);
const draftPrompt = computed({
  get: () => chatStore.draftPrompt,
  set: (value: string) => chatStore.setDraftPrompt(value)
});
const hasQuestionIndexContent = computed(() => {
  if (!props.showQuestionIndex || chatStore.workspaceMode !== 'active') {
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
  if (props.authStatusOverride === true) {
    return true;
  }

  if (props.authStatusOverride !== false) {
    return false;
  }

  return props.authUnavailableMessage !== '当前 Provider 鉴权不可用'
    || props.authRecoveryActionLabel.length > 0
    || props.authRecoveryActionDisabled;
});
const effectiveIsAuthenticated = computed(() => {
  if (!hasExplicitAuthOverride.value || props.authStatusOverride === null) {
    return isAuthenticated.value;
  }

  return props.authStatusOverride;
});
const authUnavailableText = computed(() => props.authUnavailableMessage || '当前 Provider 鉴权不可用');
const isInputDisabled = computed(() => {
  return chatStore.isGenerating || !effectiveIsAuthenticated.value || chatStore.isCurrentProviderModelsLoading || !chatStore.currentModelId;
});
const messageQuestionMeta = computed(() => {
  const meta = new Map<string, { questionKey: string; starred: boolean; root: boolean }>();
  if (isPreviewing.value || !chatStore.currentConversation) {
    return meta;
  }

  const starredByQuestionKey = new Map<string, boolean>();
  for (const message of chatStore.currentConversation.messages) {
    if (message.role !== 'user') {
      continue;
    }

    starredByQuestionKey.set(message.questionId || `legacy:${message.id}`, message.starred === true);
  }

  let pendingLegacyQuestionKey: string | null = null;
  for (const message of chatStore.currentConversation.messages) {
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
  });
});

watch(() => renderedMessages.value, () => {
  if (isPreviewing.value) {
    return;
  }
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
    }
    syncActiveQuestionFromScroll();
  });
}, { deep: true });

watch(
  () => [displayConversation.value?.id, isPreviewing.value] as const,
  () => {
    nextTick(() => {
      if (!messagesRef.value) {
        return;
      }

      messagesRef.value.scrollTop = isPreviewing.value ? 0 : messagesRef.value.scrollHeight;
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

watch(isAgentMode, (value) => {
  isTopToolbarCollapsed.value = value;
}, { immediate: true });

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

  await chatStore.sendDraft();
}

function getMessageQuestionKey(message: ConversationMessage): string | null {
  return messageQuestionMeta.value.get(message.id)?.questionKey || null;
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
  });
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

async function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || []);
  if (files.length === 0) {
    return;
  }

  event.preventDefault();
  await onSelectFiles(files);
}

async function onDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length === 0) {
    return;
  }

  await onSelectFiles(files);
}

async function onProviderChange(providerId: string) {
  await chatStore.setCurrentModelProvider(providerId);
}

function onModelChange(modelId: string) {
  chatStore.setCurrentModel(modelId);
}

function onModelOptionChange(payload: { key: string; enabled: boolean }) {
  chatStore.setCurrentModelOption(payload.key, payload.enabled);
}

function toggleTopToolbarCollapsed() {
  isTopToolbarCollapsed.value = !isTopToolbarCollapsed.value;
}

async function startNewChat() {
  await chatStore.startNewConversation();
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
  max-width: min(78%, 620px);
  padding: 12px 16px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(42, 108, 230, 0.94), rgba(31, 95, 212, 0.94));
  color: #eef5ff;
  box-shadow: 0 18px 36px rgba(14, 55, 122, 0.22);
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

.toolbar-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.input-row,
.preview-button-row {
  display: flex;
  gap: 10px;
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
}
</style>
