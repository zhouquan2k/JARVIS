export interface BrowserAutomationCookie {
    value?: string;
}

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

export interface BrowserAutomationCapability {
    fetch(input: BrowserAutomationFetchRequest): Promise<BrowserAutomationFetchResponse>;
    getCookie(providerId: string, options: { url: string; name: string }): Promise<BrowserAutomationCookie | null>;
}
