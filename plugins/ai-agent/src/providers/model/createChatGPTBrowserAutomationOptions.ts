import type { BrowserAutomationCapability } from '@plugins/ai-agent/src/internal';
import type { ChatGPTWebProviderOptions } from './providerHostTypes';

const DESKTOP_CHATGPT_USER_AGENT = 'ChatPrism Desktop Host';

export function createChatGPTBrowserAutomationOptions(
    browserAutomation: BrowserAutomationCapability,
    providerId = 'chatgpt-web'
): ChatGPTWebProviderOptions {
    return {
        requestClient: {
            async fetch(input: string, init?: RequestInit) {
                const response = await browserAutomation.fetch({
                    providerId,
                    input,
                    init
                });
                return new Response(response.bodyText, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            }
        },
        cookieStore: {
            get(options: { url: string; name: string }) {
                return browserAutomation.getCookie(providerId, options);
            }
        },
        userAgent: DESKTOP_CHATGPT_USER_AGENT
    };
}
