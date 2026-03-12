import type { AnalysisResult, Conversation, IStorageProvider } from '@packages/core/src';

const LAST_COMPARE_SNAPSHOT_KEY = 'chatprism:last-compare-snapshot';

export interface CompareConversationPayload {
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

export async function saveCompareConversation(
    storage: IStorageProvider,
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

    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
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

export async function loadLatestCompareConversation(
    storage: IStorageProvider
): Promise<Conversation | null> {
    let snapshotConversation: Conversation | null = null;
    if (typeof localStorage !== 'undefined') {
        const snapshot = localStorage.getItem(LAST_COMPARE_SNAPSHOT_KEY);
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

    // Prefer fast local snapshot for immediate restore in extension host.
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
