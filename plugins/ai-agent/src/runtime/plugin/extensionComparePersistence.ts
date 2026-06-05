import type { AnalysisResult, Conversation, IConversationPersistProvider } from '@plugins/ai-agent/src/internal';
import { toRaw, watch } from 'vue';
import { useCompareStore } from '../../store/compare';

const LAST_COMPARE_SNAPSHOT_KEY = 'chatprism:last-compare-snapshot';

interface CompareConversationPayload {
    prompt: string;
    modelAProviderId: string;
    modelAModelId: string;
    modelBProviderId: string;
    modelBModelId: string;
    outputA: string;
    outputB: string;
    analysisResult: AnalysisResult;
    analysisRaw?: string;
}

function buildTitle(prompt: string): string {
    const trimmed = prompt.trim();
    if (!trimmed) {
        return 'Compare Chat';
    }
    return trimmed.length <= 30 ? `Compare: ${trimmed}` : `Compare: ${trimmed.slice(0, 30)}...`;
}

function getBrowserLocalStorage(): Storage | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const storage = (window as unknown as Record<string, unknown>)['localStorage'];
    return storage instanceof Storage ? storage : null;
}

async function saveCompareConversation(
    storage: IConversationPersistProvider,
    payload: CompareConversationPayload
): Promise<Conversation> {
    const now = Date.now();
    const conversation: Conversation = {
        id: crypto.randomUUID(),
        title: buildTitle(payload.prompt),
        origin: 'local',
        messages: [
            {
                id: crypto.randomUUID(),
                role: 'user',
                content: payload.prompt
            },
            {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Model A:\n${payload.outputA}\n\nModel B:\n${payload.outputB}`
            }
        ],
        updatedAt: now,
        compare: {
            prompt: payload.prompt,
            modelAProviderId: payload.modelAProviderId,
            modelAModelId: payload.modelAModelId,
            modelBProviderId: payload.modelBProviderId,
            modelBModelId: payload.modelBModelId,
            outputA: payload.outputA,
            outputB: payload.outputB,
            analysisResult: payload.analysisResult,
            analysisRaw: payload.analysisRaw
        }
    };

    const browserLocalStorage = getBrowserLocalStorage();
    if (browserLocalStorage) {
        browserLocalStorage.setItem(
            LAST_COMPARE_SNAPSHOT_KEY,
            JSON.stringify({
                updatedAt: now,
                compare: conversation.compare
            })
        );
    }

    await storage.saveConversation(conversation);
    return conversation;
}

async function loadLatestCompareConversation(
    storage: IConversationPersistProvider
): Promise<Conversation | null> {
    let snapshotConversation: Conversation | null = null;
    const browserLocalStorage = getBrowserLocalStorage();
    if (browserLocalStorage) {
        const snapshot = browserLocalStorage.getItem(LAST_COMPARE_SNAPSHOT_KEY);
        if (snapshot) {
            try {
                const parsed = JSON.parse(snapshot) as { updatedAt?: number; compare?: Conversation['compare'] };
                if (parsed.compare) {
                    snapshotConversation = {
                        id: `compare-snapshot-${parsed.updatedAt || Date.now()}`,
                        title: buildTitle(parsed.compare.prompt),
                        origin: 'local',
                        messages: [],
                        updatedAt: parsed.updatedAt || Date.now(),
                        compare: parsed.compare
                    };
                }
            } catch {
                snapshotConversation = null;
            }
        }
    }

    if (snapshotConversation) {
        return snapshotConversation;
    }

    try {
        const conversations = await storage.getAllConversations();
        const latest = conversations.find((item) => !!item.compare);
        if (latest) {
            return latest;
        }
    } catch (error) {
        console.warn('Failed to load compare conversation from storage, falling back to snapshot', error);
    }

    return null;
}

let comparePersistenceInitialized = false;

export async function initializeExtensionComparePersistence(storageProvider: IConversationPersistProvider): Promise<void> {
    if (comparePersistenceInitialized) {
        return;
    }

    comparePersistenceInitialized = true;
    const compareStore = useCompareStore();
    const latestCompareConversation = await loadLatestCompareConversation(storageProvider);
    if (latestCompareConversation?.compare) {
        const compare = latestCompareConversation.compare;
        await compareStore.setModelA(compare.modelAProviderId, compare.modelAModelId);
        await compareStore.setModelB(compare.modelBProviderId, compare.modelBModelId);
        compareStore.prompt = compare.prompt;
        compareStore.outputA = compare.outputA;
        compareStore.outputB = compare.outputB;
        compareStore.analysisResult = compare.analysisResult;
        compareStore.analysisRaw = compare.analysisRaw || '';
        compareStore.analysisError = null;
        compareStore.hasAnalysisStartedStreaming = true;
        compareStore.stage = 'completed';
        compareStore.activeTab = 'analysis';
    }

    let lastPersistedCompareKey = '';
    watch(
        () => [
            compareStore.stage,
            compareStore.analysisResult,
            compareStore.prompt,
            compareStore.modelAProviderId,
            compareStore.modelAModelId,
            compareStore.modelBProviderId,
            compareStore.modelBModelId,
            compareStore.outputA,
            compareStore.outputB,
            compareStore.analysisRaw
        ] as const,
        () => {
            if (compareStore.stage !== 'completed' || !compareStore.analysisResult) {
                return;
            }

            const persistKey = [
                compareStore.prompt,
                compareStore.modelAProviderId,
                compareStore.modelAModelId,
                compareStore.modelBProviderId,
                compareStore.modelBModelId,
                compareStore.outputA,
                compareStore.outputB,
                compareStore.analysisRaw
            ].join('::');

            if (persistKey === lastPersistedCompareKey) {
                return;
            }
            lastPersistedCompareKey = persistKey;

            const rawAnalysisResult = toRaw(compareStore.analysisResult);
            void saveCompareConversation(storageProvider, {
                prompt: compareStore.prompt,
                modelAProviderId: compareStore.modelAProviderId,
                modelAModelId: compareStore.modelAModelId,
                modelBProviderId: compareStore.modelBProviderId,
                modelBModelId: compareStore.modelBModelId,
                outputA: compareStore.outputA,
                outputB: compareStore.outputB,
                analysisResult: { ...rawAnalysisResult },
                analysisRaw: compareStore.analysisRaw
            }).catch((error) => {
                console.error('Failed to persist compare conversation', error);
            });
        }
    );
}
