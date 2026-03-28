export type AgentInheritanceMode = 'merge' | 'override';

export interface AgentToolBinding {
    id: string;
    description?: string;
}

export interface AgentSkillBinding {
    id: string;
    description?: string;
}

export interface AgentConfig {
    name: string;
    description?: string;
    instructions?: string;
    modelProviderName?: string;
    modelName?: string;
    tools?: AgentToolBinding[];
    skills?: AgentSkillBinding[];
    inheritance?: AgentInheritanceMode;
}

export interface ResolvedAgentConfig extends AgentConfig {
    scopePath: string;
    sourcePaths: string[];
    effectiveInstructions: string;
}
