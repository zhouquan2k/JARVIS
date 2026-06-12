import type { ProviderModelCatalog } from '@packages/core/config';
import type { GroupMember } from '../group/groupTypes';
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
  /** group provider 专用：本轮参与的成员列表（由顶部勾选区决定）。 */
  groupMembers?: GroupMember[];
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

export interface IModelProvider {
  id: string; // 如：'chatgpt-web'
  getAvailableModels(): Promise<ProviderModelCatalog>;
  checkAuth(): Promise<boolean>;
  getDocumentCapability?(): Promise<ProviderDocumentCapability>;
  generateConversationTitle?(
    prompt: string,
    maxLength?: number
  ): Promise<string>;
  sendMessage(
    prompt: string,
    options: SendMessageOptions,
    onUpdate: (update: ProviderStreamUpdate) => void
  ): Promise<ProviderSendResult>;
  /**
   * 把默认/当前的模型与推理档位同步到受控页面（仅 DOM 类 provider 实现）。
   * 在切换 provider、用户改模型/档位、模型目录就绪等「初始化」时机调用，
   * 使网页状态即时反映 app 的选择，无需等到发送消息。
   * best-effort：失败仅记录日志，不抛出。
   */
  applyPageDefaults?(options: { modelId?: string; reasoningEffort?: ReasoningEffort; groupMembers?: GroupMember[] }): Promise<void>;
  abort(): void;
}
