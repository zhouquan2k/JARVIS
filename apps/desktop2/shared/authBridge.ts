export const DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL = 'desktop:provider-login:open';
export const DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL = 'desktop:provider-login:opened';
export const DESKTOP_PROVIDER_LOGIN_COMPLETED_CHANNEL = 'desktop:provider-login:completed';
export const DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL = 'desktop:provider-login:closed';

export interface ProviderLoginEventPayload {
    providerId: string;
}
