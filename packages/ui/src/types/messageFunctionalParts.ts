export type WorkspaceMessageFunctionalPartKind = 'tool_call' | 'tool_result' | 'tool_exchange' | 'function_call' | 'search' | 'trace';

export interface WorkspaceMessageFunctionalPart {
    id: string;
    kind: WorkspaceMessageFunctionalPartKind;
    title: string;
    content: string;
    requestContent?: string;
    responseContent?: string;
    collapsed?: boolean;
    afterCharIndex?: number;
}
