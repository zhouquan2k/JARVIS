<template>
  <div class="chat-container">
    <div class="chat-header">
      <h2>ChatPrism (WebApp MVP)</h2>
      <ProviderModelSelector :providers="chatStore.availableProviders" @change="onProviderModelChange" />
      <div v-if="!isAuthenticated" class="auth-warning">
        当前 Provider 鉴权不可用
      </div>
    </div>
    
    <div class="chat-messages" ref="messagesRef">
      <div v-if="chatStore.conversations.length > 0 && !chatStore.currentConversation" class="history-list">
        <h3>History</h3>
        <button 
          v-for="c in chatStore.conversations" 
          :key="c.id" 
          @click="resumeChat(c.id)">
          {{ c.title || 'Untitled' }}
        </button>
      </div>

      <template v-if="chatStore.currentConversation">
        <div 
          v-for="msg in chatStore.currentConversation.messages" 
          :key="msg.id" 
          :class="['message', msg.role]">
          <div class="role-label">{{ msg.role === 'user' ? 'You' : 'Assistant' }}</div>
          <div class="content">{{ msg.content }}</div>
        </div>
      </template>

      <div v-if="chatStore.isGenerating" class="message assistant">
        <div class="role-label">Assistant</div>
        <div class="content typing">typing...</div>
      </div>
      
      <div v-if="chatStore.currentError" class="error">
        {{ chatStore.currentError }}
      </div>
    </div>

    <div class="chat-inputarea">
      <textarea 
        v-model="inputPrompt" 
        @keydown.enter.prevent="send()"
        placeholder="Type a message (Enter to send)..."
        :disabled="chatStore.isGenerating || !isAuthenticated">
      </textarea>
      <button 
        @click="send()" 
        :disabled="!inputPrompt.trim() || chatStore.isGenerating || !isAuthenticated">
        Send
      </button>
      <button 
        v-if="chatStore.isGenerating" 
        @click="chatStore.abort()" 
        class="stop-btn">
        Stop
      </button>
      <button @click="newChat()" class="new-btn">New</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useChatStore } from './store/chat';
import ProviderModelSelector from './components/ProviderModelSelector.vue';

const chatStore = useChatStore();
const isAuthenticated = ref(false);
const inputPrompt = ref('');
const messagesRef = ref<HTMLElement | null>(null);

onMounted(async () => {
  await chatStore.init();
  isAuthenticated.value = await chatStore.checkAuth();
});

watch(() => chatStore.currentConversation?.messages, () => {
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
  if (!text || !isAuthenticated.value || chatStore.isGenerating) return;
  
  inputPrompt.value = '';
  await chatStore.sendMessage(text);
}

function newChat() {
  chatStore.startNewConversation();
}

function resumeChat(id: string) {
  chatStore.loadConversation(id);
}

function onProviderModelChange(payload: { providerId: string; modelId: string }) {
  chatStore.setCurrentModelProvider(payload.providerId, payload.modelId);
}
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background-color: #f7f7f8;
}
.chat-header {
  padding: 12px;
  background: white;
  border-bottom: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chat-header h2 {
  margin: 0;
  font-size: 16px;
}
.auth-warning {
  color: red;
  font-size: 12px;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.message {
  padding: 12px;
  border-radius: 8px;
  max-width: 85%;
}
.message.user {
  background: #10a37f;
  color: white;
  align-self: flex-end;
}
.message.assistant {
  background: white;
  border: 1px solid #ddd;
  align-self: flex-start;
}
.role-label {
  font-size: 11px;
  font-weight: bold;
  opacity: 0.8;
  margin-bottom: 4px;
}
.content {
  white-space: pre-wrap;
  word-wrap: break-word;
}
.typing {
  color: #888;
  font-style: italic;
}
.chat-inputarea {
  padding: 12px;
  background: white;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 8px;
}
.chat-inputarea textarea {
  flex: 1;
  resize: none;
  height: 40px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
}
button {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  background: #10a37f;
  color: white;
  cursor: pointer;
}
button:disabled {
  background: #ccc;
  cursor: not-allowed;
}
.stop-btn { background: #e53e3e; }
.new-btn { background: #3182ce; }
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.history-list button {
  background: white;
  color: #333;
  border: 1px solid #ddd;
  padding: 12px;
  text-align: left;
}
</style>
