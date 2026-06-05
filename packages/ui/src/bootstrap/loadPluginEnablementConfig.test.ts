import { describe, expect, it } from 'vitest';
import { loadPluginEnablementConfig } from './loadPluginEnablementConfig';

describe('loadPluginEnablementConfig', () => {
    it('returns defaults when no override exists', () => {
        expect(loadPluginEnablementConfig({
            defaultEnabledPluginIds: ['ai-agent', 'task-mgr']
        })).toEqual({
            enabledPluginIds: ['ai-agent', 'task-mgr'],
            fallbackToDefaultEnabled: true
        });
    });

    it('uses storage overrides and disables fallback', () => {
        expect(loadPluginEnablementConfig({
            storage: {
                getItem: () => '["ai-agent"]'
            },
            defaultEnabledPluginIds: ['ai-agent', 'task-mgr']
        })).toEqual({
            enabledPluginIds: ['ai-agent'],
            fallbackToDefaultEnabled: false
        });
    });
});
