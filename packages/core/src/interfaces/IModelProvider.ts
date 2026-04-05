import type { ProviderModelCatalog } from '../../config';
import type { AgentModelTurn, AgentToolCall } from './IAgentCapableProvider';
import type { ConversationRole, MessageAnnotation, MessageAttachment, MessageRequestSnapshot } from './IStorageProvider';

export interface ProviderContextMessage {
  role: ConversationRole;
  content: string;
  attachments?: MessageAttachment[];
}

export interface SendMessageOptions {
  context?: { parentMessageId?: string, conversationId?: string };
  modelId?: string;
  attachments?: MessageAttachment[];
  history?: ProviderContextMessage[];
  modelOptions?: Record<string, boolean>;
}

export interface ProviderStreamUpdate {
  text: string;
  annotations?: MessageAnnotation[];
  toolCalls?: AgentToolCall[];
}

export interface ProviderSendResult {
  text: string;
  conversationId: string;
  messageId: string;
  annotations?: MessageAnnotation[];
  toolCalls?: AgentToolCall[];
  modelTurn?: AgentModelTurn;
  requestSnapshot?: MessageRequestSnapshot;
}

export interface ProviderDocumentCapability {
  acceptedMimeTypes: string[];
}

export interface IModelProvider {
  id: string; // 如：'chatgpt-web'
  getAvailableModels(): Promise<ProviderModelCatalog>;
  checkAuth(): Promise<boolean>;
  getDocumentCapability?(): Promise<ProviderDocumentCapability>;
  sendMessage(
    prompt: string,
    options: SendMessageOptions,
    onUpdate: (update: ProviderStreamUpdate) => void
  ): Promise<ProviderSendResult>;
  abort(): void;
}
