<template>
  <div class="bilibili-import-form">
    <label class="form-field">
      <span>Bilibili URL</span>
      <input
        :value="resolvedModelValue.url"
        class="form-input"
        data-testid="bilibili-import-url"
        :disabled="disabled"
        type="url"
        placeholder="https://www.bilibili.com/video/BV..."
        @input="updateField('url', ($event.target as HTMLInputElement).value)"
      >
    </label>

    <p v-if="resolvedModelValue.url && !isValidUrl" class="form-hint form-hint--error" data-testid="bilibili-import-url-error">
      请输入有效的 Bilibili 视频链接。
    </p>

    <label class="form-field">
      <span>文档标题（可选）</span>
      <input
        :value="resolvedModelValue.title"
        class="form-input"
        data-testid="bilibili-import-title"
        :disabled="disabled"
        type="text"
        placeholder="留空则使用抓取到的视频标题"
        @input="updateField('title', ($event.target as HTMLInputElement).value)"
      >
    </label>

    <div class="form-field">
      <span>导入产物</span>
      <label class="checkbox-row">
        <input type="checkbox" checked disabled>
        <span>文字稿（必选）</span>
      </label>
      <label class="checkbox-row">
        <input
          :checked="resolvedModelValue.includeSummary"
          :disabled="disabled || languageModels.length === 0"
          data-testid="bilibili-import-summary"
          type="checkbox"
          @change="updateField('includeSummary', ($event.target as HTMLInputElement).checked)"
        >
        <span>总结稿</span>
      </label>
      <p v-if="languageModels.length === 0" class="form-hint" data-testid="bilibili-import-summary-disabled">
        需启用提供大模型能力的插件后才能生成总结稿。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type BilibiliImportParams = {
  url: string;
  title: string;
  includeSummary: boolean;
};

type BilibiliImportFormProps = {
  modelValue?: BilibiliImportParams;
  languageModels: Array<{ id: string }>;
  disabled?: boolean;
};

const props = withDefaults(defineProps<BilibiliImportFormProps>(), {
  modelValue: () => ({
    url: '',
    title: '',
    includeSummary: false
  }),
  disabled: false
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: BilibiliImportParams): void;
}>();

const resolvedModelValue = computed(() => ({
  url: props.modelValue?.url ?? '',
  title: props.modelValue?.title ?? '',
  includeSummary: props.modelValue?.includeSummary === true && props.languageModels.length > 0
}));

const isValidUrl = computed(() => {
  return /^https?:\/\/(?:www\.)?bilibili\.com\/video\/[^/?#]+/iu.test(resolvedModelValue.value.url.trim());
});

function updateField<Key extends keyof BilibiliImportParams>(key: Key, value: BilibiliImportParams[Key]) {
  emit('update:modelValue', {
    ...resolvedModelValue.value,
    [key]: value
  });
}
</script>

<style scoped>
.bilibili-import-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-field > span {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.form-input {
  height: 42px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 14px;
  color: #0f172a;
  background: #fff;
  transition: border-color 0.12s;
}

.form-input:focus {
  outline: none;
  border-color: #0f766e;
}

.form-input:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  cursor: pointer;
}

.checkbox-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: #0f766e;
}

.checkbox-row span {
  font-size: 14px;
  color: #374151;
}

.form-hint {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.form-hint--error {
  color: #b91c1c;
}
</style>
