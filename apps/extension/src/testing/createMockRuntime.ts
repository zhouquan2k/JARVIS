import { createMockRuntime as createCoreMockRuntime } from '@packages/core/src';

export function createMockRuntime() {
    return createCoreMockRuntime({
        runtimeMode: 'extension',
        slowStreamTrigger: 'TRIGGER_SLOW_STREAM',
        defaultCharDelayMs: 2,
        slowCharDelayMs: 25
    });
}
