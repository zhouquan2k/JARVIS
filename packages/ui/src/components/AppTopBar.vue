<template>
  <header class="top-nav">
    <div class="brand">
      <img class="brand-icon" :src="brandIconSrc" alt="" aria-hidden="true">
      <h1 class="brand-title">{{ title }}</h1>
    </div>
    <nav
      v-if="workspaceOptions.length > 0"
      class="workspace-switcher"
      :aria-label="t('topBar.workspaceSwitcher')"
      data-testid="topbar-workspace-switcher"
    >
      <button
        v-for="option in workspaceOptions"
        :key="option.path"
        type="button"
        class="workspace-btn"
        :class="{ active: option.path === activeWorkspacePath }"
        :aria-pressed="option.path === activeWorkspacePath"
        :data-testid="`topbar-workspace-${option.name}`"
        @click="emit('navigate-workspace', option.path)"
      >
        {{ option.label }}
      </button>
    </nav>
    <div class="top-meta">
      <div
        v-if="showNodeHistoryControls"
        class="node-history-controls"
        data-testid="topbar-node-history-controls"
      >
        <button
          type="button"
          class="top-icon-button"
          data-testid="topbar-node-history-back"
          :title="t('shared.goBackNodeHistory')"
          :aria-label="t('shared.goBackNodeHistory')"
          :disabled="!canGoBackNodeHistory"
          @click="emit('go-back-node-history')"
        >
          <ChevronLeft class="top-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="top-icon-button"
          data-testid="topbar-node-history-forward"
          :title="t('shared.goForwardNodeHistory')"
          :aria-label="t('shared.goForwardNodeHistory')"
          :disabled="!canGoForwardNodeHistory"
          @click="emit('go-forward-node-history')"
        >
          <ChevronRight class="top-icon" :size="18" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        class="locale-toggle"
        data-testid="topbar-locale-toggle"
        :aria-label="t('topBar.localeSwitch')"
        @click="toggleLocale"
      >
        {{ localeLabel }}
      </button>
      <span v-if="isCompareMode" class="mode-pill">{{ t('topBar.compareMode') }}</span>
      <span v-if="isCompareMode" class="compare-stage">{{ compareStageLabel }}</span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import type { ChatRoute, ChatRoutePath } from '../routes';
import { useWorkspaceI18n } from '../i18n';

type Stage = 'idle' | 'generating' | 'analyzing' | 'completed' | 'failed';

const props = withDefaults(defineProps<{
  title?: string;
  isCompareMode: boolean;
  compareStage: Stage;
  activeWorkspacePath?: ChatRoutePath;
  workspaceOptions?: ReadonlyArray<Pick<ChatRoute, 'path' | 'name' | 'label' | 'labelKey'>>;
  showNodeHistoryControls?: boolean;
  canGoBackNodeHistory?: boolean;
  canGoForwardNodeHistory?: boolean;
}>(), {
  title: 'JARVIS',
  activeWorkspacePath: '/',
  workspaceOptions: () => [],
  showNodeHistoryControls: false,
  canGoBackNodeHistory: false,
  canGoForwardNodeHistory: false
});

const emit = defineEmits<{
  (event: 'navigate-workspace', path: ChatRoutePath): void;
  (event: 'go-back-node-history'): void;
  (event: 'go-forward-node-history'): void;
}>();

const { locale, t, toggleLocale } = useWorkspaceI18n();

const workspaceOptions = computed(() => {
  return props.workspaceOptions.map((option) => ({
    ...option,
    label: option.labelKey ? t(option.labelKey) : option.label
  }));
});

const localeLabel = computed(() => {
  return locale.value === 'en' ? t('topBar.localeEnglish') : t('topBar.localeChinese');
});

const compareStageLabel = computed(() => {
  return t(`topBar.stage.${props.compareStage}`);
});

const brandIconSrc = '/jarvis.png';
</script>

<style scoped>
.top-nav {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(15, 19, 27, 0.94), rgba(11, 14, 20, 0.9)),
    rgba(7, 10, 18, 0.92);
  backdrop-filter: blur(10px);
  z-index: 20;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
}

.brand-title {
  margin: 0;
  font-size: 22px;
  line-height: 1;
  color: #f3f4f6;
}

.workspace-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.node-history-controls {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.top-icon-button {
  border: 0;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  padding: 0;
  color: rgba(226, 232, 240, 0.88);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.top-icon-button:hover,
.top-icon-button:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.top-icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.top-icon {
  width: 18px;
  height: 18px;
}

.workspace-btn {
  border: 0;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
  color: #cbd5e1;
  background: transparent;
  cursor: pointer;
}

.workspace-btn.active {
  color: #f8fafc;
  background: rgba(59, 130, 246, 0.22);
}

.workspace-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.workspace-btn.active:hover {
  background: rgba(59, 130, 246, 0.28);
}

.top-meta {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.locale-toggle {
  border: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  color: #d1d5db;
  background: rgba(255, 255, 255, 0.05);
  font-size: 12px;
  cursor: pointer;
}

.locale-toggle:hover {
  background: rgba(255, 255, 255, 0.09);
}

.mode-pill,
.compare-stage {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
}

.mode-pill {
  border: 1px solid rgba(129, 140, 248, 0.22);
  background: rgba(99, 102, 241, 0.12);
  color: #c7d2fe;
}

.compare-stage {
  color: #d1d5db;
  background: rgba(255, 255, 255, 0.06);
}

@media (max-width: 920px) {
  .top-nav {
    flex-wrap: wrap;
  }

  .brand {
    gap: 8px;
  }

  .brand-icon {
    width: 30px;
    height: 30px;
  }

  .brand-title {
    font-size: 20px;
  }

  .workspace-switcher {
    order: 3;
    width: 100%;
    justify-content: flex-start;
  }

  .top-meta {
    margin-left: 0;
  }
}
</style>
