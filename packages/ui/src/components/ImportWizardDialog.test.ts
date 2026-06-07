// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ImportWizardDialog from './ImportWizardDialog.vue';

const formStub = {
    props: ['modelValue', 'languageModels', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <div data-testid="source-form-stub">
        <span data-testid="source-form-model-count">{{ languageModels.length }}</span>
        <button type="button" data-testid="source-form-update" @click="$emit('update:modelValue', { url: 'https://www.bilibili.com/video/BV1xx411c7mD' })">
          update
        </button>
      </div>
    `
};

describe('ImportWizardDialog', () => {
    it('lists sources, renders the selected form, and passes execution input through', async () => {
        const runImport = vi.fn(async ({ onStageChange }) => {
            onStageChange({ key: 'fetch', label: 'Fetch transcript', status: 'running' });
            onStageChange({ key: 'fetch', label: 'Fetch transcript', status: 'completed' });
        });

        const wrapper = mount(ImportWizardDialog, {
            props: {
                sources: [{
                    id: 'bilibili',
                    title: 'Bilibili',
                    formComponent: formStub,
                    createInitialParams: () => ({ url: '' }),
                    async run() {
                        return {
                            primaryDocumentPath: '/notes/video.md',
                            createdPaths: ['/notes/video.md']
                        };
                    }
                }],
                languageModels: [{
                    id: 'mock-model',
                    generateText: vi.fn(async () => 'summary')
                }],
                directories: [
                    { path: '/', label: 'Root' },
                    { path: '/notes', label: '/notes' }
                ],
                initialTargetParentPath: '/notes',
                runImport
            }
        });

        expect(wrapper.get('[data-testid="import-source-bilibili"]').text()).toContain('Bilibili');
        await wrapper.get('[data-testid="import-wizard-next"]').trigger('click');
        expect(wrapper.get('[data-testid="import-step-configure"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="source-form-model-count"]').text()).toBe('1');

        await wrapper.get('[data-testid="source-form-update"]').trigger('click');
        await wrapper.get('[data-testid="import-target-directory"]').setValue('/');
        await wrapper.get('[data-testid="import-wizard-next"]').trigger('click');
        await flushPromises();

        expect(runImport).toHaveBeenCalledWith(expect.objectContaining({
            targetParentPath: '/',
            params: { url: 'https://www.bilibili.com/video/BV1xx411c7mD' }
        }));
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('stays open and shows the failing stage message when execution fails', async () => {
        const runImport = vi.fn(async ({ onStageChange }) => {
            onStageChange({ key: 'fetch', label: 'Fetch transcript', status: 'failed', detail: 'yt-dlp missing subtitles' });
            throw new Error('Fetch transcript failed');
        });

        const wrapper = mount(ImportWizardDialog, {
            props: {
                sources: [{
                    id: 'bilibili',
                    title: 'Bilibili',
                    formComponent: formStub,
                    createInitialParams: () => ({ url: '' }),
                    async run() {
                        return {
                            primaryDocumentPath: '/notes/video.md',
                            createdPaths: ['/notes/video.md']
                        };
                    }
                }],
                languageModels: [],
                directories: [{ path: '/', label: 'Root' }],
                initialTargetParentPath: '/',
                runImport
            }
        });

        await wrapper.get('[data-testid="import-wizard-next"]').trigger('click');
        await wrapper.get('[data-testid="import-wizard-next"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="import-step-execute"]').text()).toContain('Fetch transcript');
        expect(wrapper.get('[data-testid="import-stage-error"]').text()).toContain('Fetch transcript failed');
        expect(wrapper.emitted('close')).toBeUndefined();
    });
});
