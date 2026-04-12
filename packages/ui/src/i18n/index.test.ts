// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createWorkspaceI18n, resolveInitialLocale, resolveWorkspaceText, useWorkspaceI18n } from './index';
import type { SupportedLocale } from './types';

function createMemoryStorage(initialValues: Record<string, string> = {}) {
    const values = new Map<string, string>(Object.entries(initialValues));
    return {
        getItem(key: string) {
            return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            values.set(key, value);
        }
    };
}

describe('workspace i18n runtime', () => {
    it('resolves locale from persisted storage before host language and default', () => {
        expect(resolveInitialLocale({
            storage: createMemoryStorage({ 'chatprism:workspace-locale': 'zh-CN' })
        })).toBe('zh-CN');

        expect(resolveInitialLocale({
            navigatorLanguage: 'zh-TW'
        })).toBe('zh-CN');

        expect(resolveInitialLocale({
            navigatorLanguage: 'en-US'
        })).toBe('en');

        expect(resolveInitialLocale({
            navigatorLanguage: 'fr-FR'
        })).toBe('en');

        expect(resolveInitialLocale({
            navigatorLanguage: '',
            defaultLocale: 'zh-CN'
        })).toBe('zh-CN');
    });

    it('persists locale changes and toggles between supported locales', async () => {
        const storage = createMemoryStorage();
        let workspaceI18n: ReturnType<typeof useWorkspaceI18n> | null = null;

        const TestComponent = defineComponent({
            setup() {
                workspaceI18n = useWorkspaceI18n();
                return () => h('button', {
                    type: 'button',
                    onClick: () => workspaceI18n?.toggleLocale(),
                    'data-testid': 'locale-toggle'
                }, workspaceI18n?.locale.value ?? 'en');
            }
        });

        const wrapper = mount(TestComponent, {
            global: {
                plugins: [createWorkspaceI18n({ storage })]
            }
        });

        expect(workspaceI18n?.locale.value).toBe('en');
        expect(wrapper.text()).toBe('en');

        workspaceI18n?.setLocale('zh-CN');
        await wrapper.vm.$nextTick();
        expect(storage.getItem('chatprism:workspace-locale')).toBe('zh-CN');
        expect(wrapper.text()).toBe('zh-CN');

        await wrapper.get('[data-testid="locale-toggle"]').trigger('click');
        expect(storage.getItem('chatprism:workspace-locale')).toBe('en');
        expect(wrapper.text()).toBe('en');

        wrapper.unmount();
    });

    it('falls back to the provided English text when a translation key is missing', () => {
        expect(resolveWorkspaceText('missing.translation.key', 'English fallback')).toBe('English fallback');
        expect(resolveWorkspaceText('shared.cancel', 'English fallback')).toBe('Cancel');
    });
});
