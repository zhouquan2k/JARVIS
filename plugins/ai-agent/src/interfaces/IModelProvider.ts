import type { ProviderModelCatalog } from '@packages/core/config';
import type { GroupMember } from '../group/groupTypes';
import type { AgentModelTurn, AgentToolCall } from './IAgentCapableProvider';
import type {
  ConversationRole,
  GroupMemberPart,
  GroupSummaryPart,
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
  /**
   * DOM provider 专用：该会话此前落盘的站点会话 URL。
   * 后续轮（history 非空）存在该值时，导航回该 URL 续聊；导航后校验失败即抛错。
   */
  resumeConversationUrl?: string;
  /**
   * group provider 专用：providerId → 站点会话 URL 的映射（含各成员与总结器），
   * 由 chat store 从会话历史构建，group provider 据此分发各成员的 resumeConversationUrl。
   */
  groupMemberSessions?: Record<string, string>;
}

export interface ProviderStreamUpdate {
  text: string;
  annotations?: MessageAnnotation[];
  toolCalls?: AgentToolCall[];
  functionalParts?: MessageFunctionalPart[];
  groupMembers?: GroupMemberPart[];
  groupSummary?: GroupSummaryPart;
}

export interface ProviderSendResult {
  text: string;
  conversationId: string;
  messageId: string;
  /** DOM provider 回填：本轮结束时受控页的真实会话 URL（location.href），用于持久化与后续恢复。 */
  conversationUrl?: string;
  annotations?: MessageAnnotation[];
  toolCalls?: AgentToolCall[];
  modelTurn?: AgentModelTurn;
  requestSnapshot?: MessageRequestSnapshot;
  functionalParts?: MessageFunctionalPart[];
  groupMembers?: GroupMemberPart[];
  groupSummary?: GroupSummaryPart;
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
