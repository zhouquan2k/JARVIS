import { session, type Session } from 'electron';

const PROVIDER_PARTITIONS = new Map<string, string>([
    ['chatgpt-web', 'persist:chatprism-chatgpt'],
    ['gemini-web', 'persist:chatprism-gemini']
]);

function sanitizeProviderId(providerId: string): string {
    return providerId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function getProviderPartition(providerId: string): string {
    return PROVIDER_PARTITIONS.get(providerId) || `persist:chatprism-${sanitizeProviderId(providerId)}`;
}

export function getProviderSession(providerId: string): Session {
    return session.fromPartition(getProviderPartition(providerId), { cache: true });
}
