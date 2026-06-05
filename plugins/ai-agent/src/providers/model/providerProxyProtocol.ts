import type {
    AgentModelTurn,
    AgentRunRequest,
    AgentToolCall,
    AgentToolExchange,
    AgentToolResult,
    AnalysisResult,
    Conversation,
    ConversationHistorySummary,
    ExternalHistoryErrorCode,
    ExternalHistoryProviderId,
    HistoryListQueryOptions,
    ProviderDocumentCapability,
    ProviderSendResult,
    ProviderStreamUpdate,
    SendMessageOptions
} from '../../interfaces';
import type { ProviderModelCatalog } from '@packages/core/config';

export type ProxyAction =
    | 'CHECK_AUTH'
    | 'GET_DOCUMENT_CAPABILITY'
    | 'GENERATE_CONVERSATION_TITLE'
    | 'SEND_MESSAGE'
    | 'RUN_AGENT'
    | 'ANALYZE_COMPARISON'
    | 'GET_AVAILABLE_MODELS'
    | 'GET_HISTORY_LIST'
    | 'GET_HISTORY_DETAIL'
    | 'ABORT';

export type { AgentRunRequest, AgentToolCall, AgentToolExchange, AgentToolResult, AgentModelTurn };

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

export interface GetDocumentCapabilityRequest extends ProxyRequestBase {
    action: 'GET_DOCUMENT_CAPABILITY';
    providerId: string;
}

export interface GenerateConversationTitleRequest extends ProxyRequestBase {
    action: 'GENERATE_CONVERSATION_TITLE';
    providerId: string;
    prompt: string;
    maxLength?: number;
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

export interface RunAgentRequest extends ProxyRequestBase {
    action: 'RUN_AGENT';
    providerId: string;
    agentRequest: AgentRunRequest;
}

export interface AbortRequest extends ProxyRequestBase {
    action: 'ABORT';
    targetRequestId?: string;
}

export interface GetHistoryListRequest extends ProxyRequestBase {
    action: 'GET_HISTORY_LIST';
    providerId: string;
    query?: HistoryListQueryOptions['query'];
}

export interface GetHistoryDetailRequest extends ProxyRequestBase {
    action: 'GET_HISTORY_DETAIL';
    providerId: string;
    externalId: string;
}

export type ProxyRequest =
    | CheckAuthRequest
    | GetDocumentCapabilityRequest
    | GenerateConversationTitleRequest
    | SendMessageRequest
    | RunAgentRequest
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
        | ProviderDocumentCapability
        | string
        | ConversationHistorySummary[]
        | Conversation
        | null;
}

export interface ErrorResponse extends ProxyResponseBase {
    type: 'ERROR';
    error: string;
    historyErrorCode?: ExternalHistoryErrorCode;
    historyProviderId?: ExternalHistoryProviderId;
}

export type ProxyResponse = AuthResultResponse | UpdateResponse | DoneResponse | ErrorResponse;
