export interface ProviderLoginCapability {
    openProviderLogin(providerId: string): Promise<void>;
    subscribeProviderLoginOpened(listener: (providerId: string) => void): () => void;
    subscribeProviderLoginCompleted(listener: (providerId: string) => void): () => void;
    subscribeProviderLoginClosed(listener: (providerId: string) => void): () => void;
}
