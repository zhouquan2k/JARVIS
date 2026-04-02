import {
    ExternalHistoryError,
    type ExternalHistoryErrorCode
} from '../../../interfaces/IHistoryProvider';
import type { GeminiHistoryRemoteConfig as GeminiHistoryRemoteConfigShape } from '../../../interfaces/ProviderRemoteConfig';

export type GeminiContentAction = 'PING' | 'GET_HISTORY_LIST' | 'GET_HISTORY_DETAIL';

export interface GeminiContentHistorySummary {
    id: string;
    title: string;
    updatedAt: number;
}

export interface GeminiContentConversationDetail {
    id: string;
    title: string;
    updatedAt: number;
    messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
    }>;
}

export interface GeminiContentRequest {
    action: GeminiContentAction;
    config: GeminiHistoryRemoteConfigShape;
    externalId?: string;
    query?: string;
}

export type GeminiContentResponse =
    | {
        ok: true;
        data: GeminiContentHistorySummary[] | GeminiContentConversationDetail | { ready: true };
    }
    | {
        ok: false;
        error: {
            code: ExternalHistoryErrorCode;
            message: string;
        };
    };

export function assertGeminiContentResponse<T>(response: GeminiContentResponse | undefined): T {
    if (!response) {
        throw new ExternalHistoryError('TAB_UNAVAILABLE', 'Gemini content script 未响应。', {
            providerId: 'gemini-web'
        });
    }

    if (!response.ok) {
        throw new ExternalHistoryError(response.error.code, response.error.message, {
            providerId: 'gemini-web'
        });
    }

    return response.data as T;
}
