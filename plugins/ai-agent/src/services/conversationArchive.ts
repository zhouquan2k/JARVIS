import type { ConversationMessage, IModelProvider, ReasoningEffort } from '@plugins/ai-agent/src/internal';

export type ArchiveExecutionResult = {
    originalQ: string;
    originalA: string;
    nextQ: string;
    nextA: string;
    nextDocument: string;
    changed: boolean;
    insertedDivider: boolean;
};

export type ArchiveConversationInput = {
    provider: IModelProvider;
    modelId: string;
    modelOptions?: Record<string, boolean>;
    reasoningEffort?: ReasoningEffort;
    documentMarkdown: string;
    messages: ConversationMessage[];
};

type ArchiveSections = {
    q: string;
    a: string;
    divider: string;
    inserted: boolean;
};

type ArchivePayload = {
    q: string;
    a: string;
};

const MARKDOWN_DIVIDER_PATTERN = /^\s{0,3}\*(?:\s*\*){2,}\s*$/u;

function normalizeSection(value: string): string {
    return value.replace(/\r\n/g, '\n').trim();
}

function normalizeDocument(value: string): string {
    return value.replace(/\r\n/g, '\n').trim();
}

function findArchiveDividerLine(lines: string[]): { index: number; divider: string } | null {
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!MARKDOWN_DIVIDER_PATTERN.test(line)) {
            continue;
        }

        return {
            index,
            divider: line.trim()
        };
    }

    return null;
}

function buildConversationTranscript(messages: ConversationMessage[]): string {
    const visibleMessages = messages.filter((message) => message.deleted !== true);
    if (visibleMessages.length === 0) {
        return '[NO_MESSAGES]';
    }

    return visibleMessages.map((message) => {
        const role = message.role.toUpperCase();
        const content = (message.content || message.requestSnapshot?.prompt || '').trim();
        return `[${role}]\n${content || '[EMPTY]'}`;
    }).join('\n\n');
}

function buildArchivePrompt(input: {
    originalQ: string;
    originalA: string;
    transcript: string;
}): string {
    return [
        'You are merging an agent conversation into a Markdown Q/A document.',
        'Return JSON only with exactly two string fields: "q" and "a".',
        'Rules:',
        '- Merge user messages into q and assistant messages into a.',
        '- Preserve valid existing facts from the original sections.',
        '- Deduplicate overlapping content and keep the latest effective content when older content is superseded.',
        '- Keep the result concise and structured Markdown.',
        '- Do not include the top-level divider in either field.',
        '- Do not wrap the JSON in Markdown fences.',
        '',
        'Original Q section:',
        '<Q>',
        input.originalQ || '[EMPTY]',
        '</Q>',
        '',
        'Original A section:',
        '<A>',
        input.originalA || '[EMPTY]',
        '</A>',
        '',
        'Visible conversation transcript:',
        '<TRANSCRIPT>',
        input.transcript,
        '</TRANSCRIPT>'
    ].join('\n');
}

function parseArchivePayload(rawText: string): ArchivePayload {
    const trimmed = rawText.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
    const candidate = fencedMatch?.[1]?.trim() || trimmed;
    let parsed: unknown;

    try {
        parsed = JSON.parse(candidate);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse archive response: ${reason}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Failed to parse archive response: expected a JSON object.');
    }

    const q = typeof (parsed as { q?: unknown }).q === 'string'
        ? (parsed as { q: string }).q
        : '';
    const a = typeof (parsed as { a?: unknown }).a === 'string'
        ? (parsed as { a: string }).a
        : '';

    return {
        q: normalizeSection(q),
        a: normalizeSection(a)
    };
}

function composeDocument(q: string, divider: string, a: string): string {
    return [normalizeSection(q), divider, normalizeSection(a)].join('\n\n').trim();
}

export function splitQaDocument(markdown: string): ArchiveSections {
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n');
    const lines = normalizedMarkdown.split('\n');
    const dividerMatch = findArchiveDividerLine(lines);

    if (!dividerMatch) {
        return {
            q: normalizeSection(normalizedMarkdown),
            a: '',
            divider: '***',
            inserted: true
        };
    }

    return {
        q: normalizeSection(lines.slice(0, dividerMatch.index).join('\n')),
        a: normalizeSection(lines.slice(dividerMatch.index + 1).join('\n')),
        divider: dividerMatch.divider,
        inserted: false
    };
}

export async function executeConversationArchive(
    input: ArchiveConversationInput
): Promise<ArchiveExecutionResult> {
    const sections = splitQaDocument(input.documentMarkdown);
    const transcript = buildConversationTranscript(input.messages);
    const prompt = buildArchivePrompt({
        originalQ: sections.q,
        originalA: sections.a,
        transcript
    });
    const response = await input.provider.sendMessage(
        prompt,
        {
            modelId: input.modelId,
            modelOptions: input.modelOptions,
            reasoningEffort: input.reasoningEffort
        },
        () => undefined
    );
    const payload = parseArchivePayload(response.text);
    const nextDocument = composeDocument(payload.q, sections.divider, payload.a);

    return {
        originalQ: sections.q,
        originalA: sections.a,
        nextQ: payload.q,
        nextA: payload.a,
        nextDocument,
        changed: normalizeDocument(nextDocument) !== normalizeDocument(input.documentMarkdown),
        insertedDivider: sections.inserted
    };
}
