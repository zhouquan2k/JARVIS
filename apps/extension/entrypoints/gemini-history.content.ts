import type { GeminiContentRequest, GeminiContentResponse } from '@packages/core/src';
import { createGeminiDomScraper } from '@packages/core/src';

function debugHistory(stage: string, payload?: unknown) {
    console.debug('[ChatPrism][GeminiHistory][Extension]', stage, payload ?? '');
}

const scraper = createGeminiDomScraper({
    mode: 'extension',
    debug: debugHistory
});

export async function handleRequest(request: GeminiContentRequest): Promise<GeminiContentResponse> {
    return scraper.handleRequest(request);
}

export default defineContentScript({
    matches: ['https://gemini.google.com/*'],
    main() {
        chrome.runtime.onMessage.addListener((message: GeminiContentRequest, _sender, sendResponse) => {
            void handleRequest(message).then(sendResponse);
            return true;
        });
    }
});
