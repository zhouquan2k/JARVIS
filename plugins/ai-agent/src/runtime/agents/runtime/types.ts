import type { ResolvedAgentConfig, ContextDocument, IContextProvider, MessageAttachment } from '@plugins/ai-agent/src/internal';
import type {
    ProviderContextMessage,
    ProviderSendResult,
    ProviderStreamUpdate,
    ReasoningEffort
} from '@plugins/ai-agent/src/internal';

export interface AgentRuntimeRequest {
    prompt: string;
    agent: ResolvedAgentConfig | null;
    workspace?: {
        activePath: string | null;
        activeDocument?: ContextDocument | null;
        contextProvider: IContextProvider | null;
        onFileChanged?: (change: {
            path: string;
            beforeContent: string;
            afterContent: string;
            alreadyPersisted?: boolean;
        }) => Promise<void> | void;
    };
    providerId?: string;
    modelId?: string;
    attachments?: MessageAttachment[];
    history?: ProviderContextMessage[];
    modelOptions?: Record<string, boolean>;
    reasoningEffort?: ReasoningEffort;
    context?: { parentMessageId?: string, conversationId?: string };
}

export interface AgentRuntime {
    run(
        request: AgentRuntimeRequest,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult>;
    abort(): void;
}
