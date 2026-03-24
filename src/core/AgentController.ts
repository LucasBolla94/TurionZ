// ============================================================
// TurionZ — Agent Controller (Facade / Pipeline Orchestrator)
// Created by BollaNetwork
// ============================================================

import { InternalMessage, AgentLoopOutput, AgentLoopInput, LlmMessage } from '../types';
import { Database } from '../infra/database';
import { PersonalityEngine } from './PersonalityEngine';
import { AgentLoop } from './AgentLoop';
import { MemoryManager } from '../memory/MemoryManager';
import { ToolRegistry } from '../tools/ToolRegistry';
import { ProviderFactory } from '../providers/ProviderFactory';
import { MessageRouter } from '../gateway/MessageRouter';

// Thor's brain: Claude Opus 4.6 via Anthropic API direct

export class AgentController {
  private static instance: AgentController;
  private personality: PersonalityEngine;
  private memory: MemoryManager;
  private toolRegistry: ToolRegistry;
  private router: MessageRouter;
  private activeLoops: Map<string, AgentLoop> = new Map();

  private constructor() {
    this.personality = new PersonalityEngine();
    this.memory = MemoryManager.getInstance();
    this.toolRegistry = ToolRegistry.getInstance();
    this.router = MessageRouter.getInstance();
  }

  static getInstance(): AgentController {
    if (!AgentController.instance) {
      AgentController.instance = new AgentController();
    }
    return AgentController.instance;
  }

  async initialize(): Promise<void> {
    // Load personality
    this.personality.load();

    // Register message handler on router
    this.router.setMessageHandler((msg) => this.processMessage(msg));

    console.log('[Controller] AgentController initialized.');
  }

  async processMessage(message: InternalMessage): Promise<AgentLoopOutput> {
    const startTime = Date.now();

    console.log(`[Controller] Processing message from ${message.platform}:${message.userId}`);

    try {
      // 1. Get or create conversation
      let conversationId = message.conversationId;
      if (this.memory && this.isDatabaseAvailable()) {
        const conversation = await this.memory.findOrCreateConversation(
          message.userId,
          message.platform
        );
        conversationId = conversation.id;

        // 2. Save user message
        await this.memory.saveMessage(conversationId, 'user', message.content);
      }

      // 3. Get context window (past messages)
      let contextMessages = await this.getContextMessages(conversationId);

      // If no DB, at least include the current message
      if (contextMessages.length === 0) {
        contextMessages = [{ role: 'user' as const, content: message.content }];
      }

      // 4. Build system prompt (personality + skill if active)
      const systemPrompt = this.buildSystemPrompt();

      // 5. Get tools
      const tools = this.toolRegistry.toDefinitions();

      // 6. Build AgentLoop input
      const maxIterations = parseInt(process.env.MAX_ITERATIONS || '5', 10);
      const input: AgentLoopInput = {
        messages: contextMessages,
        systemPrompt,
        tools,
        flags: message.flags,
        config: {
          maxIterations,
          llmTimeout: 120000,
          retryAttempts: 3,
          maxToolsPerRound: 5,
        },
      };

      // 7. Create and run AgentLoop — Thor uses Anthropic direct (Opus 4.6)
      const provider = ProviderFactory.createMain();

      const progressCallback = async (progressMsg: string) => {
        await this.router.sendProgress(message.platform, message.userId, progressMsg);
      };

      const loop = new AgentLoop(provider, progressCallback);
      this.activeLoops.set(message.userId, loop);

      const result = await loop.run(input);

      this.activeLoops.delete(message.userId);

      // 8. Save assistant response
      if (this.isDatabaseAvailable() && result.response) {
        await this.memory.saveMessage(conversationId, 'assistant', result.response);
      }

      const duration = Date.now() - startTime;
      console.log(
        `[Controller] Message processed in ${duration}ms — status: ${result.status}`
      );

      return result;
    } catch (error) {
      this.activeLoops.delete(message.userId);
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Controller] Error: ${errMsg}`);

      return {
        response: 'Ocorreu um erro interno ao processar sua mensagem. Tente novamente.',
        flags: message.flags,
        metrics: {
          totalDuration: Date.now() - startTime,
          totalTokensIn: 0,
          totalTokensOut: 0,
          iterationsUsed: 0,
          toolsCalled: [],
        },
        status: 'error',
      };
    }
  }

  abortUserLoop(userId: string): boolean {
    const loop = this.activeLoops.get(userId);
    if (loop) {
      loop.requestAbort();
      return true;
    }
    return false;
  }

  private buildSystemPrompt(): string {
    const personalityPrefix = this.personality.getSystemPromptPrefix();

    // TODO: In Fase 12, skill content will be injected here
    const skillContent = '';

    const parts = [personalityPrefix];
    if (skillContent) {
      parts.push(skillContent);
    }

    return parts.join('\n\n---\n\n');
  }

  private async getContextMessages(conversationId: string): Promise<LlmMessage[]> {
    if (!this.isDatabaseAvailable()) {
      return [];
    }

    try {
      return await this.memory.getContextWindow(conversationId);
    } catch {
      return [];
    }
  }

  private isDatabaseAvailable(): boolean {
    return Database.getInstance().isConnected();
  }
}
