export { createModelProviderRuntime } from './createModelProviderRuntime';
import type { ModelProviderRuntime, ModelProviderRuntimeOptions } from './modelProviderRuntime.types';
import { createModelProviderRuntime } from './createModelProviderRuntime';

export function createProviderRuntime(options: ModelProviderRuntimeOptions): ModelProviderRuntime {
    return createModelProviderRuntime(options);
}
