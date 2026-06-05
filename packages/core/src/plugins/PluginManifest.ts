import type { PluginSetupApi } from './PluginSetupApi';

export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    defaultEnabled?: boolean;
    setup(api: PluginSetupApi): void | Promise<void>;
    dispose?(): void | Promise<void>;
}
