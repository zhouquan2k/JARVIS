export interface OpenControlledPageInput {
    providerId: string;
    targetUrl?: string;
    visible?: boolean;
    forceReload?: boolean;
}

export interface EvaluateInPageInput extends OpenControlledPageInput {
    script: string;
}

export interface ControlledPageCapability {
    openControlledPage(input: OpenControlledPageInput): Promise<void>;
    evaluateInPage<T = unknown>(input: EvaluateInPageInput): Promise<T>;
}
