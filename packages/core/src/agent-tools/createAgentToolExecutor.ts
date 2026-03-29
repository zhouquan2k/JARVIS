import type { AgentToolBinding } from '../interfaces/IAgentConfig';
import type { AgentToolCall, AgentToolResult } from '../interfaces/IAgentCapableProvider';
import type { AgentToolDeclaration, AgentToolDefinition, AgentToolExecutionContext, AgentToolExecutor } from './types';

function buildErrorResult(call: AgentToolCall, error: unknown): AgentToolResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
        toolCallId: call.id,
        name: call.name,
        isError: true,
        result: JSON.stringify({
            ok: false,
            error: message
        })
    };
}

function normalizeResult(call: AgentToolCall, value: unknown): AgentToolResult {
    return {
        toolCallId: call.id,
        name: call.name,
        result: typeof value === 'string' ? value : JSON.stringify(value)
    };
}

function parseArguments(call: AgentToolCall): Record<string, unknown> {
    if (call.arguments === undefined) {
        return {};
    }

    if (typeof call.arguments === 'string') {
        const trimmed = call.arguments.trim();
        if (!trimmed) {
            return {};
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            throw new Error(`Tool '${call.name}' received invalid JSON arguments.`);
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`Tool '${call.name}' arguments must be a JSON object.`);
        }

        return parsed as Record<string, unknown>;
    }

    if (!call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) {
        throw new Error(`Tool '${call.name}' arguments must be an object.`);
    }

    return call.arguments;
}

function buildDeclaration(binding: AgentToolBinding, definition: AgentToolDefinition): AgentToolDeclaration {
    return {
        id: definition.id,
        description: binding.description?.trim() || definition.description,
        inputSchema: definition.inputSchema
    };
}

export function createAgentToolExecutor(definitions: AgentToolDefinition[] = []): AgentToolExecutor {
    const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));

    return {
        getDeclarations(bindings = []) {
            return bindings.flatMap((binding) => {
                const definition = definitionMap.get(binding.id);
                return definition ? [buildDeclaration(binding, definition)] : [];
            });
        },

        async execute(call: AgentToolCall, context: AgentToolExecutionContext): Promise<AgentToolResult> {
            const definition = definitionMap.get(call.name);
            if (!definition) {
                return buildErrorResult(call, new Error(`Tool '${call.name}' is not declared by the current runtime.`));
            }

            try {
                const result = await definition.execute(parseArguments(call), context);
                return normalizeResult(call, result);
            } catch (error) {
                return buildErrorResult(call, error);
            }
        }
    };
}
