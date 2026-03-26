import type {
    AnalysisResult,
    Conversation,
    ConversationHistorySummary,
    ProviderSendResult,
    ProviderStreamUpdate,
    SendMessageOptions
} from '@packages/core/src';
import type { ProviderModelCatalog } from '@packages/core/config';

export const DESKTOP_PROXY_REQUEST_CHANNEL = 'chatprism:desktop-proxy:request';
export const DESKTOP_PROXY_RESPONSE_CHANNEL = 'chatprism:desktop-proxy:response';

export type ProxyAction =
    | 'CHECK_AUTH'
    | 'SEND_MESSAGE'
    | 'ANALYZE_COMPARISON'
    | 'GET_AVAILABLE_MODELS'
    | 'GET_HISTORY_LIST'
    | 'GET_HISTORY_DETAIL'
    | 'ABORT';

export type ProviderSendOptions = SendMessageOptions;

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

export interface GetAvailableModelsRequest extends ProxyRequestBase {
    action: 'GET_AVAILABLE_MODELS';
    providerId: string;
}

export interface AbortRequest extends ProxyRequestBase {
    action: 'ABORT';
    targetRequestId?: string;
}

export interface GetHistoryListRequest extends ProxyRequestBase {
    action: 'GET_HISTORY_LIST';
    providerId: string;
}

export interface GetHistoryDetailRequest extends ProxyRequestBase {
    action: 'GET_HISTORY_DETAIL';
    providerId: string;
    externalId: string;
}

export type ProxyRequest =
    | CheckAuthRequest
    | SendMessageRequest
    | AnalyzeComparisonRequest
    | GetAvailableModelsRequest
    | GetHistoryListRequest
    | GetHistoryDetailRequest
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
    chunk: ProviderStreamUpdate | string;
}

export interface DoneResponse extends ProxyResponseBase {
    type: 'DONE';
    result:
        | ProviderSendResult
        | AnalysisResult
        | ProviderModelCatalog
        | ConversationHistorySummary[]
        | Conversation
        | null;
}

export interface ErrorResponse extends ProxyResponseBase {
    type: 'ERROR';
    error: string;
}

export type ProxyResponse = AuthResultResponse | UpdateResponse | DoneResponse | ErrorResponse;
