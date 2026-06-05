import type { IHostContext, PluginEnablementConfig, PluginManifest, WorkspaceRuntimeContext } from '@packages/core';
import { createScopedSetupApi } from './createScopedSetupApi';
import { consolePluginLogger, type PluginLogger } from './logger';
import type { PluginRegistry } from './PluginRegistry';

export class PluginManager {
    private readonly manifests = new Map<string, PluginManifest>();

    private readonly enabledPluginIds = new Set<string>();

    constructor(
        private readonly registry: PluginRegistry,
        private readonly runtimeContext: WorkspaceRuntimeContext,
        private readonly hostContext: IHostContext,
        private readonly logger: PluginLogger = consolePluginLogger
    ) {}

    public register(manifest: PluginManifest): void {
        this.manifests.set(manifest.id, manifest);
    }

    public async activateEnabledPlugins(config: PluginEnablementConfig): Promise<void> {
        for (const manifest of this.manifests.values()) {
            if (!this.isEnabled(manifest, config)) {
                continue;
            }

            try {
                await manifest.setup(createScopedSetupApi(manifest.id, this.registry, this.runtimeContext, this.hostContext));
                this.enabledPluginIds.add(manifest.id);
            } catch (error) {
                this.registry.removeByPlugin(manifest.id);
                this.enabledPluginIds.delete(manifest.id);
                this.logger.error(`Failed to activate plugin "${manifest.id}".`, error);
            }
        }
    }

    public async deactivatePlugin(pluginId: string): Promise<void> {
        const manifest = this.manifests.get(pluginId);
        if (!manifest) {
            return;
        }

        this.registry.removeByPlugin(pluginId);
        this.enabledPluginIds.delete(pluginId);
        await manifest.dispose?.();
    }

    public getEnabledPluginIds(): string[] {
        return [...this.enabledPluginIds];
    }

    private isEnabled(manifest: PluginManifest, config: PluginEnablementConfig): boolean {
        const explicit = config.enabledPluginIds.includes(manifest.id);
        if (explicit) {
            return true;
        }

        if (config.fallbackToDefaultEnabled === false) {
            return false;
        }

        return manifest.defaultEnabled === true;
    }
}
