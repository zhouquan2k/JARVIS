import { spawn } from 'node:child_process';
import {
    type AgentRunRequest,
    type AgentToolCall,
    type ProviderModelCatalog,
    type ProviderSendResult,
    type SendMessageOptions
} from '@packages/core';

export interface CodexCliServiceOptions {
    command?: string;
    cwd?: string;
    spawnImpl?: (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess;
}

type SpawnOptions = {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: ['ignore', 'pipe', 'pipe'];
};

type SpawnedProcess = {
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    on(event: 'error', listener: (error: Error) => void): SpawnedProcess;
    on(event: 'close', listener: (code: number | null) => void): SpawnedProcess;
};

const defaultSpawnImpl = (command: string, args: readonly string[], options: SpawnOptions): SpawnedProcess => {
    return spawn(command, [...args], options) as unknown as SpawnedProcess;
};

export interface CodexChatRequest {
    prompt: string;
    options?: SendMessageOptions;
}

type CodexDebugModelRecord = {
    slug?: unknown;
    display_name?: unknown;
    supported_in_api?: unknown;
    visibility?: unknown;
    priority?: unknown;
};

type CodexDebugModelsResponse = {
    models?: CodexDebugModelRecord[];
};

export interface CodexCompletionEvent {
    type: 'message.completed';
    text: string;
    conversationId: string;
    messageId: string;
    toolCalls?: AgentToolCall[];
    modelTurn?: ProviderSendResult['modelTurn'];
    functionalParts?: ProviderSendResult['functionalParts'];
}

export type CodexStreamEvent =
    | {
        type: 'message.delta';
        delta: string;
    }
    | CodexCompletionEvent;

type CodexExecEventRecord = Record<string, unknown>;
const CODEX_DEFAULT_MODEL_IDS = new Set(['auto', 'codex']);
const CHATGPT_FIXED_MODEL_IDS = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'] as const;

function getStaticCodexCatalog(): ProviderModelCatalog {
    return {
        models: [
            {
                id: 'auto',
                name: 'Auto (Default)',
                options: [
                    {
                        key: 'web_search',
                        label: 'Web search',
                        type: 'boolean',
                        description: 'Allow Codex to use web search for fresh information.',
                        conflictsWith: ['deep_research'],
                        defaultValue: false
                    },
                    {
                        key: 'deep_research',
                        label: 'Deep Research',
                        type: 'boolean',
                        description: 'Switch to a heavier research-oriented Codex request.',
                        conflictsWith: ['web_search'],
                        defaultValue: false
                    }
                ]
            }
        ],
        defaultModel: 'auto'
    };
}

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
}

function extractRecord(value: unknown): CodexExecEventRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as CodexExecEventRecord;
}

function extractTextFromExecEvent(event: CodexExecEventRecord): string {
    const direct = [
        event.delta,
        event.text,
        event.message,
        (event.payload as CodexExecEventRecord | undefined)?.text,
        (event.payload as CodexExecEventRecord | undefined)?.delta
    ];
    for (const candidate of direct) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate;
        }
    }

    const item = extractRecord(event.item);
    const itemType = normalizeText(item?.type);
    if (itemType === 'agent_message') {
        const itemDirect = [
            item?.text,
            item?.message,
            extractRecord(item?.payload)?.text,
            extractRecord(item?.payload)?.delta
        ];
        for (const candidate of itemDirect) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate;
            }
        }

        const itemParts = extractStringArray(extractRecord(item?.payload)?.parts ?? item?.parts);
        return itemParts.join('');
    }

    const parts = extractStringArray((event.payload as CodexExecEventRecord | undefined)?.parts);
    return parts.join('');
}

function buildPrompt(prompt: string, options?: SendMessageOptions): string {
    const sections: string[] = [];

    if (options?.history?.length) {
        sections.push(
            'Conversation history:',
            ...options.history.map((message) => `[${message.role.toUpperCase()}]\n${message.content}`)
        );
    }

    sections.push(prompt);
    return sections.join('\n\n');
}

function buildAgentPrompt(request: AgentRunRequest): string {
    const sections = [
        `Agent: ${request.agent.name}`,
        request.agent.effectiveInstructions || request.agent.instructions || '',
        request.prompt
    ].filter(Boolean);
    return sections.join('\n\n');
}

function shouldPassModel(modelId: string | undefined): modelId is string {
    const normalized = modelId?.trim();
    return !!normalized && !CODEX_DEFAULT_MODEL_IDS.has(normalized);
}

function buildCodexModelOptions() {
    return getStaticCodexCatalog().models[0]?.options?.map((option) => ({
        ...option,
        conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
    })) || [];
}

function getChatgptAccountFixedCodexCatalog(): ProviderModelCatalog {
    const sharedOptions = buildCodexModelOptions();

    return {
        models: CHATGPT_FIXED_MODEL_IDS.map((id) => ({
            id,
            name: id,
            options: sharedOptions.map((option) => ({
                ...option,
                conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
            }))
        })),
        defaultModel: CHATGPT_FIXED_MODEL_IDS[0]
    };
}

function normalizeDebugModelsCatalog(payload: CodexDebugModelsResponse): ProviderModelCatalog | null {
    const models = (payload.models || [])
        .filter((model) => model.supported_in_api === true)
        .filter((model) => model.visibility === 'list' || model.visibility === 'hide')
        .map((model) => ({
            id: typeof model.slug === 'string' ? model.slug : '',
            name: typeof model.display_name === 'string' ? model.display_name : (typeof model.slug === 'string' ? model.slug : ''),
            priority: typeof model.priority === 'number' ? model.priority : Number.MAX_SAFE_INTEGER
        }))
        .filter((model) => !!model.id);

    if (models.length === 0) {
        return null;
    }

    const sortedModels = models.sort((a, b) => a.priority - b.priority);
    const sharedOptions = buildCodexModelOptions();
    return {
        models: sortedModels.map(({ id, name }) => ({
            id,
            name,
            options: sharedOptions.map((option) => ({
                ...option,
                conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
            }))
        })),
        defaultModel: sortedModels[0].id
    };
}

async function runExecStream(
    spawnImpl: (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess,
    command: string,
    args: string[],
    cwd: string,
    onEvent: (event: CodexStreamEvent) => void
): Promise<CodexCompletionEvent> {
    return new Promise((resolve, reject) => {
        const child = spawnImpl(command, args, {
            cwd,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdoutBuffer = '';
        let stderr = '';
        let aggregatedText = '';
        let finalEvent: CodexCompletionEvent | null = null;

        const flushLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{')) {
                return;
            }

            try {
                const parsed = JSON.parse(trimmed) as CodexExecEventRecord;
                const text = extractTextFromExecEvent(parsed);
                if (!text) {
                    return;
                }

                aggregatedText += text;
                onEvent({
                    type: 'message.delta',
                    delta: aggregatedText
                });
            } catch {
                // Ignore non-JSON lines from the CLI preamble.
            }
        };

        child.stdout.on('data', (chunk) => {
            stdoutBuffer += String(chunk);
            let newlineIndex = stdoutBuffer.indexOf('\n');
            while (newlineIndex >= 0) {
                const line = stdoutBuffer.slice(0, newlineIndex);
                stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
                flushLine(line);
                newlineIndex = stdoutBuffer.indexOf('\n');
            }
        });

        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });

        child.on('error', reject);
        child.on('close', (code: number | null) => {
            if (stdoutBuffer.trim()) {
                flushLine(stdoutBuffer);
            }

            if (code !== 0) {
                reject(new Error(stderr.trim() || `Codex exec failed with exit code ${code}`));
                return;
            }

            finalEvent = {
                type: 'message.completed',
                text: aggregatedText,
                conversationId: crypto.randomUUID(),
                messageId: crypto.randomUUID()
            };
            resolve(finalEvent);
        });
    });
}

export class CodexCliService {
    private readonly command: string;
    private readonly cwd: string;
    private readonly spawnImpl: (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess;

    constructor(options: CodexCliServiceOptions = {}) {
        this.command = options.command?.trim() || 'codex';
        this.cwd = options.cwd?.trim() || process.cwd();
        this.spawnImpl = options.spawnImpl ?? defaultSpawnImpl;
    }

    private async runCommand(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
        return await new Promise((resolve, reject) => {
            const child = this.spawnImpl(this.command, args, {
                cwd: this.cwd,
                env: process.env,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (chunk) => {
                stdout += String(chunk);
            });
            child.stderr.on('data', (chunk) => {
                stderr += String(chunk);
            });
            child.on('error', reject);
            child.on('close', (code: number | null) => {
                resolve({ code, stdout, stderr });
            });
        });
    }

    private async isLoggedInUsingChatgpt(): Promise<boolean> {
        const result = await this.runCommand(['login', 'status']);
        if (result.code !== 0) {
            return false;
        }

        const combinedOutput = `${result.stdout}\n${result.stderr}`;
        return combinedOutput.includes('Logged in using ChatGPT');
    }

    async getModelCatalog(): Promise<ProviderModelCatalog> {
        if (await this.isLoggedInUsingChatgpt()) {
            return getChatgptAccountFixedCodexCatalog();
        }

        const result = await this.runCommand(['debug', 'models']);

        if (result.code !== 0) {
            return getStaticCodexCatalog();
        }

        try {
            const payload = JSON.parse(result.stdout.trim()) as CodexDebugModelsResponse;
            return normalizeDebugModelsCatalog(payload) || getStaticCodexCatalog();
        } catch {
            return getStaticCodexCatalog();
        }
    }

    async runChat(
        request: CodexChatRequest,
        onEvent: (event: CodexStreamEvent) => void
    ): Promise<CodexCompletionEvent> {
        const modelId = request.options?.modelId?.trim();
        const args = ['exec', '--skip-git-repo-check', '--json'];
        if (shouldPassModel(modelId)) {
            args.push('--model', modelId);
        }
        args.push(buildPrompt(request.prompt, request.options));
        return runExecStream(this.spawnImpl, this.command, args, this.cwd, onEvent);
    }

    async runAgent(
        request: AgentRunRequest,
        onEvent: (event: CodexStreamEvent) => void
    ): Promise<CodexCompletionEvent> {
        const modelId = request.modelId?.trim() || request.agent.modelName?.trim();
        const args = ['exec', '--skip-git-repo-check', '--json'];
        if (shouldPassModel(modelId)) {
            args.push('--model', modelId);
        }
        args.push(buildAgentPrompt(request));
        return runExecStream(this.spawnImpl, this.command, args, this.cwd, onEvent);
    }
}
