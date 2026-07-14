<template>
  <aside class="question-index-panel" data-testid="question-index-panel">
    <header class="panel-header">
      <div class="panel-header-row">
        <div class="panel-toolbar" role="toolbar" :aria-label="t('shared.questionFilter')">
          <button
            type="button"
            class="tool-btn"
            :class="{ active: chatStore.questionIndexFilter === 'all' }"
            data-testid="question-filter-all"
            :aria-label="t('shared.showAllQuestions')"
            :aria-pressed="chatStore.questionIndexFilter === 'all'"
            @click="chatStore.setQuestionIndexFilter('all')"
          >
            <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
              <path
                d="M4 5.5h12M4 10h12M4 14.5h12"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-width="1.8"
              />
            </svg>
          </button>
          <button
            type="button"
            class="tool-btn"
            :class="{ active: chatStore.questionIndexFilter === 'starred' }"
            data-testid="question-filter-starred"
            :aria-label="t('shared.onlyStarredQuestions')"
            :aria-pressed="chatStore.questionIndexFilter === 'starred'"
            @click="chatStore.setQuestionIndexFilter('starred')"
          >
            <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
              <path
                d="m10 3.3 1.95 3.95 4.35.63-3.15 3.06.75 4.31L10 13.2 6.1 15.25l.75-4.31L3.7 7.88l4.35-.63Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <h3>{{ t('shared.showOutline') }}</h3>
        <button
          type="button"
          class="panel-close-btn"
          data-testid="question-panel-close"
          :aria-label="t('shared.closeQuestionPanel')"
          @click="chatStore.setQuestionIndexPanelOpen(false)"
        >
          <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
            <path
              d="M4.75 4.75 15.25 15.25M15.25 4.75 4.75 15.25"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.8"
            />
          </svg>
        </button>
      </div>
    </header>

    <div v-if="chatStore.questionIndexItems.length === 0" class="empty-state" data-testid="question-index-empty">
      {{ emptyMessage }}
    </div>

    <ul v-else class="question-list">
      <li
        v-for="item in chatStore.questionIndexItems"
        :key="item.questionId"
        class="question-row"
        :class="{
          active: chatStore.activeQuestionId === item.questionId,
          starred: item.starred,
          confirming: pendingDeleteId === item.questionId
        }"
        data-testid="question-item"
      >
        <button
          type="button"
          class="question-main"
          :aria-current="chatStore.activeQuestionId === item.questionId ? 'true' : undefined"
          @click="scrollToQuestion(item.questionId)"
        >
          <span class="question-content">
            <span class="question-bullet" aria-hidden="true"></span>
            <span class="question-title">{{ item.title }}</span>
            <span v-if="item.starred" class="question-marker" aria-hidden="true">★</span>
          </span>
        </button>

        <div class="question-actions">
          <template v-if="pendingDeleteId === item.questionId">
            <button
              type="button"
              class="action-btn confirm-btn"
              data-testid="question-delete-confirm"
              @click.stop="confirmDelete(item.questionId)"
            >
              {{ t('shared.confirm') }}
            </button>
            <button
              type="button"
              class="action-btn ghost-btn"
              data-testid="question-delete-cancel"
              @click.stop="pendingDeleteId = null"
            >
              {{ t('shared.cancel') }}
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="icon-btn"
              :class="{ active: item.starred }"
              data-testid="question-star"
              :aria-label="item.starred ? t('shared.unstarQuestion') : t('shared.starQuestion')"
              :title="item.starred ? t('shared.unstarQuestion') : t('shared.starQuestion')"
              @click.stop="toggleStar(item.questionId)"
            >
              <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                <path
                  d="m10 3.3 1.95 3.95 4.35.63-3.15 3.06.75 4.31L10 13.2 6.1 15.25l.75-4.31L3.7 7.88l4.35-.63Z"
                  :fill="item.starred ? 'currentColor' : 'none'"
                  stroke="currentColor"
                  stroke-linejoin="round"
                  stroke-width="1.4"
                />
              </svg>
            </button>
            <button
              type="button"
              class="icon-btn danger-btn"
              data-testid="question-delete"
              :aria-label="t('shared.deleteQuestion')"
              :title="t('shared.deleteQuestion')"
              @click.stop="pendingDeleteId = item.questionId"
            >
              <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
                <path
                  d="M6.5 6.25v8.25m3.5-8.25v8.25m3.5-8.25v8.25M4.25 5.25h11.5m-8.5-1.5h5.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.6"
                />
              </svg>
            </button>
          </template>
        </div>
      </li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useChatStore } from '../store/chat';
import { useWorkspaceI18n } from '@packages/ui';

const chatStore = useChatStore();
const pendingDeleteId = ref<string | null>(null);
const { t } = useWorkspaceI18n();

const emptyMessage = computed(() => {
  return chatStore.questionIndexFilter === 'starred'
    ? t('shared.noStarredQuestions')
    : t('shared.noQuestions');
});

watch(() => chatStore.questionIndexItems.map((item) => item.questionId), (questionIds) => {
  if (pendingDeleteId.value && !questionIds.includes(pendingDeleteId.value)) {
    pendingDeleteId.value = null;
  }
});

function scrollToQuestion(questionId: string) {
  pendingDeleteId.value = null;
  chatStore.setActiveQuestion(questionId);
  chatStore.requestScrollToQuestion(questionId);
}

async function toggleStar(questionId: string) {
  await chatStore.toggleQuestionStar(questionId);
}

async function confirmDelete(questionId: string) {
  await chatStore.softDeleteQuestionPair(questionId);
  pendingDeleteId.value = null;
}
</script>

<style scoped>
.question-index-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  width: 220px;
  height: 100%;
  min-height: 0;
  gap: 0;
  padding: 0;
  border-left: 1px solid var(--cp-border-subtle);
  background:
    linear-gradient(180deg, rgba(18, 24, 38, 0.98), rgba(15, 21, 34, 0.98)),
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.12), transparent 36%),
    radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.08), transparent 28%);
  box-shadow:
    inset 1px 0 0 rgba(255, 255, 255, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(14px);
}

.panel-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-header-row {
  height: 46px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03));
}

.panel-header-row h3 {
  margin: 0;
  flex: 1;
  min-width: 0;
  text-align: right;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--cp-text-primary);
}

.panel-close-btn {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--cp-text-muted);
  background: transparent;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}

.panel-close-btn svg {
  width: 18px;
  height: 18px;
}

.panel-close-btn:hover,
.panel-close-btn:focus-visible {
  color: var(--cp-text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(226, 232, 240, 0.72);
  background: transparent;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}

.tool-btn svg {
  width: 16px;
  height: 16px;
}

.tool-btn:hover,
.tool-btn:focus-visible {
  color: var(--cp-text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.tool-btn.active {
  color: #facc15;
  background: rgba(250, 204, 21, 0.12);
}

.empty-state {
  margin: 10px;
  border: 1px dashed var(--cp-border);
  border-radius: 12px;
  padding: 14px 12px;
  color: var(--cp-text-muted);
  line-height: 1.5;
  font-size: 13px;
}

.question-list {
  list-style: none;
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.question-row {
  position: relative;
  min-height: 38px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.03);
  transition: background 160ms ease, border-color 160ms ease;
}

.question-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 999px;
  background: transparent;
  transition: background 160ms ease;
}

.question-row:hover,
.question-row.active {
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(59, 130, 246, 0.08);
}

.question-row.active::before {
  background: rgba(96, 165, 250, 0.9);
}

.question-row.starred:not(.active) {
  background: rgba(250, 204, 21, 0.04);
}

.question-main {
  width: 100%;
  min-height: 38px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  padding: 9px 12px;
}

.question-content {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.question-title {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--cp-text-primary);
  font-size: 14px;
  line-height: 20px;
}

.question-bullet {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.58);
}

.question-row.active .question-bullet {
  background: rgba(96, 165, 250, 0.96);
}

.question-row.starred .question-bullet {
  background: rgba(250, 204, 21, 0.92);
}

.question-marker {
  flex: 0 0 auto;
  font-size: 12px;
  color: rgba(250, 204, 21, 0.92);
}

.question-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 20px;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-50%) translateX(4px);
  transition: opacity 160ms ease, transform 160ms ease, visibility 160ms ease;
}

.question-actions::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 28px;
  background: linear-gradient(90deg, transparent 0%, rgba(10, 14, 24, 0.9) 100%);
  transform: translateX(-100%);
  pointer-events: none;
}

.question-row:hover .question-actions,
.question-row:focus-within .question-actions,
.question-row.confirming .question-actions {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translateY(-50%) translateX(0);
}

.icon-btn,
.action-btn {
  border: 0;
  border-radius: 8px;
  height: 26px;
  min-width: 26px;
  padding: 0 7px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(226, 232, 240, 0.86);
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.18);
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.32);
}

.icon-btn svg {
  width: 14px;
  height: 14px;
}

.icon-btn:hover,
.icon-btn:focus-visible,
.action-btn:hover,
.action-btn:focus-visible {
  color: var(--cp-text-primary);
  border-color: rgba(148, 163, 184, 0.32);
}

.confirm-btn,
.icon-btn.active {
  color: #facc15;
}

.confirm-btn {
  background: rgba(250, 204, 21, 0.16);
  border-color: rgba(250, 204, 21, 0.28);
}

.danger-btn {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.92);
  border-color: rgba(248, 113, 113, 0.24);
}

.ghost-btn {
  color: var(--cp-text-primary);
  background: rgba(30, 41, 59, 0.96);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1180px) {
  .question-index-panel {
    width: 200px;
  }
}

@media (max-width: 980px) {
  .question-index-panel {
    display: none;
  }
}
</style>
