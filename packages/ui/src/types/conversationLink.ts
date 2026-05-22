export interface MarkdownConversationLinkTarget {
    conversationId: string;
}

export interface LinkableConversationEntry {
    conversationId: string;
    title: string;
}

export interface OpenConversationRequest {
    conversationId: string;
    nonce: number;
}
