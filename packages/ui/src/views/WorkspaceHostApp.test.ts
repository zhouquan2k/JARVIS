// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WorkspaceHostApp from './WorkspaceHostApp.vue';
import { useChatStore } from '../store/chat';
import { useCompareStore } from '../store/compare';

describe('WorkspaceHostApp', () => {
    it('resets the chat workspace state before navigating to another workspace', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo,
                contextProvider: { id: 'ctx' }
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<button data-testid="go-knowledge" @click="$emit(\'navigate-workspace\', \'/\')">go</button>'
                    },
                    ConversationWorkspaceView: {
                        template: '<div data-testid="conversation-workspace-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="go-knowledge"]').trigger('click');

        expect(chatStore.currentConversation).toBeNull();
        expect(navigateTo).toHaveBeenCalledWith('/');
    });

    it('does not reset when navigating to the current workspace', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const resetSpy = vi.spyOn(chatStore, 'resetWorkspaceConversationState');
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/chat',
                navigateTo,
                contextProvider: { id: 'ctx' }
            },
            global: {
                stubs: {
                    AppTopBar: {
                        template: '<button data-testid="go-chat" @click="$emit(\'navigate-workspace\', \'/chat\')">go</button>'
                    },
                    ConversationWorkspaceView: {
                        template: '<div data-testid="conversation-workspace-stub" />'
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="go-chat"]').trigger('click');

        expect(resetSpy).not.toHaveBeenCalled();
        expect(navigateTo).toHaveBeenCalledWith('/chat');
    });

    it('maps compare route to chat in the top bar and forwards recovery props', async () => {
        setActivePinia(createPinia());
        const compareStore = useCompareStore();
        compareStore.stage = 'analyzing';
        const navigateTo = vi.fn();
        const wrapper = mount(WorkspaceHostApp, {
            props: {
                currentRoutePath: '/compare',
                navigateTo,
                contextProvider: { id: 'ctx' },
                showHistorySourceSwitch: true,
                authStatusOverride: false,
                authUnavailableMessage: 'auth-msg',
                authRecoveryActionLabel: 'login',
                authRecoveryActionDisabled: true,
                hostRecoveryMessage: 'host-msg',
                hostRecoveryActionLabel: 'host-login',
                hostRecoveryActionDisabled: true
            },
            global: {
                stubs: {
                    AppTopBar: {
                        props: ['activeWorkspacePath', 'isCompareMode', 'compareStage'],
                        template: '<div data-testid="topbar-stub" :data-path="activeWorkspacePath" :data-compare="String(isCompareMode)" :data-stage="compareStage" />'
                    },
                    ConversationWorkspaceView: {
                        props: ['showHistorySourceSwitch', 'authStatusOverride', 'authUnavailableMessage', 'authRecoveryActionLabel', 'authRecoveryActionDisabled', 'hostRecoveryMessage', 'hostRecoveryActionLabel', 'hostRecoveryActionDisabled'],
                        template: `
                          <div
                            data-testid="conversation-workspace-stub"
                            :data-switch="String(showHistorySourceSwitch)"
                            :data-auth-status="authStatusOverride === null ? 'null' : String(authStatusOverride)"
                            :data-auth-message="authUnavailableMessage || ''"
                            :data-auth-label="authRecoveryActionLabel || ''"
                            :data-auth-disabled="String(authRecoveryActionDisabled)"
                            :data-host-message="hostRecoveryMessage || ''"
                            :data-host-label="hostRecoveryActionLabel || ''"
                            :data-host-disabled="String(hostRecoveryActionDisabled)"
                          />
                        `
                    },
                    DocumentWorkspaceView: {
                        template: '<div data-testid="document-workspace-stub" />'
                    }
                }
            }
        });

        await flushPromises();

        expect(wrapper.get('[data-testid="topbar-stub"]').attributes('data-path')).toBe('/chat');
        expect(wrapper.get('[data-testid="topbar-stub"]').attributes('data-compare')).toBe('true');
        expect(wrapper.get('[data-testid="topbar-stub"]').attributes('data-stage')).toBe('analyzing');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-switch')).toBe('true');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-auth-status')).toBe('false');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-auth-message')).toBe('auth-msg');
        expect(wrapper.get('[data-testid="conversation-workspace-stub"]').attributes('data-host-message')).toBe('host-msg');
    });
});
