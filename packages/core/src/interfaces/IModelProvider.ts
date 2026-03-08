import type { ProviderModelCatalog } from '../../config';

export interface IModelProvider {
  id: string; // 如：'chatgpt-web'
  getAvailableModels(): Promise<ProviderModelCatalog>;
  checkAuth(): Promise<boolean>;
  sendMessage(
    prompt: string,
    options: {
      context?: { parentMessageId?: string, conversationId?: string },
      modelId?: string
    },
    onUpdate: (chunk: string) => void
  ): Promise<{ text: string, conversationId: string, messageId: string }>;
  abort(): void;
}
