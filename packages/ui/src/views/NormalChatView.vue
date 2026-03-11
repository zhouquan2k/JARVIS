<template>
  <div class="chat-container" data-testid="normal-chat-view">
    <div class="chat-messages" ref="messagesRef" data-testid="normal-messages">
      <div v-if="displayConversation" class="conversation-header">
        <h2>{{ displayConversation.title || 'Untitled' }}</h2>
        <span class="source-chip">
          {{ isPreviewing ? '导入预览' : '会话' }}
        </span>
      </div>

      <div v-if="!displayConversation" class="empty-state" data-testid="normal-empty">
        <h3>从左侧选择一条历史，或者开始一段新聊天。</h3>
        <p>支持拖拽、文件选择和剪贴板图片粘贴；外部历史会先以只读方式预览，再决定是否导入。</p>
      </div>

      <template v-else>
        <div
          v-for="msg in displayConversation.messages"
          :key="msg.id"
          :class="['message', msg.role]"
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
      </template>

      <div v-if="chatStore.isGenerating" class="message assistant">
        <div class="content typing">typing...</div>
      </div>

      <div v-if="chatStore.currentError" class="error" data-testid="normal-error">
        {{ chatStore.currentError }}
      </div>
    </div>

    <div
      class="chat-inputarea"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <template v-if="!isPreviewing">
        <div class="toolbar-stack">
          <div class="selector-row">
            <AttachmentComposer
              :attachments="chatStore.draftAttachments"
              :disabled="chatStore.isGenerating || !isAuthenticated || chatStore.isCurrentProviderModelsLoading || !chatStore.currentModelId"
              :error="chatStore.attachmentError"
              @select-files="onSelectFiles"
              @remove="chatStore.removeDraftAttachment"
            />

            <ProviderModelSelector
              :providers="chatStore.availableProviders"
              :current-provider-id="chatStore.currentProviderId"
              :current-model-id="chatStore.currentModelId"
              :models-loading="chatStore.isCurrentProviderModelsLoading"
              @provider-change="onProviderChange"
              @model-change="onModelChange"
            />
          </div>

          <div v-if="chatStore.isCurrentProviderModelsLoading" class="auth-warning">
            正在加载当前 Provider 的模型目录
          </div>
          <div v-else-if="!isAuthenticated" class="auth-warning">
            当前 Provider 鉴权不可用
          </div>
        </div>

        <div class="input-row">
          <textarea
            data-testid="normal-input"
            v-model="inputPrompt"
            @paste="onPaste"
            @keydown.enter.prevent="send()"
            placeholder="输入内容，或拖拽 / 粘贴图片到这里"
            :disabled="chatStore.isGenerating || !isAuthenticated || chatStore.isCurrentProviderModelsLoading || !chatStore.currentModelId"
          />
          <button
            data-testid="normal-send"
            @click="send()"
            :disabled="(!inputPrompt.trim() && chatStore.draftAttachments.length === 0) || chatStore.isGenerating || !isAuthenticated || chatStore.isCurrentProviderModelsLoading || !chatStore.currentModelId"
          >
            Send
          </button>
          <button
            v-if="chatStore.isGenerating"
            @click="chatStore.abort()"
            class="stop-btn"
            data-testid="normal-stop"
          >
            Stop
          </button>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AttachmentComposer from '../components/AttachmentComposer.vue';
import MarkdownContent from '../components/MarkdownContent.vue';
import MessageAttachmentStrip from '../components/MessageAttachmentStrip.vue';
import ProviderModelSelector from '../components/ProviderModelSelector.vue';
import { useChatStore } from '../store/chat';

const chatStore = useChatStore();
const isAuthenticated = ref(false);
const inputPrompt = ref('');
const messagesRef = ref<HTMLElement | null>(null);

const displayConversation = computed(() => chatStore.displayConversation);
const isPreviewing = computed(() => chatStore.isPreviewing);

onMounted(async () => {
  await chatStore.init();
  isAuthenticated.value = await chatStore.checkAuth();
});

watch(() => displayConversation.value?.messages, () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
    }
  });
}, { deep: true });

watch(() => chatStore.currentProviderId, async () => {
  isAuthenticated.value = await chatStore.checkAuth();
});

async function send(e?: Event) {
  if (e) e.preventDefault();
  const text = inputPrompt.value.trim();
  if (
    (!text && chatStore.draftAttachments.length === 0)
    || !isAuthenticated.value
    || chatStore.isGenerating
    || isPreviewing.value
    || chatStore.isCurrentProviderModelsLoading
    || !chatStore.currentModelId
  ) {
    return;
  }

  inputPrompt.value = '';
  await chatStore.sendMessage(text);
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

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 24px 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 8px 4px 2px;
}

.conversation-header h2,
.preview-actions h3,
.empty-state h3 {
  margin: 0;
  color: var(--cp-text-primary);
}

.source-chip {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--cp-text-muted);
  font-size: 11px;
}

.empty-state {
  border: 1px solid var(--cp-border);
  border-radius: 20px;
  padding: 24px;
  color: var(--cp-text-muted);
  background: rgba(255, 255, 255, 0.04);
}

.empty-state p {
  margin-bottom: 0;
  line-height: 1.6;
}

.message {
  width: min(100%, 840px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 0;
}

.message.user,
.message.assistant {
  align-self: center;
}

.content {
  word-wrap: break-word;
  color: var(--cp-text-primary);
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
  padding: 18px 20px 24px;
  background: rgba(7, 10, 18, 0.86);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.toolbar-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.12);
  color: #fcd34d;
  font-size: 12px;
  line-height: 1.3;
}

.input-row,
.preview-button-row {
  display: flex;
  gap: 10px;
}

textarea {
  flex: 1;
  resize: none;
  min-height: 96px;
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
}

button[data-testid="normal-send"] {
  background: var(--cp-accent);
  color: white;
}

.stop-btn {
  background: rgba(255, 255, 255, 0.08) !important;
  color: var(--cp-text-primary);
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
}
</style>
