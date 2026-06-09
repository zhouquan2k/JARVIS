export interface OpenControlledPageInput {
    providerId: string;
    targetUrl?: string;
    /**
     * 仅当受控页当前为空白（尚未加载任何页面，如全新窗口/about:blank）时才导航到该 URL。
     * 用于"显示窗口"动作：全新窗口导航到站点（便于登录/查看），已有真实会话时只显示不重载。
     */
    targetUrlIfBlank?: string;
    visible?: boolean;
    forceReload?: boolean;
}

export interface EvaluateInPageInput extends OpenControlledPageInput {
    script: string;
}

export interface ControlledPageEvent {
    providerId: string;
    requestId: string;
    type: 'chunk' | 'done' | 'error';
    text?: string;
    message?: string;
}

export interface ControlledPageCapability {
    openControlledPage(input: OpenControlledPageInput): Promise<void>;
    evaluateInPage<T = unknown>(input: EvaluateInPageInput): Promise<T>;
    subscribeControlledPageEvent(
        providerId: string,
        listener: (event: ControlledPageEvent) => void
    ): () => void;
}
