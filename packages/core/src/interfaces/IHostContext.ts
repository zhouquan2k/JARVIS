export type HostPlatform = 'web' | 'desktop' | 'extension';

export type HostCapabilityKey =
    | 'storage'
    | 'message-port'
    | 'browser-tabs'
    | 'browser-automation'
    | 'controlled-page'
    | 'provider-login'
    | 'http-client';

export interface HostEnvironmentInfo {
    platform: HostPlatform;
    contextBaseUrl?: string;
}

export interface IHostContext {
    readonly environment: HostEnvironmentInfo;
    hasCapability(capability: HostCapabilityKey): boolean;
    getCapability<T>(capability: HostCapabilityKey): T | null;
}
