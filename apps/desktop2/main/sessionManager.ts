import { session, type Session } from 'electron';

const PROVIDER_PARTITIONS = new Map<string, string>([
    ['chatgpt-web', 'persist:chatprism-chatgpt'],
    ['gemini-web', 'persist:chatprism-gemini']
]);

function sanitizeProviderId(providerId: string): string {
    return providerId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getSessionNamespace(): string | null {
    const rawValue = process.env.CHATPRISM_SESSION_NAMESPACE?.trim();
    if (!rawValue) {
        return null;
    }

    const normalized = sanitizeProviderId(rawValue);
    return normalized || null;
}

export function getProviderPartition(providerId: string): string {
    const basePartition = PROVIDER_PARTITIONS.get(providerId) || `persist:chatprism-${sanitizeProviderId(providerId)}`;
    const namespace = getSessionNamespace();
    return namespace ? `${basePartition}-${namespace}` : basePartition;
}

export function getProviderSession(providerId: string): Session {
    return session.fromPartition(getProviderPartition(providerId), { cache: true });
}
