export const DESKTOP_BROWSER_AUTOMATION_FETCH_CHANNEL = 'desktop:browser-automation:fetch';
export const DESKTOP_BROWSER_AUTOMATION_GET_COOKIE_CHANNEL = 'desktop:browser-automation:get-cookie';

export interface BrowserAutomationFetchRequest {
    providerId: string;
    input: string;
    init?: RequestInit;
}

export interface BrowserAutomationFetchResponse {
    status: number;
    statusText: string;
    headers: Array<[string, string]>;
    bodyText: string;
}

export interface BrowserAutomationCookieRequest {
    providerId: string;
    url: string;
    name: string;
}
