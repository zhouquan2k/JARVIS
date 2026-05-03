import type { Ref } from 'vue';

export type SupportedLocale = 'en' | 'zh-CN';

export type MessageParams = Record<string, string | number | boolean | null | undefined>;

export type WorkspaceStaticMessageKey =
    | 'shared.close'
    | 'shared.closeSearch'
    | 'shared.documentSearchPlaceholder'
    | 'shared.documentSearchMatchCount'
    | 'shared.previousMatch'
    | 'shared.nextMatch'
    | 'shared.previousMatchShort'
    | 'shared.nextMatchShort'
    | 'shared.renameConversation'
    | 'shared.renameConversationShort'
    | 'shared.editQuestion'
    | 'shared.editingQuestion'
    | 'shared.editResendWarning'
    | 'shared.cancelEditQuestion'
    | 'shared.functionalPartDetail'
    | 'shared.functionalPartToolExchange'
    | 'shared.functionalPartToolCall'
    | 'shared.functionalPartToolResult'
    | 'shared.functionalPartFunctionCall'
    | 'shared.functionalPartSearch'
    | 'shared.functionalPartTrace'
    | 'shared.functionalPartRequest'
    | 'shared.functionalPartResponse';

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
