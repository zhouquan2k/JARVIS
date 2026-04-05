import type { ResolvedAgentConfig } from './IAgentConfig';
import type { AgentToolDeclaration } from '../agents/tools/types';
import type {
    IModelProvider,
    ProviderContextMessage,
    ProviderSendResult,
    ProviderStreamUpdate
} from './IModelProvider';
import type { MessageAttachment } from './Conversation';

export interface AgentCapabilities {
    nativeAgent: true;
    toolLoop: 'application-managed';
}

export interface AgentToolCall {
    id: string;
    name: string;
    arguments?: Record<string, unknown> | string;
}

export interface AgentResponsePart {
    text?: string;
    thoughtSignature?: string;
    functionCall?: {
        id?: string;
        name: string;
        args: Record<string, unknown> | string;
    };
}

export interface AgentModelTurn {
    role: 'model';
    parts: AgentResponsePart[];
}

export interface AgentToolResult {
    toolCallId: string;
    name: string;
    result: string;
    isError?: boolean;
}

export interface AgentToolExchange {
    modelTurn: AgentModelTurn;
    call: AgentToolCall;
    result: AgentToolResult;
}

export interface AgentRunRequest {
    prompt: string;
    agent: ResolvedAgentConfig;
    tools?: AgentToolDeclaration[];
    context?: { parentMessageId?: string, conversationId?: string };
    modelId?: string;
    attachments?: MessageAttachment[];
    history?: ProviderContextMessage[];
    modelOptions?: Record<string, boolean>;
    toolExchanges?: AgentToolExchange[];
}

export interface IAgentCapableProvider extends IModelProvider {
    getAgentCapabilities(): AgentCapabilities;
    runAgent(
        request: AgentRunRequest,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult>;
}
