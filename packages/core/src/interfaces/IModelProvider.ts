import type { ProviderModelCatalog } from '../../config';
import type { MessageAnnotation, MessageAttachment } from './IStorageProvider';

export interface SendMessageOptions {
  context?: { parentMessageId?: string, conversationId?: string };
  modelId?: string;
  attachments?: MessageAttachment[];
}

export interface ProviderStreamUpdate {
  text: string;
  annotations?: MessageAnnotation[];
}

export interface ProviderSendResult {
  text: string;
  conversationId: string;
  messageId: string;
  annotations?: MessageAnnotation[];
}

export interface IModelProvider {
  id: string; // 如：'chatgpt-web'
  getAvailableModels(): Promise<ProviderModelCatalog>;
  checkAuth(): Promise<boolean>;
  sendMessage(
    prompt: string,
    options: SendMessageOptions,
    onUpdate: (update: ProviderStreamUpdate) => void
  ): Promise<ProviderSendResult>;
  abort(): void;
}
