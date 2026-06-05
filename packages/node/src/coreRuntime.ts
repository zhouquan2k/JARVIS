import * as agentConfigRuntime from '../../../plugins/ai-agent/src/runtime/agents/config/resolveScopedAgentConfig.ts';

export type {
    ContextDocument,
    ContextNode,
    FolderMetadata,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
    MoveContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '../../core/src/interfaces/IContextProvider.ts';

export type {
    AgentConfig,
    AgentInheritanceMode,
    AgentSkillBinding,
    AgentToolBinding,
    ResolvedAgentConfig
} from '@plugins/ai-agent/api';

const agentConfigModule = agentConfigRuntime as typeof import('../../../plugins/ai-agent/src/runtime/agents/config/resolveScopedAgentConfig.ts') & {
    'module.exports'?: typeof import('../../../plugins/ai-agent/src/runtime/agents/config/resolveScopedAgentConfig.ts');
};
const agentConfigExports = 'DEFAULT_SCOPED_AGENT_CONFIG' in agentConfigModule
    ? agentConfigModule
    : agentConfigModule['module.exports'] ?? agentConfigModule;

export const {
    DEFAULT_SCOPED_AGENT_CONFIG,
    createResolvedAgentConfig,
    resolveChildAgentConfig
} = agentConfigExports;
