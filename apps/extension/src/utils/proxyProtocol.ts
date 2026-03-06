import type { AnalysisResult } from '@packages/core/src';

export type ProxyAction = 'CHECK_AUTH' | 'SEND_MESSAGE' | 'ANALYZE_COMPARISON' | 'ABORT';

export interface ProviderSendOptions {
    context?: { parentMessageId?: string; conversationId?: string };
    modelId?: string;
}

export interface ProxyRequestBase {
    action: ProxyAction;
    requestId: string;
    channelId: string;
}

export interface CheckAuthRequest extends ProxyRequestBase {
    action: 'CHECK_AUTH';
    providerId: string;
}

export interface SendMessageRequest extends ProxyRequestBase {
    action: 'SEND_MESSAGE';
    providerId: string;
    prompt: string;
    options?: ProviderSendOptions;
}

export interface AnalyzeComparisonRequest extends ProxyRequestBase {
    action: 'ANALYZE_COMPARISON';
    prompt: string;
    outputA: string;
    outputB: string;
    analyzerProviderId?: string;
    analyzerModelId?: string;
}

export interface AbortRequest extends ProxyRequestBase {
    action: 'ABORT';
    targetRequestId?: string;
}

export type ProxyRequest =
    | CheckAuthRequest
    | SendMessageRequest
    | AnalyzeComparisonRequest
    | AbortRequest;

export interface ProxyResponseBase {
    requestId: string;
    channelId: string;
}

export interface AuthResultResponse extends ProxyResponseBase {
    type: 'AUTH_RESULT';
    isAuth: boolean;
}

export interface UpdateResponse extends ProxyResponseBase {
    type: 'UPDATE';
    chunk: string;
}

export interface DoneResponse extends ProxyResponseBase {
    type: 'DONE';
    result:
        | { text: string; conversationId: string; messageId: string }
        | AnalysisResult
        | null;
}

export interface ErrorResponse extends ProxyResponseBase {
    type: 'ERROR';
    error: string;
}

export type ProxyResponse = AuthResultResponse | UpdateResponse | DoneResponse | ErrorResponse;
