// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createBuiltinWorkspaceToolDefinitions, type ResolvedAgentConfig } from '@packages/core/src';
import type { ProviderConfig } from '@packages/core/config';
import AgentView from './AgentView.vue';

const agent: ResolvedAgentConfig = {
    name: 'Archive Agent',
    description: 'Handle archive docs',
    instructions: 'Use archive context',
    effectiveInstructions: 'Use archive context',
    modelProviderName: 'gemini-api',
    modelName: 'gemini-2.5-flash',
    tools: [
        { id: 'read_file' },
        { id: 'search_in_scope' }
    ],
    scopePath: '/workspace/archive',
    sourcePaths: ['/workspace/.agent.json', '/workspace/archive/.agent.json']
};

const providers: ProviderConfig[] = [
    {
        id: 'gemini-api',
        name: 'Gemini API',
        defaultModel: 'gemini-2.5-flash',
        supportedRuntimeModes: ['web'],
        models: [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        defaultModel: 'gpt-5.4',
        supportedRuntimeModes: ['web'],
        models: [
            { id: 'gpt-5.4', name: 'GPT-5.4' }
        ]
    }
];

function mountAgentView(extraProps = {}) {
    return mount(AgentView, {
        props: {
            agentKey: '/workspace/archive/.agent.json',
            agent,
            ownerNode: {
                path: '/workspace/archive',
                name: 'archive',
                kind: 'directory',
                agentKey: '/workspace/archive/.agent.json',
                isAgentOwner: true
            },
            providers,
            builtinTools: createBuiltinWorkspaceToolDefinitions(),
            modelLoadStates: {
                'gemini-api': { loaded: true },
                openai: { loaded: true }
            },
            ...extraProps
        },
        global: {
            stubs: {
                DocumentEditorPane: {
                    props: ['activePath', 'activeDocument', 'activeViewerId', 'activePaneMode', 'modelValue', 'isSaving', 'isDirty'],
                    template: `
                      <div
                        data-testid="agent-view-index-editor"
                        :data-active-path="activePath ?? ''"
                        :data-viewer-id="activeViewerId ?? ''"
                        :data-pane-mode="activePaneMode"
                        :data-model-value="modelValue"
                        :data-is-saving="isSaving === true"
                        :data-is-dirty="isDirty === true"
                      >
                        <button data-testid="agent-view-index-update" @click="$emit('update:modelValue', '# Updated Index\\n')" />
                        <button data-testid="agent-view-index-save" @click="$emit('save')" />
                        <button data-testid="agent-view-index-open-link" @click="$emit('open-document-link', '/workspace/archive/guide.md')" />
                      </div>
                    `
                }
            }
        }
    });
}

describe('AgentView', () => {
    it('renders agent metadata and keeps the editor in the top collapsed area', async () => {
        const wrapper = mountAgentView();
        expect(wrapper.get('[data-testid="agent-view"]').text()).toContain('Archive Agent');
        expect(wrapper.get('[data-testid="agent-view-model"]').text()).toContain('gemini-api / gemini-2.5-flash');
        expect(wrapper.find('[data-testid="agent-view-index"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="agent-view-document"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="agent-view-conversation"]').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('Local conversations');
        expect(wrapper.text()).not.toContain('Documents');
        expect(wrapper.text()).not.toContain('2024年');
        expect(wrapper.text()).not.toContain('2026年');
        expect(wrapper.find('[data-testid="agent-view-prompt"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="agent-view-instructions"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="agent-view-instructions-toggle"]').attributes('aria-expanded')).toBe('false');

        await wrapper.get('[data-testid="agent-view-instructions-toggle"]').trigger('click');

        expect(wrapper.get('[data-testid="agent-view-description"]').exists()).toBe(true);
        expect((wrapper.get('[data-testid="agent-view-description"]').element as HTMLTextAreaElement).value).toBe('Handle archive docs');
        expect(wrapper.get('[data-testid="agent-view-tool-read_file"]').element).toBeDefined();
        expect((wrapper.get('[data-testid="agent-view-tool-read_file"]').element as HTMLInputElement).checked).toBe(true);
        expect((wrapper.get('[data-testid="agent-view-tool-search_in_scope"]').element as HTMLInputElement).checked).toBe(true);
        expect(wrapper.get('[data-testid="agent-view-prompt"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-view-instructions"]').text()).toContain('Use archive context');
        expect(wrapper.get('[data-testid="agent-view-instructions-toggle"]').attributes('aria-expanded')).toBe('true');
    });

    it('renders owner index with the shared document editor when present', () => {
        const wrapper = mountAgentView({
            indexPath: '/workspace/archive/index.md',
            indexDocument: {
                path: '/workspace/archive/index.md',
                mimeType: 'text/markdown',
                dataBase64: Buffer.from('# Archive Index\n\nOwner notes here.\n', 'utf8').toString('base64')
            },
            indexViewerId: 'text',
            indexPaneMode: 'viewer',
            indexDraftContent: '# Archive Index\n\nOwner notes here.\n',
            indexIsDirty: true
        });

        expect(wrapper.get('[data-testid="agent-view-index-editor"]').attributes('data-active-path')).toBe('/workspace/archive/index.md');
        expect(wrapper.get('[data-testid="agent-view-index-editor"]').attributes('data-viewer-id')).toBe('text');
        expect(wrapper.get('[data-testid="agent-view-index-editor"]').attributes('data-model-value')).toContain('Archive Index');
        expect(wrapper.get('[data-testid="agent-view-index-editor"]').attributes('data-is-dirty')).toBe('true');
    });

    it('forwards index document edit and save events', async () => {
        const wrapper = mountAgentView({
            indexPath: '/workspace/archive/index.md',
            indexDocument: {
                path: '/workspace/archive/index.md',
                mimeType: 'text/markdown',
                dataBase64: Buffer.from('# Archive Index\n', 'utf8').toString('base64')
            },
            indexViewerId: 'text',
            indexPaneMode: 'viewer',
            indexDraftContent: '# Archive Index\n'
        });

        await wrapper.get('[data-testid="agent-view-index-update"]').trigger('click');
        await wrapper.get('[data-testid="agent-view-index-save"]').trigger('click');

        expect(wrapper.emitted('update-index-content')).toEqual([
            ['# Updated Index\n']
        ]);
        expect(wrapper.emitted('save-index-document')).toEqual([
            []
        ]);
    });

    it('forwards index document markdown link navigation events', async () => {
        const wrapper = mountAgentView({
            indexPath: '/workspace/archive/index.md',
            indexDocument: {
                path: '/workspace/archive/index.md',
                mimeType: 'text/markdown',
                dataBase64: Buffer.from('# Archive Index\n', 'utf8').toString('base64')
            },
            indexViewerId: 'text',
            indexPaneMode: 'viewer',
            indexDraftContent: '# Archive Index\n'
        });

        await wrapper.get('[data-testid="agent-view-index-open-link"]').trigger('click');

        expect(wrapper.emitted('open-document-link')).toEqual([
            ['/workspace/archive/guide.md']
        ]);
    });

    it('edits description, prompt, provider, model and tools before emitting a save payload', async () => {
        const wrapper = mountAgentView();

        await wrapper.get('[data-testid="agent-view-instructions-toggle"]').trigger('click');
        await wrapper.get('[data-testid="agent-view-description"]').setValue('Updated archive description');
        await wrapper.get('[data-testid="agent-view-prompt"]').setValue('Use updated archive rules');
        await wrapper.get('[data-testid="agent-view-provider"]').setValue('openai');
        await wrapper.get('[data-testid="agent-view-model-select"]').setValue('gpt-5.4');
        await wrapper.get('[data-testid="agent-view-inheritance"]').setValue('override');
        await wrapper.get('[data-testid="agent-view-tool-search_in_scope"]').setValue(false);
        await wrapper.get('[data-testid="agent-view-tool-write_file"]').setValue(true);

        expect(wrapper.find('[data-testid="agent-view-dirty"]').exists()).toBe(true);
        await wrapper.get('[data-testid="agent-view-save"]').trigger('click');

        expect(wrapper.emitted('save-agent-config')).toEqual([
            [{
                description: 'Updated archive description',
                instructions: 'Use updated archive rules',
                modelProviderName: 'openai',
                modelName: 'gpt-5.4',
                inheritance: 'override',
                tools: [
                    { id: 'read_file', description: 'Read a file by path from the current knowledge workspace scope.' },
                    { id: 'write_file', description: 'Create or overwrite a whole file in the workspace scope.' }
                ]
            }]
        ]);
    });

    it('shows inherited tools in read-only mode when the tools inheritance switch is enabled', async () => {
        const wrapper = mountAgentView();

        await wrapper.get('[data-testid="agent-view-instructions-toggle"]').trigger('click');
        await wrapper.get('[data-testid="agent-view-tools-inherit"]').setValue(true);

        expect(wrapper.get('[data-testid="agent-view-tools-readonly"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-view-tools-readonly"]').text()).toContain('Read a file by path from the current knowledge workspace scope.');
        expect(wrapper.get('[data-testid="agent-view-tools-readonly"]').text()).toContain('Search text matches inside the current agent scope.');
        expect(wrapper.find('[data-testid="agent-view-tools-editable"]').exists()).toBe(false);

        await wrapper.get('[data-testid="agent-view-save"]').trigger('click');

        expect(wrapper.emitted('save-agent-config')).toEqual([
            [{
                inheritTools: true
            }]
        ]);
    });

    it('shows only direct instructions in the editor while keeping inherited instructions resolved', async () => {
        const wrapper = mountAgentView({
            agent: {
                ...agent,
                instructions: 'Child direct prompt',
                effectiveInstructions: 'Parent inherited prompt\n\nChild direct prompt'
            }
        });

        await wrapper.get('[data-testid="agent-view-instructions-toggle"]').trigger('click');

        expect((wrapper.get('[data-testid="agent-view-prompt"]').element as HTMLTextAreaElement).value).toBe('Child direct prompt');
        expect(wrapper.get('[data-testid="agent-view-instructions"]').text()).toContain('Parent inherited prompt');
        expect(wrapper.get('[data-testid="agent-view-instructions"]').text()).toContain('Child direct prompt');
    });

    it('requests provider models when selecting a provider without a loaded catalog', async () => {
        const wrapper = mountAgentView({
            modelLoadStates: {
                'gemini-api': { loaded: true },
                openai: { loaded: false }
            }
        });

        await wrapper.get('[data-testid="agent-view-instructions-toggle"]').trigger('click');
        await wrapper.get('[data-testid="agent-view-provider"]').setValue('openai');

        expect(wrapper.emitted('load-provider-models')).toEqual([
            ['openai']
        ]);
    });
});
