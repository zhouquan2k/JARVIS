import type { ResolvedAgentConfig } from '../../interfaces/IAgentConfig';
import type { ContextDocument, IContextProvider } from '../../interfaces/IContextProvider';
import type { MessageAttachment } from '../../interfaces/Conversation';
import type { ProviderContextMessage, ProviderSendResult, ProviderStreamUpdate } from '../../interfaces/IModelProvider';

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
        }) => Promise<void> | void;
    };
    providerId?: string;
    modelId?: string;
    attachments?: MessageAttachment[];
    history?: ProviderContextMessage[];
    modelOptions?: Record<string, boolean>;
    context?: { parentMessageId?: string, conversationId?: string };
}

export interface AgentRuntime {
    run(
        request: AgentRuntimeRequest,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult>;
    abort(): void;
}
