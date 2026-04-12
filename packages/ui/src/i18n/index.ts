import { inject, type App, type Plugin, readonly, ref, type Ref } from 'vue';
import type { MessageParams, ResolveInitialLocaleOptions, SupportedLocale, WorkspaceI18nApi, WorkspaceI18nOptions } from './types';
import { enMessages } from './messages/en';
import { zhCNMessages } from './messages/zh-CN';

const STORAGE_KEY = 'chatprism:workspace-locale';
const WORKSPACE_I18N_KEY = Symbol('workspace-i18n');

const MESSAGE_MAP = {
    en: enMessages,
    'zh-CN': zhCNMessages
} as const;

let activeWorkspaceI18n: WorkspaceI18nApi | null = null;
let fallbackWorkspaceI18n: WorkspaceI18nApi | null = null;

function normalizeLocale(value?: string | null): SupportedLocale | null {
    if (!value) {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (normalized === 'zh-cn' || normalized.startsWith('zh')) {
        return 'zh-CN';
    }

    if (normalized === 'en' || normalized.startsWith('en')) {
        return 'en';
    }

    return null;
}

function readPersistedLocale(storage?: Pick<Storage, 'getItem'>): SupportedLocale | null {
    return normalizeLocale(storage?.getItem(STORAGE_KEY));
}

function resolveNavigatorLocale(navigatorLanguage?: string): SupportedLocale | null {
    return normalizeLocale(navigatorLanguage);
}

function resolveMessageTree(locale: SupportedLocale) {
    return MESSAGE_MAP[locale] ?? MESSAGE_MAP.en;
}

function resolvePathMessage(tree: Record<string, unknown>, key: string): unknown {
    return key.split('.').reduce<unknown>((current, segment) => {
        if (current && typeof current === 'object' && segment in current) {
            return (current as Record<string, unknown>)[segment];
        }
        return undefined;
    }, tree);
}

function formatMessage(template: string, params?: MessageParams): string {
    if (!params) {
        return template;
    }

    return template.replace(/\{([a-zA-Z0-9_]+)\}/gu, (_, key: string) => {
        const value = params[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

function resolveLocalizedMessage(locale: SupportedLocale, key: string, params?: MessageParams): string {
    const tree = resolveMessageTree(locale) as Record<string, unknown>;
    const fallbackTree = resolveMessageTree('en') as Record<string, unknown>;
    const value = resolvePathMessage(tree, key) ?? resolvePathMessage(fallbackTree, key);
    if (typeof value !== 'string') {
        return key;
    }

    return formatMessage(value, params);
}

function createWorkspaceI18nApi(options: WorkspaceI18nOptions = {}): WorkspaceI18nApi {
    const locale = ref<SupportedLocale>(resolveInitialLocale(options));
    const storage = options.storage;

    const api: WorkspaceI18nApi = {
        locale: readonly(locale) as Ref<SupportedLocale>,
        setLocale(nextLocale: SupportedLocale) {
            locale.value = nextLocale;
            storage?.setItem(STORAGE_KEY, nextLocale);
        },
        toggleLocale() {
            api.setLocale(locale.value === 'en' ? 'zh-CN' : 'en');
        },
        t(key: string, params?: MessageParams) {
            return resolveLocalizedMessage(locale.value, key, params);
        }
    };

    return api;
}

function getFallbackWorkspaceI18n(): WorkspaceI18nApi {
    if (!fallbackWorkspaceI18n) {
        fallbackWorkspaceI18n = createWorkspaceI18nApi();
    }

    return fallbackWorkspaceI18n;
}

function resolveWorkspaceI18nApi(): WorkspaceI18nApi {
    return activeWorkspaceI18n ?? getFallbackWorkspaceI18n();
}

export function resolveInitialLocale(options: ResolveInitialLocaleOptions = {}): SupportedLocale {
    const persisted = readPersistedLocale(options.storage);
    if (persisted) {
        return persisted;
    }

    const navigatorLocale = resolveNavigatorLocale(options.navigatorLanguage ?? globalThis.navigator?.language);
    if (navigatorLocale) {
        return navigatorLocale;
    }

    return options.defaultLocale ?? 'en';
}

export function createWorkspaceI18n(options: WorkspaceI18nOptions = {}): Plugin {
    return {
        install(app: App) {
            const api = createWorkspaceI18nApi(options);
            activeWorkspaceI18n = api;
            app.provide(WORKSPACE_I18N_KEY, api);
            app.config.globalProperties.$workspaceI18n = api;
        }
    };
}

export function useWorkspaceI18n(): WorkspaceI18nApi {
    return inject<WorkspaceI18nApi>(WORKSPACE_I18N_KEY, resolveWorkspaceI18nApi());
}

export function translateWorkspaceMessage(key: string, params?: MessageParams): string {
    return resolveWorkspaceI18nApi().t(key, params);
}

export function getWorkspaceLocaleRef(): Ref<SupportedLocale> {
    return resolveWorkspaceI18nApi().locale;
}

export function resolveWorkspaceText(key: string, fallback: string, params?: MessageParams): string {
    const translated = translateWorkspaceMessage(key, params);
    return translated === key ? fallback : translated;
}
