<template>
  <div class="chat-container" data-testid="normal-chat-view">
    <div class="chat-messages" ref="messagesRef" data-testid="normal-messages">
      <div v-if="displayConversation" class="conversation-header">
        <div>
          <p class="eyebrow">{{ isPreviewing ? '外部历史预览' : '活动会话' }}</p>
          <h2>{{ displayConversation.title || 'Untitled' }}</h2>
        </div>
        <span class="source-chip">
          {{ displayConversation.sourceType || 'local' }}
        </span>
      </div>

      <div v-if="!displayConversation" class="empty-state" data-testid="normal-empty">
        <h3>从左侧选择一条历史，或者开始一段新聊天。</h3>
        <p>普通模式下支持继续追问，外部历史会先以只读方式预览，再决定是否导入。</p>
      </div>

      <template v-else>
        <div
          v-for="msg in displayConversation.messages"
          :key="msg.id"
          :class="['message', msg.role]"
        >
          <div class="role-label">{{ msg.role === 'user' ? 'You' : 'Assistant' }}</div>
          <div v-if="msg.role === 'user'" class="content user-content">{{ msg.content }}</div>
          <MarkdownContent v-else class="content markdown-body" :source="msg.content" />
        </div>
      </template>

      <div v-if="chatStore.isGenerating" class="message assistant">
        <div class="role-label">Assistant</div>
        <div class="content typing">typing...</div>
      </div>

      <div v-if="chatStore.currentError" class="error" data-testid="normal-error">
        {{ chatStore.currentError }}
      </div>
    </div>

    <div class="chat-inputarea">
      <template v-if="!isPreviewing">
        <div class="selector-row">
          <ProviderModelSelector
            :providers="chatStore.availableProviders"
            :current-provider-id="chatStore.currentProviderId"
            :current-model-id="chatStore.currentModelId"
            :models-loading="chatStore.isCurrentProviderModelsLoading"
            @provider-change="onProviderChange"
            @model-change="onModelChange"
          />
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
            @keydown.enter.prevent="send()"
            placeholder="Type a message (Enter to send)..."
            :disabled="chatStore.isGenerating || !isAuthenticated || chatStore.isCurrentProviderModelsLoading || !chatStore.currentModelId"
          />
          <button
            data-testid="normal-send"
            @click="send()"
            :disabled="!inputPrompt.trim() || chatStore.isGenerating || !isAuthenticated || chatStore.isCurrentProviderModelsLoading || !chatStore.currentModelId"
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
import { useChatStore } from '../store/chat';
import MarkdownContent from '../components/MarkdownContent.vue';
import ProviderModelSelector from '../components/ProviderModelSelector.vue';

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
  if (!text || !isAuthenticated.value || chatStore.isGenerating || isPreviewing.value || chatStore.isCurrentProviderModelsLoading || !chatStore.currentModelId) return;

  inputPrompt.value = '';
  await chatStore.sendMessage(text);
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
  background:
    linear-gradient(180deg, rgba(255, 247, 237, 0.7) 0%, rgba(255, 255, 255, 0.96) 100%);
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conversation-header,
.empty-state,
.preview-actions,
.message.assistant,
.chat-inputarea {
  border: 1px solid #e7e5e4;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
}

.conversation-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 18px;
}

.conversation-header h2,
.preview-actions h3,
.empty-state h3 {
  margin: 4px 0 0;
}

.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #c2410c;
}

.source-chip {
  align-self: flex-start;
  padding: 6px 10px;
  border-radius: 999px;
  background: #1c1917;
  color: #fafaf9;
  font-size: 12px;
}

.empty-state {
  border-radius: 20px;
  padding: 24px;
  color: #44403c;
}

.empty-state p {
  margin-bottom: 0;
  line-height: 1.6;
}

.message {
  padding: 14px 16px;
  border-radius: 18px;
  max-width: 85%;
}

.message.user {
  background: linear-gradient(135deg, #ea580c 0%, #fb923c 100%);
  color: white;
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.role-label {
  font-size: 11px;
  font-weight: bold;
  opacity: 0.8;
  margin-bottom: 6px;
}

.content {
  word-wrap: break-word;
}

.user-content {
  white-space: pre-wrap;
}

.typing {
  color: #78716c;
  font-style: italic;
}

.error {
  padding: 12px 14px;
  border-radius: 14px;
  background: #fee2e2;
  color: #991b1b;
}

.chat-inputarea {
  padding: 14px;
  border-top: 1px solid #e7e5e4;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selector-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.auth-warning {
  color: #dc2626;
  font-size: 12px;
  white-space: nowrap;
}

.input-row,
.preview-button-row {
  display: flex;
  gap: 8px;
}

textarea {
  flex: 1;
  resize: none;
  min-height: 56px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid #d6d3d1;
  background: #fff;
}

button {
  padding: 10px 16px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
}

button:disabled {
  background: #d6d3d1;
  color: #78716c;
  cursor: not-allowed;
}

.input-row button {
  background: #ea580c;
  color: #fff7ed;
}

.stop-btn {
  background: #dc2626 !important;
  color: #fff;
}

.preview-actions {
  border-radius: 18px;
  padding: 16px;
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
  background: #e7e5e4;
  color: #1c1917;
}

.import-btn {
  background: #15803d;
  color: #f0fdf4;
}

@media (max-width: 920px) {
  .selector-row,
  .input-row,
  .preview-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .auth-warning {
    white-space: normal;
  }

  .preview-button-row {
    justify-content: stretch;
  }

  .preview-button-row button {
    width: 100%;
  }
}
</style>
