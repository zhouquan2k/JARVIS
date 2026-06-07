// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BilibiliImportForm from './components/BilibiliImportForm.vue';
import { createBilibiliImportPlugin } from './manifest';

function createHostApiStub() {
    return {
        createDocument: vi.fn(async () => undefined),
        createReferenceResource: vi.fn(async (_ownerDocumentPath: string, filename: string) => ({
            resourcePath: `/notes/references/${filename}`,
            relativePathFromOwner: `references/${filename}`
        })),
        openDocument: vi.fn(async () => undefined),
        report: vi.fn(),
        setStage: vi.fn()
    };
}

function resolveDocumentImport(options: {
    languageModels?: Array<{ id: string; generateText: (prompt: string, options?: { system?: string; signal?: AbortSignal }) => Promise<string> }>;
    contextBaseUrl?: string;
} = {}) {
    let registeredContribution: any = null;
    createBilibiliImportPlugin({
        contextBaseUrl: options.contextBaseUrl ?? 'http://127.0.0.1:8787'
    }).setup({
        registerDocumentImport(contribution) {
            registeredContribution = contribution;
        },
        registerGlobalView() {},
        registerRightPanelTab() {},
        registerWorkspaceSelectionView() {},
        registerInsertLinkType() {},
        registerLanguageModel() {},
        registerNodePresentation() {},
        getContributionQuery() {
            return {
                getGlobalViews: () => [],
                getRightPanelTabs: () => [],
                getWorkspaceSelectionViews: () => [],
                getInsertLinkTypes: () => [],
                getDocumentImports: () => [],
                getLanguageModels: () => options.languageModels ?? [],
                getNodePresentations: () => []
            };
        },
        getRuntimeContext() {
            return {} as any;
        },
        getHostContext() {
            return {} as any;
        }
    });

    if (!registeredContribution) {
        throw new Error('Document import contribution was not registered.');
    }

    return registeredContribution;
}

describe('createBilibiliImportPlugin', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes a transcript-only document when summary generation is disabled', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                title: '  Video Title  ',
                transcript: 'Line 1\nLine 2'
            })
        }));
        vi.stubGlobal('fetch', fetchMock);

        const contribution = resolveDocumentImport({
            contextBaseUrl: 'http://127.0.0.1:8787/api/context'
        });
        const hostApi = createHostApiStub();
        const result = await contribution.run({
            params: {
                url: 'https://www.bilibili.com/video/BV1xx411c7mD',
                title: '',
                includeSummary: false
            },
            targetParentPath: '/notes',
            hostApi
        });

        expect(hostApi.createDocument).toHaveBeenCalledWith(
            '/notes/Video-Title.md',
            expect.stringContaining('## Transcript')
        );
        expect(fetchMock).toHaveBeenCalledWith(
            'http://127.0.0.1:8787/api/import/bilibili',
            expect.objectContaining({
                method: 'POST'
            })
        );
        expect(hostApi.createReferenceResource).not.toHaveBeenCalled();
        expect(result).toEqual({
            primaryDocumentPath: '/notes/Video-Title.md',
            createdPaths: ['/notes/Video-Title.md']
        });
    });

    it('writes a summary document plus transcript resource when summary generation is enabled', async () => {
        const generateText = vi.fn(async () => '总结内容');
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                title: 'Video Title',
                transcript: 'Transcript body'
            })
        })));

        const contribution = resolveDocumentImport({
            languageModels: [{
                id: 'mock-model',
                generateText
            }]
        });
        const hostApi = createHostApiStub();
        const result = await contribution.run({
            params: {
                url: 'https://www.bilibili.com/video/BV1xx411c7mD',
                title: 'Custom Summary Title',
                includeSummary: true
            },
            targetParentPath: '/notes',
            hostApi
        });

        expect(generateText).toHaveBeenCalledWith(
            expect.stringContaining('视频标题：Custom Summary Title'),
            expect.objectContaining({
                system: '你是一个帮助整理知识工作区内容的总结助手。'
            })
        );
        expect(hostApi.createReferenceResource).toHaveBeenCalledWith(
            '/notes/Custom-Summary-Title.md',
            'Custom-Summary-Title-transcript.md',
            expect.stringContaining('## Transcript')
        );
        expect(hostApi.createDocument).toHaveBeenCalledWith(
            '/notes/Custom-Summary-Title.md',
            expect.stringContaining('- [Transcript](references/Custom-Summary-Title-transcript.md)')
        );
        expect(result).toEqual({
            primaryDocumentPath: '/notes/Custom-Summary-Title.md',
            createdPaths: [
                '/notes/Custom-Summary-Title.md',
                '/notes/references/Custom-Summary-Title-transcript.md'
            ]
        });
    });

    it('fails early when summary generation is requested without an available language model', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                title: 'Video Title',
                transcript: 'Transcript body'
            })
        })));

        const contribution = resolveDocumentImport();
        const hostApi = createHostApiStub();

        await expect(contribution.run({
            params: {
                url: 'https://www.bilibili.com/video/BV1xx411c7mD',
                title: '',
                includeSummary: true
            },
            targetParentPath: '/notes',
            hostApi
        })).rejects.toThrow('当前没有可用的大模型能力，无法生成总结稿。');
    });

    it('marks the current stage as failed when transcript fetching fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: false,
            json: async () => ({
                error: 'yt-dlp missing subtitles'
            })
        })));

        const contribution = resolveDocumentImport();
        const hostApi = createHostApiStub();

        await expect(contribution.run({
            params: {
                url: 'https://www.bilibili.com/video/BV1xx411c7mD',
                title: '',
                includeSummary: false
            },
            targetParentPath: '/notes',
            hostApi
        })).rejects.toThrow('yt-dlp missing subtitles');

        expect(hostApi.setStage).toHaveBeenNthCalledWith(1, {
            key: 'fetch-transcript',
            label: '抓取文字稿',
            status: 'running'
        });
        expect(hostApi.setStage).toHaveBeenNthCalledWith(2, {
            key: 'fetch-transcript',
            label: '抓取文字稿',
            status: 'failed',
            detail: 'yt-dlp missing subtitles'
        });
    });
});

describe('BilibiliImportForm', () => {
    it('disables summary generation when no language model contribution is available', () => {
        const wrapper = mount(BilibiliImportForm, {
            props: {
                modelValue: {
                    url: '',
                    title: '',
                    includeSummary: false
                },
                languageModels: []
            }
        });

        expect(wrapper.get('[data-testid="bilibili-import-summary"]').attributes('disabled')).toBeDefined();
        expect(wrapper.get('[data-testid="bilibili-import-summary-disabled"]').text()).toContain('需启用提供大模型能力的插件');
    });
});
