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
import type { ChatRoute, ChatRoutePath } from '../routes';
import { useWorkspaceI18n } from '../i18n';

type Stage = 'idle' | 'generating' | 'analyzing' | 'completed' | 'failed';

const props = withDefaults(defineProps<{
  title?: string;
  isCompareMode: boolean;
  compareStage: Stage;
  activeWorkspacePath?: ChatRoutePath;
  workspaceOptions?: ReadonlyArray<Pick<ChatRoute, 'path' | 'name' | 'label' | 'labelKey'>>;
}>(), {
  title: 'JARVIS',
  activeWorkspacePath: '/',
  workspaceOptions: () => []
});

const emit = defineEmits<{
  (event: 'navigate-workspace', path: ChatRoutePath): void;
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
