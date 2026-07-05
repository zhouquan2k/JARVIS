export const DESKTOP_FETCH_CHANNEL = 'chatprism:fetch';

export interface DesktopFetchRequest {
    input: string;
    init?: {
        method?: string;
        headers?: Array<[string, string]>;
        bodyText?: string;
    };
}

export interface DesktopFetchResponse {
    status: number;
    statusText: string;
    headers: Array<[string, string]>;
    bodyText: string;
    url: string;
}
