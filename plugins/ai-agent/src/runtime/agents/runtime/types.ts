import type { ResolvedAgentConfig, ContextDocument, IContextProvider, MessageAttachment } from '@plugins/ai-agent/src/internal';
import type { GroupMember } from '@plugins/ai-agent/src/group/groupTypes';
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
    /** group provider 专用：本轮参与的成员列表（由顶部勾选区决定）。透传给 group provider，避免回退默认预设。 */
    groupMembers?: GroupMember[];
    /** group provider 专用：providerId → 站点会话 URL 映射，透传给 group provider 用于重启后恢复各成员/总结器对话。 */
    groupMemberSessions?: Record<string, string>;
    context?: { parentMessageId?: string, conversationId?: string };
}

export interface AgentRuntime {
    run(
        request: AgentRuntimeRequest,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult>;
    abort(): void;
}
