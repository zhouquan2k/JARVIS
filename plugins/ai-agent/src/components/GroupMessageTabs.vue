<template>
  <div class="group-message-tabs" data-testid="group-message-tabs">
    <!-- Tab header -->
    <div class="group-tabs-header" role="tablist">
      <button
        v-if="showSummaryTab"
        role="tab"
        :aria-selected="activeTab === 'summary'"
        :class="['group-tab-btn', { 'is-active': activeTab === 'summary' }]"
        data-testid="group-tab-summary"
        @click="selectTab('summary')"
      >
        <span class="group-tab-status-dot" :class="summaryStatusClass" aria-hidden="true" />
        {{ t('shared.groupSummaryTab') }}
      </button>
      <button
        v-for="member in groupMembers"
        :key="member.name"
        role="tab"
        :aria-selected="activeTab === member.name"
        :class="['group-tab-btn', { 'is-active': activeTab === member.name }]"
        :data-testid="`group-tab-${member.name}`"
        @click="selectTab(member.name)"
      >
        <span class="group-tab-status-dot" :class="memberStatusClass(member.status)" aria-hidden="true" />
        {{ member.name }}
      </button>
    </div>

    <!-- Summary tab content -->
    <div
      v-if="activeTab === 'summary' && showSummaryTab"
      class="group-tab-content"
      role="tabpanel"
      data-testid="group-tab-content-summary"
    >
      <template v-if="groupSummary?.phase === 'done'">
        <div class="group-summary-body" @click.stop="onSummaryClick">
          <MarkdownContent
            class="content markdown-body"
            :source="localizedSummaryContent"
            :mentions="[...memberNames]"
          />
        </div>
      </template>
      <template v-else-if="groupSummary?.phase === 'error'">
        <div class="group-summary-error" data-testid="group-summary-error">
          {{ groupSummary.error || t('shared.groupSummaryError') }}
        </div>
      </template>
      <template v-else>
        <!-- Progress view while waiting/streaming -->
        <div class="group-summary-progress" data-testid="group-summary-progress">
          <div v-for="member in groupMembers" :key="member.name" class="group-summary-progress-item">
            <span class="group-tab-status-dot" :class="memberStatusClass(member.status)" />
            <span>{{ member.name }}</span>
            <span class="group-summary-status-label">
              {{ member.status === 'done' ? '✓' : member.status === 'error' ? '✗' : '…' }}
            </span>
          </div>
          <div v-if="groupSummary?.phase === 'streaming' && groupSummary.content" class="group-summary-streaming">
            <MarkdownContent class="content markdown-body" :source="groupSummary.content" />
          </div>
          <div v-else-if="!groupSummary || groupSummary.phase === 'waiting'" class="group-summary-waiting">
            {{ t('shared.groupSummaryWaiting') }}
          </div>
        </div>
      </template>
    </div>

    <!-- Member tab content -->
    <template v-for="member in groupMembers" :key="member.name">
      <div
        v-if="activeTab === member.name"
        class="group-tab-content"
        role="tabpanel"
        :data-testid="`group-tab-content-${member.name}`"
      >
        <div v-if="member.status === 'error'" class="group-member-error" :data-testid="`group-member-error-${member.name}`">
          {{ member.error || t('shared.groupMemberError') }}
        </div>
        <MarkdownContent
          v-else
          class="content markdown-body"
          :source="member.content"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GroupMemberPart, GroupSummaryPart, GroupMemberStatus } from '../interfaces/Conversation';
import { MarkdownContent, useWorkspaceI18n } from '@packages/ui';
import { SUMMARY_SECTION_ANCHORS } from '../group/groupSummaryPrompt';
import { useChatStore } from '../store/chat';

const props = defineProps<{
  messageId: string;
  groupMembers: GroupMemberPart[];
  groupSummary?: GroupSummaryPart;
}>();

const { t } = useWorkspaceI18n();
const chatStore = useChatStore();

const showSummaryTab = computed(() => props.groupMembers.length > 1);

// Default to first member tab; for already-completed historical turns, default to summary
const initialTab = computed(() => {
  if (showSummaryTab.value && props.groupSummary?.phase === 'done') {
    return 'summary';
  }
  return props.groupMembers[0]?.name ?? 'summary';
});

// 视图切换（workspace/对话）会重挂载本组件；若 store 已保存该消息选中的 tab 则恢复，
// 并视为“用户已切换”，避免后续 auto-switch / reset watch 覆盖恢复的选择。
const persistedTab = chatStore.messageGroupActiveTabs[props.messageId];
const activeTab = ref<string>(persistedTab ?? initialTab.value);
const userHasSwitched = ref(typeof persistedTab === 'string');

function selectTab(name: string): void {
  activeTab.value = name;
  userHasSwitched.value = true;
  chatStore.setMessageGroupActiveTab(props.messageId, name);
}

// Auto-switch to summary when summarization completes (if user hasn't manually switched)
watch(
  () => props.groupSummary?.phase,
  (phase) => {
    if (phase === 'done' && !userHasSwitched.value && showSummaryTab.value) {
      activeTab.value = 'summary';
    }
  }
);

// Reset when members change (new message)
watch(
  () => props.groupMembers[0]?.name,
  () => {
    if (!userHasSwitched.value) {
      activeTab.value = initialTab.value;
    }
  }
);

function memberStatusClass(status: GroupMemberStatus): string {
  if (status === 'done') return 'status-done';
  if (status === 'error') return 'status-error';
  return 'status-streaming';
}

const summaryStatusClass = computed(() => {
  const phase = props.groupSummary?.phase;
  if (phase === 'done') return 'status-done';
  if (phase === 'error') return 'status-error';
  return 'status-streaming';
});

const memberNames = computed(() => new Set(props.groupMembers.map((m) => m.name)));

// 渲染时本地化：把模型产出的固定英文锚点标题（## Consensus 等）替换为当前语言。
// 依赖 t，切换语言可实时更新；对已生成的历史内容同样生效。
const localizedSummaryContent = computed(() => {
  const content = props.groupSummary?.content ?? '';
  if (!content) return '';
  const localeMap: Array<[string, string]> = [
    [SUMMARY_SECTION_ANCHORS.consensus, t('shared.groupSummaryConsensus')],
    [SUMMARY_SECTION_ANCHORS.complementary, t('shared.groupSummaryComplementary')],
    [SUMMARY_SECTION_ANCHORS.conflicts, t('shared.groupSummaryConflicts')]
  ];
  let result = content;
  for (const [anchor, localized] of localeMap) {
    // 仅替换「整行就是标题」的锚点：行首可带 markdown 标题标记(##) 或加粗(**)，
    // 主体正好是锚点词（允许加粗/冒号收尾）。保留原有标记，只换词，避免误伤正文同名词。
    const pattern = new RegExp(
      `^(\\s{0,3}(?:#{1,4}\\s*)?(?:\\*\\*)?)${anchor}(\\s*:?\\s*(?:\\*\\*)?\\s*:?\\s*)$`,
      'gim'
    );
    result = result.replace(pattern, (whole, prefix: string, suffix: string) => {
      // 必须含标题或加粗标记，否则视为正文不替换
      if (!/[#*]/.test(prefix) && !suffix.includes('*')) return whole;
      return `${prefix}${localized}${suffix}`;
    });
  }
  return result;
});

function onSummaryClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const btn = target.closest<HTMLElement>('.md-mention[data-member]');
  if (btn) {
    const name = btn.dataset['member'];
    if (name && memberNames.value.has(name)) {
      selectTab(name);
    }
  }
}
</script>

<style scoped>
.group-message-tabs {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  min-width: 0;
  align-self: stretch;
}

.group-tabs-header {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
  margin-bottom: 8px;
}

.group-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary, rgba(255,255,255,0.6));
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.group-tab-btn:hover {
  color: var(--text-primary, #fff);
  background: var(--surface-hover, rgba(255,255,255,0.05));
}

.group-tab-btn.is-active {
  color: var(--text-primary, #fff);
  border-color: var(--border-subtle, rgba(255,255,255,0.15));
  background: var(--surface-active, rgba(255,255,255,0.08));
}

.group-tab-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-done {
  background: #4ade80;
}

.status-error {
  background: #f87171;
}

.status-streaming {
  background: #facc15;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.group-tab-content {
  min-height: 32px;
  min-width: 0;
}

.group-summary-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary, rgba(255,255,255,0.6));
}

.group-summary-progress-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-summary-status-label {
  margin-left: auto;
}

.group-summary-waiting {
  font-style: italic;
  color: var(--text-tertiary, rgba(255,255,255,0.4));
  font-size: 12px;
  margin-top: 8px;
}

.group-summary-streaming {
  margin-top: 8px;
}

.group-summary-body {
  display: inline;
}

.group-member-chip-btn {
  display: inline;
  padding: 1px 5px;
  margin: 0 2px;
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.15));
  border-radius: 10px;
  background: var(--surface-active, rgba(255,255,255,0.08));
  color: var(--accent, #60a5fa);
  font-size: 12px;
  cursor: pointer;
  vertical-align: baseline;
  transition: background 0.15s;
}

.group-member-chip-btn:hover {
  background: var(--surface-hover, rgba(255,255,255,0.12));
}

.group-member-error {
  color: #f87171;
  font-size: 13px;
  padding: 8px 0;
}

.group-summary-error {
  color: #f87171;
  font-size: 13px;
  padding: 8px 0;
}
</style>
