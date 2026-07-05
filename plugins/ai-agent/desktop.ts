import { DEFAULT_GEMINI_HISTORY_PAGE_URL } from '@packages/core/config';
import { CONTROLLED_PAGE_BRIDGE_KEYS } from './preload';

export interface DesktopControlledPageConfig {
    preloadPath?: string;
    bridgeKey?: string;
}

export interface DesktopProviderLoginConfig {
    title: string;
    targetUrl: string;
    completionCheck?: {
        intervalMs?: number;
        script: string;
    };
}

const GEMINI_LOGIN_COMPLETION_SCRIPT = `
    (() => {
        const loginGate = document.querySelector('a[href*="ServiceLogin"], form[action*="ServiceLogin"]');
        const authenticatedScaffold = document.querySelector([
            'conversations-list[data-test-id="all-conversations"]',
            'nav[aria-label="Chat history"]',
            '[data-test-id="conversation-list"]',
            'a[data-test-id="conversation"]',
            'a[href*="/app/"]'
        ].join(', '));
        const href = window.location.href;
        const pathname = window.location.pathname;
        const hostname = window.location.hostname;
        return hostname === 'gemini.google.com'
            && !/signin|login/i.test(pathname)
            && !loginGate
            && !!authenticatedScaffold;
    })()
`;

const PROVIDER_LOGIN_CONFIGS = new Map<string, DesktopProviderLoginConfig>([
    ['chatgpt-web', {
        title: '登录 ChatGPT',
        targetUrl: 'https://chatgpt.com/'
    }],
    ['gemini-web', {
        title: '登录 Gemini',
        targetUrl: DEFAULT_GEMINI_HISTORY_PAGE_URL,
        completionCheck: {
            intervalMs: 1500,
            script: GEMINI_LOGIN_COMPLETION_SCRIPT
        }
    }]
]);

export function resolveDesktopProviderLoginConfig(providerId: string): DesktopProviderLoginConfig | undefined {
    return PROVIDER_LOGIN_CONFIGS.get(providerId);
}

export function buildDesktopControlledPageRegistry(preloadPath: string): Record<string, DesktopControlledPageConfig> {
    return {
        'gemini-web': {
            preloadPath,
            bridgeKey: CONTROLLED_PAGE_BRIDGE_KEYS.geminiHistory
        },
        'chatgpt-dom': {
            preloadPath,
            bridgeKey: CONTROLLED_PAGE_BRIDGE_KEYS.chatgptDom
        },
        'gemini-dom': {
            preloadPath,
            bridgeKey: CONTROLLED_PAGE_BRIDGE_KEYS.geminiDom
        },
        'gemini-dom-summary': {
            preloadPath,
            bridgeKey: CONTROLLED_PAGE_BRIDGE_KEYS.geminiDom
        },
        'claude-dom': {
            preloadPath,
            bridgeKey: CONTROLLED_PAGE_BRIDGE_KEYS.claudeDom
        }
    };
}
