import type { GeminiHistoryRemoteConfig } from '@plugins/ai-agent/src/internal';
import type { GeminiContentAction } from './geminiContentProtocol';

type GeminiSelectorKey = keyof GeminiHistoryRemoteConfig['selectors'];

const ACTION_SELECTOR_KEYS: Record<Exclude<GeminiContentAction, 'PING'>, GeminiSelectorKey[]> = {
    GET_HISTORY_LIST: ['historyListContainer', 'historyListItem'],
    GET_HISTORY_DETAIL: ['conversationRoot', 'userBubble', 'assistantBubble']
};

function selectorValue(config: GeminiHistoryRemoteConfig, key: GeminiSelectorKey): string | null {
    const value = config.selectors[key];
    return typeof value === 'string' && value.trim() ? value : null;
}

export function getRequiredSelectorKeys(
    action: Exclude<GeminiContentAction, 'PING'>,
    config: GeminiHistoryRemoteConfig
): GeminiSelectorKey[] {
    const preferredKeys = ACTION_SELECTOR_KEYS[action];
    const configuredKeys = config.healthCheck.requiredSelectors
        .filter((key): key is GeminiSelectorKey => preferredKeys.includes(key as GeminiSelectorKey));

    return configuredKeys.length > 0 ? configuredKeys : preferredKeys;
}

export function countMissingSelectors(
    config: GeminiHistoryRemoteConfig,
    selectorKeys: GeminiSelectorKey[],
    querySelector: (selector: string) => Element | null = (selector) => document.querySelector(selector)
): number {
    let missingCount = 0;

    for (const key of selectorKeys) {
        const selector = selectorValue(config, key);
        if (!selector || !querySelector(selector)) {
            missingCount += 1;
        }
    }

    return missingCount;
}

export function isSelectorGroupHealthy(
    config: GeminiHistoryRemoteConfig,
    selectorKeys: GeminiSelectorKey[],
    querySelector?: (selector: string) => Element | null
): boolean {
    return countMissingSelectors(config, selectorKeys, querySelector) <= config.healthCheck.maxMissingCount;
}

export async function waitForSelectorGroup(
    config: GeminiHistoryRemoteConfig,
    selectorKeys: GeminiSelectorKey[],
    timeoutMs = 5000
): Promise<boolean> {
    if (isSelectorGroupHealthy(config, selectorKeys)) {
        return true;
    }

    const root = document.documentElement;
    if (!root) {
        return false;
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;

        const finish = (result: boolean) => {
            if (settled) {
                return;
            }
            settled = true;
            observer.disconnect();
            clearTimeout(timer);
            resolve(result);
        };

        const observer = new MutationObserver(() => {
            if (isSelectorGroupHealthy(config, selectorKeys)) {
                finish(true);
            }
        });

        const timer = window.setTimeout(() => {
            finish(isSelectorGroupHealthy(config, selectorKeys));
        }, timeoutMs);

        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true
        });
    });
}
