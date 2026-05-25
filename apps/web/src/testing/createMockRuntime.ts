import { createMockRuntime as createCoreMockRuntime } from '@packages/core/src';

export function createMockRuntime() {
    const codexAuthOverride = globalThis.localStorage?.getItem('chatprism:e2e-codex-auth');

    return createCoreMockRuntime({
        runtimeMode: 'web',
        defaultCharDelayMs: 2,
        slowCharDelayMs: 2,
        providerAuthOverrides: codexAuthOverride === null
            ? undefined
            : {
                'chatgpt-codex': codexAuthOverride === '1'
            }
    });
}
