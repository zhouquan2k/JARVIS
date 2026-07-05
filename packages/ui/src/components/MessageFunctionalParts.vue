<template>
  <div v-if="parts.length > 0" class="message-functional-parts" data-testid="message-functional-parts">
    <details
      v-for="part in parts"
      :key="part.id"
      class="message-functional-part"
      :open="part.collapsed === false"
      data-testid="message-functional-part"
    >
      <summary class="message-functional-part__summary">
        <span class="message-functional-part__summary-text">
          <span class="message-functional-part__kind">{{ kindLabel(part.kind) }}</span>
          <span class="message-functional-part__title">{{ part.title }}</span>
        </span>
        <span class="message-functional-part__chevron" aria-hidden="true">›</span>
      </summary>
      <div
        v-if="part.kind === 'tool_exchange' && (part.requestContent || part.responseContent)"
        class="message-functional-part__content-shell"
      >
        <div v-if="part.requestContent" class="message-functional-part__section">
          <div class="message-functional-part__label">{{ t('shared.functionalPartRequest') }}</div>
          <pre class="message-functional-part__content">{{ part.requestContent }}</pre>
        </div>
        <div v-if="part.responseContent" class="message-functional-part__section">
          <div class="message-functional-part__label">{{ t('shared.functionalPartResponse') }}</div>
          <pre class="message-functional-part__content">{{ part.responseContent }}</pre>
        </div>
      </div>
      <pre v-else class="message-functional-part__content message-functional-part__content--standalone">{{ part.content }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { useWorkspaceI18n } from '../i18n';
import type { WorkspaceMessageFunctionalPart, WorkspaceMessageFunctionalPartKind } from '../types/messageFunctionalParts';

defineProps<{
  parts: WorkspaceMessageFunctionalPart[];
}>();

const { t } = useWorkspaceI18n();

function kindLabel(kind: WorkspaceMessageFunctionalPartKind): string {
  switch (kind) {
    case 'tool_exchange':
      return t('shared.functionalPartToolExchange');
    case 'tool_call':
      return t('shared.functionalPartToolCall');
    case 'tool_result':
      return t('shared.functionalPartToolResult');
    case 'function_call':
      return t('shared.functionalPartFunctionCall');
    case 'search':
      return t('shared.functionalPartSearch');
    case 'trace':
      return t('shared.functionalPartTrace');
    default:
      return t('shared.functionalPartDetail');
  }
}
</script>

<style scoped>
.message-functional-parts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
}

.message-functional-part {
  max-width: 100%;
  color: var(--text-color, #d7dde7);
}

.message-functional-part[open] {
  margin-bottom: 4px;
}

.message-functional-part__summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  cursor: pointer;
  color: var(--text-color, #d7dde7);
  font-size: 12px;
  line-height: 1.4;
  list-style: none;
  user-select: none;
}

.message-functional-part__summary::-webkit-details-marker {
  display: none;
}

.message-functional-part__summary-text {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.message-functional-part__kind {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 500;
  color: color-mix(in srgb, var(--text-color, #d7dde7) 84%, var(--text-muted, #98a2b3));
}

.message-functional-part__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: color-mix(in srgb, var(--text-color, #d7dde7) 88%, var(--text-muted, #98a2b3));
  font-size: 12px;
}

.message-functional-part__chevron {
  flex: 0 0 auto;
  font-size: 14px;
  line-height: 1;
  color: color-mix(in srgb, var(--text-color, #d7dde7) 80%, var(--text-muted, #98a2b3));
  transform: translateY(-1px);
  transition: transform 0.14s ease;
}

.message-functional-part[open] .message-functional-part__chevron {
  transform: rotate(90deg) translateY(1px);
}

.message-functional-part__content-shell {
  margin: 4px 0 2px 12px;
  padding-left: 10px;
  border-left: 1px solid color-mix(in srgb, var(--border-color, #d8dee8) 72%, transparent);
}

.message-functional-part__section + .message-functional-part__section {
  margin-top: 8px;
}

.message-functional-part__label {
  margin-bottom: 3px;
  color: color-mix(in srgb, var(--text-color, #d7dde7) 84%, var(--text-muted, #98a2b3));
  font-size: 11px;
  font-weight: 500;
}

.message-functional-part__content {
  margin: 0;
  padding: 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: color-mix(in srgb, var(--text-color, #d7dde7) 90%, var(--text-muted, #98a2b3));
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace;
  line-height: 1.5;
}

.message-functional-part__content--standalone {
  margin: 4px 0 2px 12px;
  padding-left: 10px;
  border-left: 1px solid color-mix(in srgb, var(--border-color, #d8dee8) 72%, transparent);
}
</style>
