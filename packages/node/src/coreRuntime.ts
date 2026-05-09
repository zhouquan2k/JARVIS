import * as agentConfigRuntime from '../../core/src/agents/config/resolveScopedAgentConfig.ts';

export type {
    ContextDocument,
    ContextNode,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
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
} from '../../core/src/interfaces/IAgentConfig.ts';

const agentConfigModule = agentConfigRuntime as typeof import('../../core/src/agents/config/resolveScopedAgentConfig.ts') & {
    'module.exports'?: typeof import('../../core/src/agents/config/resolveScopedAgentConfig.ts');
};
const agentConfigExports = 'DEFAULT_SCOPED_AGENT_CONFIG' in agentConfigModule
    ? agentConfigModule
    : agentConfigModule['module.exports'] ?? agentConfigModule;

export const {
    DEFAULT_SCOPED_AGENT_CONFIG,
    createResolvedAgentConfig,
    resolveChildAgentConfig
} = agentConfigExports;
