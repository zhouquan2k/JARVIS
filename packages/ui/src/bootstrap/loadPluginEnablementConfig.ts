import type { PluginEnablementConfig } from '@packages/core';

export interface LoadPluginEnablementConfigOptions {
    storage?: Pick<Storage, 'getItem'>;
    storageKey?: string;
    defaultEnabledPluginIds: string[];
    fallbackToDefaultEnabled?: boolean;
}

function parseOverrideValue(rawValue: string): string[] {
    try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
            return parsed;
        }
    } catch {
        // Fall through to comma-separated parsing for simple manual overrides.
    }

    const ids = rawValue
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    return ids;
}

export function loadPluginEnablementConfig(
    options: LoadPluginEnablementConfigOptions
): PluginEnablementConfig {
    const rawValue = options.storage?.getItem(options.storageKey ?? 'chatprism.enabledPluginIds');
    if (rawValue) {
        return {
            enabledPluginIds: parseOverrideValue(rawValue),
            fallbackToDefaultEnabled: false
        };
    }

    return {
        enabledPluginIds: options.defaultEnabledPluginIds,
        fallbackToDefaultEnabled: options.fallbackToDefaultEnabled ?? true
    };
}
