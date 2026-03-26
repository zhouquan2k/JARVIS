import { createMockRuntime as createCoreMockRuntime } from '@packages/core/src';

export function createMockRuntime() {
    return createCoreMockRuntime({
        runtimeMode: 'desktop',
        defaultCharDelayMs: 2,
        slowCharDelayMs: 2
    });
}
