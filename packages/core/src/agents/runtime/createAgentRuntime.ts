import { prepareRequestWithActiveDocument } from '../augmentPromptWithAgentContext';
import { createBuiltinWorkspaceToolDefinitions } from '../tools/builtinWorkspaceTools';
import { createAgentToolExecutor } from '../tools/createAgentToolExecutor';
import type {
    AgentRunRequest,
    AgentToolCall,
    AgentToolExchange,
    AgentToolResult,
    IAgentCapableProvider
} from '../../interfaces/IAgentCapableProvider';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate } from '../../interfaces/IModelProvider';
import type { ProviderRuntime } from '../../runtime/providerRuntime.types';
import type { AgentRuntime, AgentRuntimeRequest } from './types';

export interface CreateAgentRuntimeOptions {
    providerRuntime: ProviderRuntime;
    maxToolIterations?: number;
}

function isAgentCapableProvider(provider: IModelProvider): provider is IAgentCapableProvider {
    return typeof (provider as Partial<IAgentCapableProvider>).getAgentCapabilities === 'function'
        && typeof (provider as Partial<IAgentCapableProvider>).runAgent === 'function';
}

function createAbortError() {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}

function joinAgentTexts(segments: string[]): string {
    return segments
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .join('\n\n');
}

function formatAgentTraceValue(value: unknown): string {
    if (typeof value === 'string') {
        try {
            return JSON.stringify(JSON.parse(value), null, 2);
        } catch {
            return value;
        }
    }

    return JSON.stringify(value, null, 2);
}

function renderAgentToolExchange(call: AgentToolCall, result: AgentToolResult): string {
    return [
        'Function Call Request',
        '```json',
        formatAgentTraceValue({
            id: call.id,
            name: call.name,
            arguments: call.arguments || {}
        }),
        '```',
        '',
        'Function Call Response',
        '```json',
        formatAgentTraceValue({
            toolCallId: result.toolCallId,
            name: result.name,
            result: result.result,
            isError: result.isError === true
        }),
        '```'
    ].join('\n');
}

function renderAgentToolRound(toolExchanges: Array<{ call: AgentToolCall; result: AgentToolResult }>): string {
    const total = toolExchanges.length;
    const heading = `### 本轮工具调用（${total} 个函数调用）`;

    return [
        heading,
        ...toolExchanges.flatMap((exchange, index) => {
            return [
                '',
                `#### 调用 ${index + 1}: \`${exchange.call.name}\``,
                renderAgentToolExchange(exchange.call, exchange.result)
            ];
        })
    ].join('\n');
}

async function runNativeAgentLoop(
    provider: IAgentCapableProvider,
    request: AgentRuntimeRequest,
    onUpdate: (update: ProviderStreamUpdate) => void,
    shouldAbort: () => boolean,
    maxToolIterations: number,
    executeTool: (call: AgentToolCall, request: AgentRuntimeRequest) => Promise<AgentToolResult>
): Promise<ProviderSendResult> {
    const agent = request.agent;
    if (!agent) {
        throw new Error('Native agent execution requires an active agent context.');
    }

    const toolExchanges: AgentToolExchange[] = [];
    const completedTexts: string[] = [];
    let conversationId = request.context?.conversationId;
    const resolvedTools = agent.tools?.length
        ? createAgentToolExecutor(createBuiltinWorkspaceToolDefinitions()).getDeclarations(agent.tools)
        : [];

    for (let iteration = 0; iteration <= maxToolIterations; iteration += 1) {
        if (shouldAbort()) {
            throw createAbortError();
        }

        let iterationText = '';
        const result = await provider.runAgent(
            {
                prompt: request.prompt,
                agent,
                context: {
                    ...request.context,
                    conversationId
                },
                modelId: request.modelId,
                attachments: request.attachments,
                history: request.history,
                modelOptions: request.modelOptions,
                tools: resolvedTools,
                toolExchanges
            } satisfies AgentRunRequest,
            (update) => {
                iterationText = update.text;
                onUpdate({
                    ...update,
                    text: joinAgentTexts([...completedTexts, update.text])
                });
            }
        );

        conversationId = result.conversationId;

        if (!result.toolCalls?.length) {
            const finalText = joinAgentTexts([...completedTexts, result.text || iterationText]);
            return {
                ...result,
                text: finalText
            };
        }

        if (iteration === maxToolIterations) {
            throw new Error(`Agent tool loop exceeded the iteration limit (${maxToolIterations}).`);
        }

        const nextToolResults = await Promise.all(result.toolCalls.map((call) => executeTool(call, request)));
        const nextToolExchanges = result.toolCalls.map((call, index) => ({
            modelTurn: result.modelTurn || {
                role: 'model',
                parts: [
                    {
                        text: result.text
                    }
                ]
            },
            call,
            result: nextToolResults[index]
        }));
        const stepText = joinAgentTexts([
            result.text || iterationText,
            renderAgentToolRound(nextToolExchanges)
        ]);
        if (stepText.trim().length > 0) {
            completedTexts.push(stepText);
            onUpdate({ text: joinAgentTexts(completedTexts) });
        }
        toolExchanges.push(...nextToolExchanges);
    }

    throw new Error('Agent tool loop terminated unexpectedly.');
}

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntime {
    const maxToolIterations = options.maxToolIterations ?? 4;
    const toolExecutor = createAgentToolExecutor(createBuiltinWorkspaceToolDefinitions());
    let activeProvider: IModelProvider | null = null;
    let abortRequested = false;

    return {
        async run(request, onUpdate) {
            abortRequested = false;

            const providerId = request.agent?.modelProviderName?.trim() || request.providerId;
            if (!providerId) {
                throw new Error('No active model provider selected.');
            }

            const provider = options.providerRuntime.getProvider(providerId);
            activeProvider = provider;
            const preparedRequest = request.agent
                ? await prepareRequestWithActiveDocument(
                    provider,
                    request.prompt,
                    {
                        activeDocument: request.workspace?.activeDocument ?? null,
                        attachments: request.attachments
                    }
                )
                : {
                    prompt: request.prompt,
                    attachments: request.attachments || [],
                    mode: 'none' as const
                };

            try {
                if (request.agent && isAgentCapableProvider(provider) && provider.getAgentCapabilities().nativeAgent) {
                    const result = await runNativeAgentLoop(
                        provider,
                        {
                            ...request,
                            prompt: preparedRequest.prompt,
                            attachments: preparedRequest.attachments
                        },
                        onUpdate,
                        () => abortRequested,
                        maxToolIterations,
                        async (call, currentRequest) => {
                            if (!currentRequest.agent) {
                                throw new Error('Native agent execution requires an active agent context.');
                            }

                            return toolExecutor.execute(call, {
                                agent: currentRequest.agent,
                                activePath: currentRequest.workspace?.activePath ?? null,
                                contextProvider: currentRequest.workspace?.contextProvider ?? null,
                                onFileChanged: currentRequest.workspace?.onFileChanged
                            });
                        }
                    );
                    return {
                        ...result,
                        requestSnapshot: {
                            prompt: preparedRequest.prompt,
                            attachments: preparedRequest.attachments.map((attachment) => ({ ...attachment })),
                            activeDocumentMode: preparedRequest.mode
                        }
                    };
                }

                if (abortRequested) {
                    throw createAbortError();
                }

                const result = await provider.sendMessage(
                    preparedRequest.prompt,
                    {
                        context: request.context,
                        modelId: request.modelId,
                        attachments: preparedRequest.attachments,
                        history: request.history,
                        modelOptions: request.modelOptions
                    },
                    onUpdate
                );
                return {
                    ...result,
                    requestSnapshot: {
                        prompt: preparedRequest.prompt,
                        attachments: preparedRequest.attachments.map((attachment) => ({ ...attachment })),
                        activeDocumentMode: preparedRequest.mode
                    }
                };
            } finally {
                activeProvider = null;
            }
        },

        abort() {
            abortRequested = true;
            activeProvider?.abort();
        }
    };
}
