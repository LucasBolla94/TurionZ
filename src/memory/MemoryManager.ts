// ============================================================
// TurionZ — Memory Manager (Facade)
// Created by BollaNetwork
// ============================================================

import { Database } from '../infra/database';
import { ConversationRepository, Conversation } from './ConversationRepository';
import { MessageRepository, Message } from './MessageRepository';
import { EmbeddingEngine } from './EmbeddingEngine';
import { TokenCounter } from './TokenCounter';
import { LlmMessage } from '../types';

const SUMMARY_THRESHOLD = 0.7; // Trigger summary at 70% capacity

export class MemoryManager {
  private static instance: MemoryManager;
  private db: Database;
  private conversationRepo: ConversationRepository;
  private messageRepo: MessageRepository;
  private embeddingEngine: EmbeddingEngine;
  private defaultWindowSize: number;

  private constructor() {
    this.db = Database.getInstance();
    this.conversationRepo = new ConversationRepository();
    this.messageRepo = new MessageRepository();
    this.embeddingEngine = EmbeddingEngine.getInstance();
    this.defaultWindowSize = parseInt(process.env.CONTEXT_WINDOW_SIZE || '150000', 10);
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  async initialize(): Promise<void> {
    await this.embeddingEngine.initialize();
    console.log(`[Memory] Initialized with context window: ${this.defaultWindowSize} tokens.`);
  }

  // --- Conversation Management ---

  async findOrCreateConversation(
    userId: string,
    platform: string,
    provider?: string
  ): Promise<Conversation> {
    if (!this.db.isConnected()) {
      throw new Error('Database not connected. Memory unavailable.');
    }
    return this.conversationRepo.findOrCreate(userId, platform, provider);
  }

  // --- Message Management ---

  async saveMessage(
    conversationId: string,
    role: string,
    content: string
  ): Promise<Message> {
    if (!this.db.isConnected()) {
      throw new Error('Database not connected. Cannot save message.');
    }

    const tokenCount = TokenCounter.estimate(content);
    const message = await this.messageRepo.create(conversationId, role, content, tokenCount);

    // Generate embedding in background (fire and forget)
    if (this.embeddingEngine.isAvailable()) {
      this.embeddingEngine.generateInBackground(content, async (embedding) => {
        if (embedding) {
          try {
            await this.messageRepo.updateEmbedding(message.id, embedding);
          } catch (err) {
            // Silently fail — embedding is secondary
          }
        }
      });
    }

    // Check if we need to trigger summary
    await this.checkSummaryThreshold(conversationId);

    return message;
  }

  // --- Context Window ---

  async getContextWindow(conversationId: string): Promise<LlmMessage[]> {
    if (!this.db.isConnected()) {
      return [];
    }

    const conversation = await this.conversationRepo.findById(conversationId);
    const maxTokens = conversation?.context_window_size || this.defaultWindowSize;

    const messages = await this.messageRepo.findByConversationWithTokenLimit(
      conversationId,
      maxTokens
    );

    return messages.map(msg => ({
      role: msg.role as LlmMessage['role'],
      content: msg.content,
    }));
  }

  // --- Memory Search (Semantic) ---

  async memorySearch(query: string, limit: number = 5): Promise<string[]> {
    if (!this.db.isConnected() || !this.embeddingEngine.isAvailable()) {
      return [];
    }

    const queryEmbedding = await this.embeddingEngine.generateEmbedding(query);
    if (!queryEmbedding) {
      return [];
    }

    const results = await this.messageRepo.searchByEmbedding(queryEmbedding, limit);
    return results.map(msg => {
      const date = new Date(msg.created_at).toLocaleDateString('pt-BR');
      return `[${date} | ${msg.role}]: ${msg.content}`;
    });
  }

  // --- Summary ---

  async triggerSummary(conversationId: string): Promise<string | null> {
    // This will be fully implemented when we have the AgentLoop (Fase 7).
    // For now, return null indicating summary not available.
    console.log(`[Memory] Summary triggered for conversation ${conversationId}. (Not yet implemented)`);
    return null;
  }

  // --- Recovery ---

  async getConversationState(conversationId: string): Promise<{
    conversation: Conversation | null;
    messageCount: number;
    tokenCount: number;
  }> {
    if (!this.db.isConnected()) {
      return { conversation: null, messageCount: 0, tokenCount: 0 };
    }

    const conversation = await this.conversationRepo.findById(conversationId);
    const messages = await this.messageRepo.findByConversation(conversationId);
    const tokenCount = await this.messageRepo.countTokensInConversation(conversationId);

    return {
      conversation,
      messageCount: messages.length,
      tokenCount,
    };
  }

  // --- Internal ---

  private async checkSummaryThreshold(conversationId: string): Promise<void> {
    try {
      const conversation = await this.conversationRepo.findById(conversationId);
      if (!conversation) return;

      const maxTokens = conversation.context_window_size || this.defaultWindowSize;
      const currentTokens = await this.messageRepo.countTokensInConversation(conversationId);
      const usage = currentTokens / maxTokens;

      if (usage >= SUMMARY_THRESHOLD) {
        console.log(
          `[Memory] Context window at ${Math.round(usage * 100)}% for conversation ${conversationId}. Summary needed.`
        );
        await this.triggerSummary(conversationId);
      }

      // Update token count in conversation
      await this.conversationRepo.updateTokenCount(conversationId, currentTokens);
    } catch (error) {
      // Non-fatal — don't crash the flow
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Memory] Failed to check summary threshold: ${errMsg}`);
    }
  }
}
