import type { AgentSkillBinding, AgentToolBinding, ResolvedAgentConfig } from '../interfaces/IAgentConfig';

type AgentBinding = AgentToolBinding | AgentSkillBinding;

function formatBindings(bindings?: AgentBinding[]): string {
    if (!bindings || bindings.length === 0) {
        return '- none declared';
    }

    return bindings
        .map((binding) => binding.description ? `- ${binding.id}: ${binding.description}` : `- ${binding.id}`)
        .join('\n');
}

export function buildAgentPromptEnvelope(agent: ResolvedAgentConfig, prompt: string): string {
    const description = agent.description?.trim() || 'No description provided.';
    const instructions = agent.effectiveInstructions.trim() || 'No additional instructions.';
    const modelProvider = agent.modelProviderName?.trim() || 'inherit-current-selection';
    const modelName = agent.modelName?.trim() || 'inherit-current-selection';
    const sourcePaths = agent.sourcePaths.length > 0
        ? agent.sourcePaths.map((sourcePath) => `- ${sourcePath}`).join('\n')
        : '- fallback default agent';

    return [
        '[[Scoped Agent Context]]',
        `Name: ${agent.name}`,
        `Description: ${description}`,
        `Scope Path: ${agent.scopePath}`,
        `Model Provider: ${modelProvider}`,
        `Model Name: ${modelName}`,
        'Source Paths:',
        sourcePaths,
        'Effective Instructions:',
        instructions,
        'Allowed Tools:',
        formatBindings(agent.tools),
        'Allowed Skills:',
        formatBindings(agent.skills),
        'Behavior Rules:',
        '- Follow the effective instructions and respect the current scope.',
        '- Do not claim or use tools/skills that are not listed above.',
        '',
        '[[User Prompt]]',
        prompt
    ].join('\n');
}
