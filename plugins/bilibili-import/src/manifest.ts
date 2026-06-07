import type {
    DocumentImportContribution,
    LanguageModelContribution,
    PluginManifest
} from '@packages/core';
import BilibiliImportForm, { type BilibiliImportParams } from './components/BilibiliImportForm.vue';

function normalizeBaseUrl(baseUrl: string | undefined): string {
    const trimmed = baseUrl?.trim();
    if (!trimmed) {
        return '';
    }

    const normalized = trimmed.replace(/\/+$/u, '');
    return normalized.endsWith('/api/context')
        ? normalized.slice(0, -'/api/context'.length)
        : normalized;
}

function buildImportEndpoint(baseUrl: string | undefined): string {
    return `${normalizeBaseUrl(baseUrl)}/api/import/bilibili`;
}

function normalizeFileStem(value: string): string {
    const trimmed = value.trim() || 'bilibili-import';
    return trimmed
        .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .replace(/ /gu, '-');
}

function buildTranscriptMarkdown(title: string, url: string, transcript: string): string {
    return [`# ${title}`, '', `> Source: ${url}`, '', '## Transcript', '', transcript].join('\n');
}

function buildSummaryPrompt(title: string, transcript: string): string {
    return [
        `视频标题：${title}`,
        '',
        '请基于以下视频文字稿生成一份结构化中文总结，要求：',
        '1. 先给出 3-5 条核心要点',
        '2. 再给出分段总结',
        '3. 保持忠于原文，不要虚构事实',
        '',
        transcript
    ].join('\n');
}

function buildSummaryMarkdown(title: string, url: string, summary: string, transcriptLink: string): string {
    return [
        `# ${title}`,
        '',
        `> Source: ${url}`,
        '',
        '## Summary',
        '',
        summary,
        '',
        '## References',
        '',
        `- [Transcript](${transcriptLink})`
    ].join('\n');
}

async function runStage<T>(
    hostApi: {
        setStage(stage: {
            key: string;
            label: string;
            status: 'running' | 'completed' | 'failed';
            detail?: string;
        }): void;
    },
    stage: {
        key: string;
        label: string;
    },
    run: () => Promise<T> | T
): Promise<T> {
    hostApi.setStage({
        key: stage.key,
        label: stage.label,
        status: 'running'
    });

    try {
        const result = await run();
        hostApi.setStage({
            key: stage.key,
            label: stage.label,
            status: 'completed'
        });
        return result;
    } catch (error) {
        hostApi.setStage({
            key: stage.key,
            label: stage.label,
            status: 'failed',
            detail: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

async function fetchTranscript(endpoint: string, url: string, signal?: AbortSignal): Promise<{ title: string; transcript: string }> {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({ url }),
        signal
    });
    const payload = await response.json() as { title?: string; transcript?: string; error?: string };
    if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch Bilibili transcript.');
    }
    if (typeof payload.title !== 'string' || typeof payload.transcript !== 'string') {
        throw new Error('Bilibili transcript response was malformed.');
    }
    return {
        title: payload.title,
        transcript: payload.transcript
    };
}

export function createBilibiliImportPlugin(options: { contextBaseUrl?: string } = {}): PluginManifest {
    const endpoint = buildImportEndpoint(options.contextBaseUrl);

    return {
        id: 'bilibili-import',
        name: 'Bilibili Import',
        version: '1.0.0',
        defaultEnabled: true,
        setup(api) {
            const contributionQuery = api.getContributionQuery();
            const contribution: DocumentImportContribution<BilibiliImportParams> = {
                id: 'bilibili-video',
                title: 'Bilibili video',
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="33" y1="32" x2="20" y2="10" stroke="#fb7299" stroke-width="7" stroke-linecap="round"/><line x1="67" y1="32" x2="80" y2="10" stroke="#fb7299" stroke-width="7" stroke-linecap="round"/><rect x="6" y="30" width="88" height="60" rx="14" fill="#fb7299"/><rect x="16" y="42" width="68" height="38" rx="8" fill="white" opacity="0.92"/></svg>`,
                formComponent: BilibiliImportForm,
                order: 10,
                createInitialParams() {
                    return {
                        url: '',
                        title: '',
                        includeSummary: false
                    };
                },
                async run(input) {
                    const normalizedUrl = input.params.url.trim();
                    if (!/^https?:\/\/(?:www\.)?bilibili\.com\/video\/[^/?#]+/iu.test(normalizedUrl)) {
                        throw new Error('请输入有效的 Bilibili 视频链接。');
                    }

                    const transcriptPayload = await runStage(input.hostApi, {
                        key: 'fetch-transcript',
                        label: '抓取文字稿'
                    }, () => fetchTranscript(endpoint, normalizedUrl, input.signal));

                    const resolvedTitle = input.params.title.trim() || transcriptPayload.title.trim() || 'bilibili-import';
                    const transcriptMarkdown = await runStage(input.hostApi, {
                        key: 'prepare-transcript',
                        label: '整理文字稿'
                    }, () => buildTranscriptMarkdown(resolvedTitle, normalizedUrl, transcriptPayload.transcript));

                    let summaryText: string | null = null;
                    if (input.params.includeSummary) {
                        const languageModel = contributionQuery.getLanguageModels()[0] as LanguageModelContribution | undefined;
                        if (!languageModel) {
                            throw new Error('当前没有可用的大模型能力，无法生成总结稿。');
                        }

                        summaryText = (await runStage(input.hostApi, {
                            key: 'generate-summary',
                            label: '生成总结'
                        }, () => languageModel.generateText(buildSummaryPrompt(resolvedTitle, transcriptPayload.transcript), {
                            system: '你是一个帮助整理知识工作区内容的总结助手。',
                            signal: input.signal
                        }))).trim();
                    }

                    const fileStem = normalizeFileStem(resolvedTitle);
                    const documentPath = `${input.targetParentPath === '/' ? '' : input.targetParentPath}/${fileStem}.md` || `/${fileStem}.md`;

                    return runStage(input.hostApi, {
                        key: 'write-documents',
                        label: '写入文档'
                    }, async () => {
                        if (!summaryText) {
                            await input.hostApi.createDocument(documentPath, transcriptMarkdown);
                            return {
                                primaryDocumentPath: documentPath,
                                createdPaths: [documentPath]
                            };
                        }

                        const transcriptResource = await input.hostApi.createReferenceResource(
                            documentPath,
                            `${fileStem}-transcript.md`,
                            transcriptMarkdown
                        );
                        await input.hostApi.createDocument(
                            documentPath,
                            buildSummaryMarkdown(resolvedTitle, normalizedUrl, summaryText, transcriptResource.relativePathFromOwner)
                        );
                        return {
                            primaryDocumentPath: documentPath,
                            createdPaths: [documentPath, transcriptResource.resourcePath]
                        };
                    });
                }
            };

            api.registerDocumentImport(contribution);
        }
    };
}
