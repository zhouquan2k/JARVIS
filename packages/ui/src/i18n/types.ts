import type { Ref } from 'vue';

export type SupportedLocale = 'en' | 'zh-CN';

export type MessageParams = Record<string, string | number | boolean | null | undefined>;

export interface ResolveInitialLocaleOptions {
    storage?: Pick<Storage, 'getItem'>;
    navigatorLanguage?: string;
    defaultLocale?: SupportedLocale;
}

export interface WorkspaceI18nOptions extends ResolveInitialLocaleOptions {
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

export interface WorkspaceI18nApi {
    locale: Ref<SupportedLocale>;
    setLocale(locale: SupportedLocale): void;
    toggleLocale(): void;
    t(key: string, params?: MessageParams): string;
}

