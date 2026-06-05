export const DESKTOP_CONTROLLED_PAGE_OPEN_CHANNEL = 'desktop:controlled-page:open';
export const DESKTOP_CONTROLLED_PAGE_EVALUATE_CHANNEL = 'desktop:controlled-page:evaluate';

export interface OpenControlledPageRequest {
    providerId: string;
    targetUrl?: string;
    visible?: boolean;
    forceReload?: boolean;
}

export interface EvaluateInControlledPageRequest extends OpenControlledPageRequest {
    script: string;
}
