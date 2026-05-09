import type { ProviderModelCatalog } from '../../config';
import type { AgentModelTurn, AgentToolCall } from './IAgentCapableProvider';
import type {
  ConversationRole,
  MessageAnnotation,
  MessageAttachment,
  MessageFunctionalPart,
  MessageRequestSnapshot
} from './Conversation';

export interface ProviderContextMessage {
  role: ConversationRole;
  content: string;
  attachments?: MessageAttachment[];
}

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface SendMessageOptions {
  context?: { parentMessageId?: string, conversationId?: string };
  modelId?: string;
  attachments?: MessageAttachment[];
  history?: ProviderContextMessage[];
  modelOptions?: Record<string, boolean>;
  reasoningEffort?: ReasoningEffort;
}

export interface ProviderStreamUpdate {
  text: string;
  annotations?: MessageAnnotation[];
  toolCalls?: AgentToolCall[];
  functionalParts?: MessageFunctionalPart[];
}

export interface ProviderSendResult {
  text: string;
  conversationId: string;
  messageId: string;
  annotations?: MessageAnnotation[];
  toolCalls?: AgentToolCall[];
  modelTurn?: AgentModelTurn;
  requestSnapshot?: MessageRequestSnapshot;
  functionalParts?: MessageFunctionalPart[];
}

export interface ProviderDocumentCapability {
  acceptedMimeTypes: string[];
}

export interface GenerateConversationTitleOptions {
  modelId?: string;
  maxLength?: number;
}

export interface IModelProvider {
  id: string; // 如：'chatgpt-web'
  getAvailableModels(): Promise<ProviderModelCatalog>;
  checkAuth(): Promise<boolean>;
  getDocumentCapability?(): Promise<ProviderDocumentCapability>;
  generateConversationTitle?(
    prompt: string,
    options?: GenerateConversationTitleOptions
  ): Promise<string>;
  sendMessage(
    prompt: string,
    options: SendMessageOptions,
    onUpdate: (update: ProviderStreamUpdate) => void
  ): Promise<ProviderSendResult>;
  abort(): void;
}
