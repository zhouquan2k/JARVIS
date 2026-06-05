export type {
    ContextDocument,
    ContextNode,
    FolderMetadata,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    MoveContextNodeInput,
    RenameContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '@packages/core/src';

export type {
    AgentConfig,
    AgentSkillBinding,
    AgentToolBinding,
    Conversation,
    ResolvedAgentConfig
} from '@plugins/ai-agent/api';

import type { IContextProvider } from '@packages/core/src';
import type { IConversationQueryProvider } from '@plugins/ai-agent/api';

/**
 * 服务端使用的上下文 provider 类型：在 core 的通用 IContextProvider 之上，
 * 叠加 ai-agent 的会话查询能力（getConversations）。
 */
export type ContextProvider = IContextProvider & IConversationQueryProvider;
