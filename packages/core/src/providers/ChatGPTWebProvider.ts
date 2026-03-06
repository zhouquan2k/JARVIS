/// <reference types="chrome"/>
import { IModelProvider } from '../interfaces/IModelProvider';
import { sha3_512 } from 'js-sha3';

// UUID v4 generator helper
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const randomIntInclusive = (min: number, max: number): number => {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return Math.floor(Math.random() * (upper - lower + 1) + lower);
};

function generateProofToken(seed: string, diff: string, userAgent: string): string {
    const cores = [1, 2, 4];
    const screens = [3008, 4010, 6000];
    const reacts = [
        '_reactListeningcfilawjnerp',
        '_reactListening9ne2dfo1i47',
        '_reactListening410nzwhan2a',
    ];
    const acts = ['alert', 'ontransitionend', 'onprogress'];

    const core = cores[randomIntInclusive(0, cores.length - 1)];
    const screen = screens[randomIntInclusive(0, screens.length - 1)] + core;
    const react = reacts[randomIntInclusive(0, reacts.length - 1)];
    const act = acts[randomIntInclusive(0, acts.length - 1)];

    const parseTime = new Date().toString();

    const config: any[] = [
        screen,
        parseTime,
        4294705152,
        0,
        userAgent,
        'https://tcr9i.chat.openai.com/v2/35536E1E-65B4-4D96-9D97-6ADB7EFF8147/api.js',
        'dpl=1440a687921de39ff5ee56b92807faaadce73f13',
        'en',
        'en-US',
        4294705152,
        'plugins−[object PluginArray]',
        react,
        act,
    ];

    const diffLen = diff.length;

    for (let i = 0; i < 500000; i++) {
        config[3] = i;
        const jsonData = JSON.stringify(config);
        const base = btoa(unescape(encodeURIComponent(jsonData)));
        const hashValue = sha3_512.create().update(seed + base);

        if (hashValue.hex().substring(0, diffLen) <= diff) {
            return 'gAAAAAB' + base;
        }
    }

    const fallbackBase = btoa(unescape(encodeURIComponent(`"${seed}"`)));
    return 'gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D' + fallbackBase;
}

export class ChatGPTWebProvider implements IModelProvider {
    public id = 'chatgpt-web';
    private accessToken: string | null = null;
    private abortController: AbortController | null = null;

    async checkAuth(): Promise<boolean> {
        try {
            const resp = await fetch('https://chatgpt.com/api/auth/session', {
                credentials: 'include'
            });
            if (!resp.ok) return false;
            const data = await resp.json();
            if (data && data.accessToken) {
                this.accessToken = data.accessToken;
                return true;
            }
            return false;
        } catch (e) {
            console.error('ChatGPT auth check failed:', e);
            return false;
        }
    }

    private async getOaiDeviceId(): Promise<string> {
        try {
            // If in an extension background, we can try to extract from cookies
            if (typeof chrome !== 'undefined' && chrome.cookies) {
                const cookie = await chrome.cookies.get({ url: 'https://chatgpt.com', name: 'oai-did' });
                if (cookie && cookie.value) return cookie.value;
            }
        } catch (e) {
            console.warn('Failed to get oai-did cookie', e);
        }
        return generateUUID(); // fallback
    }

    async getChatRequirements(): Promise<any | null> {
        try {
            const deviceId = await this.getOaiDeviceId();
            const resp = await fetch('https://chatgpt.com/backend-api/sentinel/chat-requirements', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    'OAI-Device-Id': deviceId,
                    'OAI-Language': 'en-US'
                },
                body: JSON.stringify({})
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data || null;
        } catch (e) {
            console.warn('Failed to get chat requirements:', e);
            return null;
        }
    }

    async sendMessage(
        prompt: string,
        options: {
            context?: { parentMessageId?: string, conversationId?: string },
            modelId?: string
        } = {},
        onUpdate: (chunk: string) => void
    ): Promise<{ text: string, conversationId: string, messageId: string }> {
        if (!this.accessToken) {
            const isAuth = await this.checkAuth();
            if (!isAuth) throw new Error('Not authenticated with ChatGPT Web');
        }

        const requirements = await this.getChatRequirements();
        const requirementToken = requirements?.token;

        let proofToken: string | undefined;
        if (requirements?.proofofwork?.required) {
            proofToken = generateProofToken(
                requirements.proofofwork.seed,
                requirements.proofofwork.difficulty,
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            );
        }

        const deviceId = await this.getOaiDeviceId();
        const context = options.context || {};
        const parentMessageId = context.parentMessageId || generateUUID();
        const messageId = generateUUID();

        const payload: any = {
            action: 'next',
            messages: [
                {
                    id: messageId,
                    author: { role: 'user' },
                    content: { content_type: 'text', parts: [prompt] }
                }
            ],
            parent_message_id: parentMessageId,
            model: options.modelId || 'auto',
            timezone_offset_min: new Date().getTimezoneOffset(),
            history_and_training_disabled: false,
        };

        if (context.conversationId) {
            payload.conversation_id = context.conversationId;
        }

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'OAI-Device-Id': deviceId,
            'OAI-Language': 'en-US'
        };

        if (requirementToken) {
            headers['Openai-Sentinel-Chat-Requirements-Token'] = requirementToken;
        }
        if (proofToken) {
            headers['Openai-Sentinel-Proof-Token'] = proofToken;
        }

        this.abortController = new AbortController();

        const response = await fetch('https://chatgpt.com/backend-api/conversation', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const errorDetail = await response.text().catch(() => '');
            const detailSuffix = errorDetail ? ` - ${errorDetail}` : '';
            throw new Error(`ChatGPT API request failed: ${response.status} ${response.statusText}${detailSuffix}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body stream available');

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullText = '';
        let replyConversationId = context.conversationId || '';
        let replyMessageId = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');

            // Leave the last incomplete part in the buffer
            buffer = parts.pop() || '';

            for (const part of parts) {
                if (part.trim() === '') continue;
                if (!part.startsWith('data: ')) continue;

                const dataStr = part.substring(6).trim();
                if (dataStr === '[DONE]') break;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.message?.content?.parts?.[0]) {
                        // ChatGPT provides full text replacement
                        fullText = data.message.content.parts[0];
                        replyConversationId = data.conversation_id || replyConversationId;
                        replyMessageId = data.message.id || replyMessageId;
                        onUpdate(fullText);
                    }
                } catch (e) {
                    console.warn('Error parsing SSE data line', dataStr, e);
                }
            }
        }

        this.abortController = null;
        return {
            text: fullText,
            conversationId: replyConversationId,
            messageId: replyMessageId
        };
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
