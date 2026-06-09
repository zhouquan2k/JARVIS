export const DESKTOP_CONTROLLED_PAGE_OPEN_CHANNEL = 'desktop:controlled-page:open';
export const DESKTOP_CONTROLLED_PAGE_EVALUATE_CHANNEL = 'desktop:controlled-page:evaluate';
export const DESKTOP_CONTROLLED_PAGE_DOM_EVENT_FROM_PAGE_CHANNEL = 'desktop:controlled-page:dom-event-from-page';
export const DESKTOP_CONTROLLED_PAGE_DOM_EVENT_TO_RENDERER_CHANNEL = 'desktop:controlled-page:dom-event-to-renderer';

export interface OpenControlledPageRequest {
    providerId: string;
    targetUrl?: string;
    targetUrlIfBlank?: string;
    visible?: boolean;
    forceReload?: boolean;
}

export interface EvaluateInControlledPageRequest extends OpenControlledPageRequest {
    script: string;
}

export interface ControlledPageDomEvent {
    providerId: string;
    requestId: string;
    type: 'chunk' | 'done' | 'error';
    text?: string;
    message?: string;
}
