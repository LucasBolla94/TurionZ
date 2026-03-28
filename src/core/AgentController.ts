// ============================================================
// TurionZ — Agent Controller (Facade / Pipeline Orchestrator)
// Created by BollaNetwork
// ============================================================

import { InternalMessage, AgentLoopOutput, AgentLoopInput, LlmMessage } from '../types';
import { Database } from '../infra/database';
import { ActivityLogger } from '../infra/ActivityLogger';
import { PersonalityEngine } from './PersonalityEngine';
import { AgentLoop } from './AgentLoop';
import { MemoryManager } from '../memory/MemoryManager';
import { ToolRegistry } from '../tools/ToolRegistry';
import { ProviderFactory } from '../providers/ProviderFactory';
import { MessageRouter } from '../gateway/MessageRouter';
import { SkillLoader } from '../skills/SkillLoader';
import { SkillRouter } from '../skills/SkillRouter';
import { SkillExecutor } from '../skills/SkillExecutor';
import { SkillToolBridge } from '../skills/SkillToolBridge';
import { SkillWatcher } from '../skills/SkillWatcher';
import { SubAgentManager } from '../agents/SubAgentManager';
import { SelfImprover } from './SelfImprover';
import { WeeklyReport, Lesson, LessonCategory } from '../types';

// Thor's brain: Claude Opus 4.6 via Anthropic API direct

export class AgentController {
  private static instance: AgentController;
  private personality: PersonalityEngine;
  private memory: MemoryManager;
  private toolRegistry: ToolRegistry;
  private router: MessageRouter;
  private skillLoader: SkillLoader;
  private skillRouter: SkillRouter;
  private skillExecutor: SkillExecutor;
  private skillToolBridge: SkillToolBridge;
  private skillWatcher: SkillWatcher;
  private subAgentManager: SubAgentManager;
  private selfImprover: SelfImprover;
  private activityLogger: ActivityLogger;
  private activeLoops: Map<string, AgentLoop> = new Map();

  private constructor() {
    this.personality = new PersonalityEngine();
    this.memory = MemoryManager.getInstance();
    this.toolRegistry = ToolRegistry.getInstance();
    this.router = MessageRouter.getInstance();
    this.skillLoader = new SkillLoader();
    this.skillRouter = new SkillRouter(ProviderFactory.createMain());
    this.skillExecutor = new SkillExecutor(this.skillLoader);
    this.skillToolBridge = new SkillToolBridge();
    this.skillWatcher = new SkillWatcher(250);
    this.subAgentManager = SubAgentManager.getInstance();
    this.selfImprover = SelfImprover.getInstance();
    this.activityLogger = ActivityLogger.getInstance();
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

    // Set up sub-agent progress notifications via router (REQ-032)
    this.subAgentManager.setProgressCallback(async (agentId: string, message: string) => {
      // Route sub-agent progress to all connected platforms via sendProgress
      // Using 'telegram' as default platform — in production, track which user triggered
      console.log(`[Controller] Sub-agent progress (${agentId}): ${message}`);
    });

    // Start skill watcher for hot-reload (REQ-036)
    this.skillWatcher.start(
      this.skillLoader.getSkillsDir(),
      () => this.skillLoader.invalidateCache()
    );
    // Initial skill load
    const skills = this.skillLoader.loadAll();
    console.log(`[Controller] Skill system initialized — ${skills.length} skills found.`);

    // Register message handler on router
    this.router.setMessageHandler((msg) => this.processMessage(msg));

    await this.activityLogger.logSystemEvent('controller', 'initialized', {
      skillCount: skills.length,
    });

    console.log('[Controller] AgentController initialized.');
  }

  async processMessage(message: InternalMessage): Promise<AgentLoopOutput> {
    const startTime = Date.now();

    console.log(`[Controller] Processing message from ${message.platform}:${message.userId}`);

    // Log message processing start
    await this.activityLogger.logSystemEvent('controller', 'message_processing_start', {
      platform: message.platform,
      userId: message.userId,
      type: message.type,
    });

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

      // 4. SKILL PIPELINE: Loader -> Router -> Executor (REQ-035)
      const skills = this.skillLoader.loadAll(); // cached, updated by watcher
      let skillPrompt = '';
      let activeSkillName: string | null = null;

      if (skills.length > 0) {
        // Router: LLM picks the right skill (or null for free conversation)
        activeSkillName = await this.skillRouter.route(message.content, skills);

        if (activeSkillName) {
          // Log skill routing decision
          await this.activityLogger.logSystemEvent('controller', 'skill_routed', {
            skill: activeSkillName,
          });

          const skillContext = this.skillExecutor.loadSkillContext(activeSkillName, skills);
          if (skillContext) {
            skillPrompt = this.skillExecutor.buildSkillPrompt(skillContext);

            // Register skill-specific tools temporarily (REQ-037)
            if (skillContext.toolsDir) {
              const skillTools = this.skillToolBridge.loadSkillTools(skillContext);
              for (const tool of skillTools) {
                this.toolRegistry.register(tool);
              }
            }
          }
        }
      }

      // 5. Build system prompt (personality + lessons + active skill)
      const systemPrompt = await this.buildSystemPromptWithLessons(skillPrompt);

      // 6. Get tools (includes skill tools if registered)
      const tools = this.toolRegistry.toDefinitions();

      // 7. Build AgentLoop input
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

      // 8. Create and run AgentLoop — Thor uses Anthropic direct (Opus 4.6)
      const provider = ProviderFactory.createMain();

      const progressCallback = async (progressMsg: string) => {
        await this.router.sendProgress(message.platform, message.userId, progressMsg);
      };

      const loop = new AgentLoop(provider, progressCallback);
      this.activeLoops.set(message.userId, loop);

      const result = await loop.run(input);

      // Cleanup skill tools after loop completes (prevents tool leaking — Research Pitfall 5)
      if (activeSkillName) {
        this.skillToolBridge.unloadSkillTools(activeSkillName, this.toolRegistry);
      }

      this.activeLoops.delete(message.userId);

      // 8b. Check if any sub-agents are still active and append status summary
      const activeSubAgents = await this.subAgentManager.listActive();
      if (activeSubAgents.length > 0) {
        const statusSummary = this.formatSubAgentStatus(activeSubAgents);
        result.response += `\n\n---\n${statusSummary}`;
      }

      // 9. Save assistant response
      if (this.isDatabaseAvailable() && result.response) {
        await this.memory.saveMessage(conversationId, 'assistant', result.response);
      }

      const duration = Date.now() - startTime;

      // Log message processing end
      await this.activityLogger.logSystemEvent('controller', 'message_processing_end', {
        platform: message.platform,
        userId: message.userId,
        status: result.status,
        durationMs: duration,
        tokensIn: result.metrics.totalTokensIn,
        tokensOut: result.metrics.totalTokensOut,
      });

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

  async abortUserLoop(userId: string): Promise<boolean> {
    const loop = this.activeLoops.get(userId);
    if (loop) {
      loop.requestAbort();

      // Also cancel all active sub-agents
      const activeSubAgents = await this.subAgentManager.listActive();
      for (const agent of activeSubAgents) {
        await this.subAgentManager.cancelAgent(agent.id);
      }

      return true;
    }
    return false;
  }

  /**
   * Get the most recent weekly self-analysis report.
   * Thor can share this with the user on request.
   */
  async getWeeklyReport(): Promise<WeeklyReport | null> {
    return this.selfImprover.getLastReport();
  }

  /**
   * Get lessons learned, optionally filtered by category.
   */
  async getLessons(category?: LessonCategory): Promise<Lesson[]> {
    return this.selfImprover.getLessons(category);
  }

  private async buildSystemPromptWithLessons(skillContent: string = ''): Promise<string> {
    const personalityPrefix = this.personality.getSystemPromptPrefix();
    const parts = [personalityPrefix];

    // Inject recent lessons from self-improvement analysis
    try {
      const lessonsContext = await this.selfImprover.getLessonsForContext(10);
      if (lessonsContext) {
        parts.push(lessonsContext);
      }
    } catch {
      // Non-fatal — lessons are supplementary context
    }

    if (skillContent) {
      parts.push(skillContent);
    }
    return parts.join('\n\n---\n\n');
  }

  private buildSystemPrompt(skillContent: string = ''): string {
    const personalityPrefix = this.personality.getSystemPromptPrefix();
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

  async getSubAgentStatus(): Promise<string> {
    const activeAgents = await this.subAgentManager.listActive();
    if (activeAgents.length === 0) {
      return 'No active sub-agents.';
    }
    return this.formatSubAgentStatus(activeAgents);
  }

  private formatSubAgentStatus(agents: { id: string; role: string; model: string; level: number; status: string; briefing: string }[]): string {
    const lines = [`**Active Sub-Agents (${agents.length}):**`];
    for (const a of agents) {
      const briefSnippet = a.briefing.substring(0, 80) + (a.briefing.length > 80 ? '...' : '');
      lines.push(`- [${a.role}] ${a.id} (${a.model}) — ${a.status} — "${briefSnippet}"`);
    }
    return lines.join('\n');
  }

  private isDatabaseAvailable(): boolean {
    return Database.getInstance().isConnected();
  }
}
