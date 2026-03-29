import type { AgentToolBinding, ResolvedAgentConfig } from '../interfaces/IAgentConfig';
import type { AgentToolCall, AgentToolResult } from '../interfaces/IAgentCapableProvider';
import type { IContextProvider } from '../interfaces/IContextProvider';

export interface AgentToolDeclaration {
    id: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface AgentToolExecutionContext {
    agent: ResolvedAgentConfig;
    activePath: string | null;
    contextProvider: IContextProvider | null;
    onFileChanged?: (change: {
        path: string;
        beforeContent: string;
        afterContent: string;
    }) => Promise<void> | void;
}

export interface AgentToolDefinition<TArgs = Record<string, unknown>, TResult = unknown> {
    id: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute(args: TArgs, context: AgentToolExecutionContext): Promise<TResult> | TResult;
}

export interface AgentToolExecutor {
    getDeclarations(bindings?: AgentToolBinding[]): AgentToolDeclaration[];
    execute(call: AgentToolCall, context: AgentToolExecutionContext): Promise<AgentToolResult>;
}
