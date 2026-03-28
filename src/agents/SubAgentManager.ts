// ============================================================
// TurionZ — Sub-Agent Manager
// Created by BollaNetwork
// ============================================================

import { EventEmitter } from 'events';
import { Database } from '../infra/database';
import { SchemaManager } from '../infra/SchemaManager';
import { ActivityLogger } from '../infra/ActivityLogger';
import { AgentLoop } from '../core/AgentLoop';
import { ILlmProvider } from '../providers/ILlmProvider';
import { ProviderFactory } from '../providers/ProviderFactory';
import { ToolRegistry } from '../tools/ToolRegistry';
import {
  AgentLoopInput,
  AgentLoopOutput,
  AgentLoopMetrics,
  AgentConfig,
  AgentLevel,
  AgentRole,
  AgentStatus,
  MessageFlags,
} from '../types';

const MAX_SUB_SUB_AGENTS = 3;
const MAX_VERIFIER_RETRIES = 3;
const MAX_AGENT_LEVELS = 3; // TurionZ(0) → sub-agent(1) → sub-sub-agent(2)
const DEFAULT_DEPENDENCY_TIMEOUT = 300000; // 5 minutes

interface SubAgentRecord {
  id: string;
  parentId: string | null;
  level: AgentLevel;
  role: AgentRole;
  model: string;
  briefing: string;
  skills: string[];
  criteria: string;
  config: AgentConfig;
  status: AgentStatus;
  result: string | null;
}

interface SubAgentCreateParams {
  briefing: string;
  model: string;
  skills?: string[];
  criteria?: string;
  dependencies?: string[];
  role?: AgentRole;
  parentId?: string;
}

interface AgentTreeNode {
  id: string;
  role: AgentRole;
  model: string;
  level: AgentLevel;
  status: AgentStatus;
  children: AgentTreeNode[];
  metrics?: AgentMetricsSummary | null;
}

interface AgentMetricsSummary {
  tokensIn: number;
  tokensOut: number;
  duration: number;
  toolsCalled: string[];
  iterations: number;
}

export class SubAgentManager {
  private static instance: SubAgentManager;
  private db: Database;
  private activityLogger: ActivityLogger;
  private activeAgents: Map<string, AgentLoop> = new Map();
  private onProgress?: (agentId: string, message: string) => void;
  private agentEvents: EventEmitter = new EventEmitter();

  private tablesReady: boolean = false;

  private constructor() {
    this.db = Database.getInstance();
    this.activityLogger = ActivityLogger.getInstance();
    // Allow many listeners for concurrent agents waiting on dependencies
    this.agentEvents.setMaxListeners(100);
  }

  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    const schema = SchemaManager.getInstance();
    await schema.ensureTables('agents', 'agent_communications', 'agent_dependencies');
    this.tablesReady = true;
  }

  static getInstance(): SubAgentManager {
    if (!SubAgentManager.instance) {
      SubAgentManager.instance = new SubAgentManager();
    }
    return SubAgentManager.instance;
  }

  setProgressCallback(callback: (agentId: string, message: string) => void): void {
    this.onProgress = callback;
  }

  // --- Create Sub-Agent ---

  async createSubAgent(params: SubAgentCreateParams): Promise<string> {
    await this.ensureTables();

    // Determine level based on parent
    let level: AgentLevel;
    if (!params.parentId) {
      level = 1;
    } else {
      const parent = await this.getAgent(params.parentId);
      if (!parent) {
        throw new Error(`Parent agent ${params.parentId} not found.`);
      }
      // Block sub-sub-agents (level 2) from creating children
      if (parent.level === 2) {
        throw new Error(
          `Sub-sub-agents cannot create children (max ${MAX_AGENT_LEVELS} levels: TurionZ → sub-agent → sub-sub-agent).`
        );
      }
      level = (parent.level + 1) as AgentLevel;
    }

    const role = params.role || 'worker';

    // Enforce max sub-sub-agents
    if (level === 2 && params.parentId) {
      const childCount = await this.countChildren(params.parentId);
      if (childCount >= MAX_SUB_SUB_AGENTS) {
        throw new Error(
          `Cannot create sub-sub-agent: parent already has ${childCount}/${MAX_SUB_SUB_AGENTS} children.`
        );
      }
    }

    // Save to database
    const agentId = await this.saveAgent({
      parentId: params.parentId || null,
      level,
      role,
      model: params.model,
      briefing: params.briefing,
      skills: params.skills || [],
      criteria: params.criteria || '',
      config: { model: params.model, skills: params.skills || [], criteria: params.criteria || '', maxIterations: 5 },
      status: 'created',
    });

    // Save dependencies
    if (params.dependencies) {
      for (const depId of params.dependencies) {
        await this.saveDependency(agentId, depId);
      }
    }

    console.log(
      `[SubAgentManager] Created ${role} sub-agent (level ${level}): ${agentId} — model: ${params.model}`
    );

    // Log agent creation
    await this.activityLogger.logAgentLifecycle(agentId, 'create', {
      role,
      level,
      model: params.model,
      parentId: params.parentId || null,
    });

    return agentId;
  }

  // --- Run Sub-Agent ---

  async runSubAgent(agentId: string): Promise<AgentLoopOutput> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Sub-agent ${agentId} not found.`);
    }

    // Wait for dependencies
    await this.waitForDependencies(agentId);

    // Update status
    await this.updateStatus(agentId, 'running');

    console.log(`[SubAgentManager] Running sub-agent ${agentId} (${agent.role})...`);

    // Log agent run start
    await this.activityLogger.logAgentLifecycle(agentId, 'run', {
      role: agent.role,
      model: agent.model,
    });

    try {
      // Create provider via OpenRouter (sub-agents use OpenRouter for model variety)
      const provider = ProviderFactory.createForSubAgent(agent.model);

      // Build system prompt for sub-agent
      const systemPrompt = this.buildSubAgentPrompt(agent);

      // Get tools (inherits from TurionZ registry)
      const tools = ToolRegistry.getInstance().toDefinitions();

      const input: AgentLoopInput = {
        messages: [{ role: 'user', content: agent.briefing }],
        systemPrompt,
        tools,
        flags: { requires_audio_reply: false, source_type: 'text' },
        config: {
          maxIterations: agent.config.maxIterations || 5,
          llmTimeout: 120000,
          retryAttempts: 3,
          maxToolsPerRound: 5,
        },
      };

      // Run the agent loop with detailed progress tracking
      const progressCb = (msg: string) => {
        const detailedMsg = `Sub-agent ${agent.role} (${agent.model}): ${msg}`;
        if (this.onProgress) {
          this.onProgress(agentId, detailedMsg);
        }
      };

      const loop = new AgentLoop(provider, progressCb);
      this.activeAgents.set(agentId, loop);

      const result = await loop.run(input);

      this.activeAgents.delete(agentId);

      // Save result
      await this.updateResult(agentId, result.response, result.status === 'completed' ? 'completed' : 'failed');

      // Save metrics to DB
      await this.saveMetrics(agentId, result.metrics);

      // Auto-create verifier for ALL workers (level 1 AND level 2), not just level 1
      if (agent.role === 'worker' && (result.status === 'completed' || result.status === 'max_iterations')) {
        await this.ensureVerifier(agentId, agent, result.response);
      }

      // Emit completion event for event-based dependency waiting
      this.agentEvents.emit(`agent:completed:${agentId}`, agent.status);

      // Log agent completion
      await this.activityLogger.logAgentLifecycle(agentId, result.status === 'completed' ? 'complete' : 'fail', {
        status: result.status,
        duration: result.metrics.totalDuration,
        tokensIn: result.metrics.totalTokensIn,
        tokensOut: result.metrics.totalTokensOut,
      });

      console.log(`[SubAgentManager] Sub-agent ${agentId} finished: ${result.status}`);
      return result;
    } catch (error) {
      this.activeAgents.delete(agentId);
      await this.updateStatus(agentId, 'failed');

      // Log agent failure
      await this.activityLogger.logAgentLifecycle(agentId, 'fail', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Emit completion event even on failure so waiters don't hang
      this.agentEvents.emit(`agent:completed:${agentId}`, 'failed');
      throw error;
    }
  }

  // --- Verifier with Retry Loop ---

  private async ensureVerifier(
    parentId: string,
    parent: SubAgentRecord,
    workResult: string,
    maxRetries: number = MAX_VERIFIER_RETRIES
  ): Promise<void> {
    // Check if parent already has a verifier
    const children = await this.getChildren(parentId);
    const hasVerifier = children.some(c => c.role === 'verifier');

    if (hasVerifier) return;

    console.log(`[SubAgentManager] Auto-creating verifier for sub-agent ${parentId}`);

    let currentResult = workResult;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      const verifierId = await this.createSubAgent({
        parentId,
        briefing: `You are a verifier. Review and test the following work result against these criteria:

CRITERIA: ${parent.criteria}

WORK RESULT:
${currentResult}

Verify: Does the work meet all criteria? Are there any errors or issues?
Respond with a clear PASS or FAIL verdict and explain why.`,
        model: parent.model,
        role: 'verifier',
      });

      const verifierResult = await this.runSubAgent(verifierId);
      const verdict = this.parseVerdict(verifierResult.response);

      if (verdict === 'PASS') {
        console.log(`[SubAgentManager] Verifier PASSED for sub-agent ${parentId}`);
        return;
      }

      retryCount++;
      console.log(
        `[SubAgentManager] Verifier FAILED for sub-agent ${parentId} (attempt ${retryCount}/${maxRetries})`
      );

      if (retryCount >= maxRetries) {
        // Max retries exhausted — mark parent as completed_with_issues
        console.log(
          `[SubAgentManager] Max verifier retries (${maxRetries}) reached for ${parentId}. Marking as completed_with_issues.`
        );
        await this.updateStatus(parentId, 'completed_with_issues');
        await this.updateResult(
          parentId,
          currentResult + `\n\n[VERIFIER NOTE: Failed verification after ${maxRetries} attempts. Last feedback: ${verifierResult.response}]`,
          'completed_with_issues'
        );
        return;
      }

      // Sub-agent corrects based on verifier feedback — re-run the worker
      console.log(`[SubAgentManager] Re-running sub-agent ${parentId} with verifier feedback...`);
      const correctionResult = await this.rerunWithFeedback(parentId, parent, currentResult, verifierResult.response);
      currentResult = correctionResult.response;
    }
  }

  private parseVerdict(response: string): 'PASS' | 'FAIL' {
    const upper = response.toUpperCase();
    // Look for explicit PASS/FAIL verdict
    if (upper.includes('VERDICT: PASS') || upper.includes('VERDICT:PASS')) return 'PASS';
    if (upper.includes('VERDICT: FAIL') || upper.includes('VERDICT:FAIL')) return 'FAIL';
    // Fallback: check for PASS/FAIL keywords near the end
    const lastChunk = upper.slice(-200);
    if (lastChunk.includes('PASS')) return 'PASS';
    return 'FAIL';
  }

  private async rerunWithFeedback(
    agentId: string,
    agent: SubAgentRecord,
    previousResult: string,
    verifierFeedback: string
  ): Promise<AgentLoopOutput> {
    await this.updateStatus(agentId, 'running');

    const provider = ProviderFactory.createForSubAgent(agent.model);
    const systemPrompt = this.buildSubAgentPrompt(agent);
    const tools = ToolRegistry.getInstance().toDefinitions();

    const input: AgentLoopInput = {
      messages: [
        { role: 'user', content: agent.briefing },
        { role: 'assistant', content: previousResult },
        {
          role: 'user',
          content: `The verifier found issues with your work:\n\n${verifierFeedback}\n\nPlease correct the issues and provide an updated result.`,
        },
      ],
      systemPrompt,
      tools,
      flags: { requires_audio_reply: false, source_type: 'text' },
      config: {
        maxIterations: agent.config.maxIterations || 5,
        llmTimeout: 120000,
        retryAttempts: 3,
        maxToolsPerRound: 5,
      },
    };

    const progressCb = (msg: string) => {
      if (this.onProgress) {
        this.onProgress(agentId, msg);
      }
    };

    const loop = new AgentLoop(provider, progressCb);
    this.activeAgents.set(agentId, loop);

    const result = await loop.run(input);
    this.activeAgents.delete(agentId);

    await this.updateResult(agentId, result.response, result.status === 'completed' ? 'completed' : 'failed');
    await this.saveMetrics(agentId, result.metrics);

    return result;
  }

  // --- Communication ---

  async communicateResult(fromId: string, toId: string, data: Record<string, unknown>): Promise<void> {
    if (!this.db.isConnected()) return;

    await this.db.execute(
      `INSERT INTO agent_communications (from_agent_id, to_agent_id, data)
       VALUES ($1, $2, $3)`,
      [fromId, toId, JSON.stringify(data)]
    );

    // Log communication event
    await this.activityLogger.logSystemEvent('sub_agent_manager', 'agent_communication', {
      from: fromId,
      to: toId,
    });

    console.log(`[SubAgentManager] Communication: ${fromId} → ${toId}`);
  }

  async getMessagesFor(agentId: string): Promise<Record<string, unknown>[]> {
    if (!this.db.isConnected()) return [];

    const rows = await this.db.query<{ data: Record<string, unknown> }>(
      `SELECT data FROM agent_communications WHERE to_agent_id = $1 ORDER BY created_at`,
      [agentId]
    );

    return rows.map(r => r.data);
  }

  // --- Control ---

  async cancelAgent(agentId: string): Promise<void> {
    const loop = this.activeAgents.get(agentId);
    if (loop) {
      loop.requestAbort();
    }
    await this.updateStatus(agentId, 'cancelled');

    // Cancel children too
    const children = await this.getChildren(agentId);
    for (const child of children) {
      await this.cancelAgent(child.id);
    }

    // Log agent cancellation
    await this.activityLogger.logAgentLifecycle(agentId, 'cancel', {});

    console.log(`[SubAgentManager] Cancelled agent ${agentId} and its children.`);
  }

  async getProgress(agentId: string): Promise<{ status: AgentStatus; childCount: number }> {
    const agent = await this.getAgent(agentId);
    const childCount = await this.countChildren(agentId);
    return {
      status: agent?.status || 'created',
      childCount,
    };
  }

  async listActive(): Promise<SubAgentRecord[]> {
    if (!this.db.isConnected()) return [];

    return this.db.query<SubAgentRecord>(
      `SELECT * FROM agents WHERE status IN ('created', 'running', 'waiting') ORDER BY created_at`
    );
  }

  // --- Internal DB Operations ---

  private async saveAgent(data: Omit<SubAgentRecord, 'id' | 'result'>): Promise<string> {
    if (!this.db.isConnected()) {
      return `local-${Date.now()}`;
    }

    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO agents (parent_id, level, role, model, briefing, skills, criteria, config, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        data.parentId,
        data.level,
        data.role,
        data.model,
        data.briefing,
        JSON.stringify(data.skills),
        data.criteria,
        JSON.stringify(data.config || {}),
        data.status,
      ]
    );

    return rows[0].id;
  }

  private async getAgent(agentId: string): Promise<SubAgentRecord | null> {
    if (!this.db.isConnected()) return null;

    return this.db.queryOne<SubAgentRecord>(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );
  }

  private async getChildren(parentId: string): Promise<SubAgentRecord[]> {
    if (!this.db.isConnected()) return [];

    return this.db.query<SubAgentRecord>(
      'SELECT * FROM agents WHERE parent_id = $1',
      [parentId]
    );
  }

  private async countChildren(parentId: string): Promise<number> {
    if (!this.db.isConnected()) return 0;

    const result = await this.db.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM agents WHERE parent_id = $1',
      [parentId]
    );

    return result ? parseInt(result.count, 10) : 0;
  }

  private async updateStatus(agentId: string, status: AgentStatus): Promise<void> {
    if (!this.db.isConnected()) return;

    const completedAt = ['completed', 'completed_with_issues', 'failed', 'cancelled'].includes(status) ? 'NOW()' : 'NULL';
    await this.db.execute(
      `UPDATE agents SET status = $1, completed_at = ${completedAt} WHERE id = $2`,
      [status, agentId]
    );
  }

  private async updateResult(agentId: string, result: string, status: AgentStatus): Promise<void> {
    if (!this.db.isConnected()) return;

    await this.db.execute(
      `UPDATE agents SET result = $1, status = $2, completed_at = NOW() WHERE id = $3`,
      [result, status, agentId]
    );
  }

  private async saveDependency(agentId: string, dependsOnId: string): Promise<void> {
    if (!this.db.isConnected()) return;

    // Detect circular dependencies before inserting
    await this.detectCircularDependency(agentId, dependsOnId);

    await this.db.execute(
      `INSERT INTO agent_dependencies (agent_id, depends_on_agent_id)
       VALUES ($1, $2)`,
      [agentId, dependsOnId]
    );
  }

  private async detectCircularDependency(agentId: string, dependsOnId: string): Promise<void> {
    // Walk the dependency graph from dependsOnId upward
    // If we find agentId in the chain → circular dependency
    const visited = new Set<string>();
    const chain: string[] = [agentId, dependsOnId];

    let currentId = dependsOnId;

    while (currentId) {
      if (currentId === agentId) {
        throw new Error(
          `Circular dependency detected: ${chain.join(' → ')}`
        );
      }

      if (visited.has(currentId)) break;
      visited.add(currentId);

      // Get what currentId depends on
      const deps = await this.db.query<{ depends_on_agent_id: string }>(
        `SELECT depends_on_agent_id FROM agent_dependencies WHERE agent_id = $1`,
        [currentId]
      );

      if (deps.length === 0) break;

      // Follow the first dependency (for chain reporting)
      // But check ALL dependencies for cycles
      for (const dep of deps) {
        if (dep.depends_on_agent_id === agentId) {
          chain.push(dep.depends_on_agent_id);
          throw new Error(
            `Circular dependency detected: ${chain.join(' → ')}`
          );
        }
      }

      currentId = deps[0].depends_on_agent_id;
      chain.push(currentId);
    }
  }

  async saveMetrics(agentId: string, metrics: AgentLoopMetrics): Promise<void> {
    if (!this.db.isConnected()) return;

    const metricsData = {
      tokensIn: metrics.totalTokensIn,
      tokensOut: metrics.totalTokensOut,
      duration: metrics.totalDuration,
      toolsCalled: metrics.toolsCalled,
      iterations: metrics.iterationsUsed,
    };

    await this.db.execute(
      `UPDATE agents SET metrics = $1 WHERE id = $2`,
      [JSON.stringify(metricsData), agentId]
    );

    console.log(`[SubAgentManager] Saved metrics for agent ${agentId}: ${metrics.totalDuration}ms, ${metrics.totalTokensIn}in/${metrics.totalTokensOut}out tokens`);
  }

  private async waitForDependencies(agentId: string, timeout: number = DEFAULT_DEPENDENCY_TIMEOUT): Promise<void> {
    if (!this.db.isConnected()) return;

    const deps = await this.db.query<{ depends_on_agent_id: string; resolved: boolean }>(
      `SELECT depends_on_agent_id, resolved FROM agent_dependencies WHERE agent_id = $1`,
      [agentId]
    );

    const pendingDeps = deps.filter(d => !d.resolved);
    if (pendingDeps.length === 0) return;

    console.log(`[SubAgentManager] Agent ${agentId} waiting for ${pendingDeps.length} dependencies...`);
    await this.updateStatus(agentId, 'waiting');

    for (const dep of pendingDeps) {
      // First check if already completed (fast path)
      const depAgent = await this.getAgent(dep.depends_on_agent_id);
      if (depAgent && this.isTerminalStatus(depAgent.status)) {
        await this.resolveDependency(agentId, dep.depends_on_agent_id);
        continue;
      }

      // Event-based waiting with polling fallback
      await this.waitForAgentCompletion(dep.depends_on_agent_id, timeout);
      await this.resolveDependency(agentId, dep.depends_on_agent_id);
    }
  }

  private isTerminalStatus(status: AgentStatus): boolean {
    return ['completed', 'completed_with_issues', 'failed', 'cancelled'].includes(status);
  }

  private waitForAgentCompletion(depAgentId: string, timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      // Event listener (primary mechanism)
      const onComplete = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);
        clearInterval(pollTimer);
        resolve();
      };

      this.agentEvents.once(`agent:completed:${depAgentId}`, onComplete);

      // Timeout guard
      const timeoutTimer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.agentEvents.removeListener(`agent:completed:${depAgentId}`, onComplete);
        clearInterval(pollTimer);
        reject(new Error(`Dependency wait timeout: agent ${depAgentId} did not complete within ${timeout / 1000}s`));
      }, timeout);

      // Polling fallback (every 5s) in case event was missed
      const pollTimer = setInterval(async () => {
        if (resolved) {
          clearInterval(pollTimer);
          return;
        }
        try {
          const agent = await this.getAgent(depAgentId);
          if (agent && this.isTerminalStatus(agent.status)) {
            onComplete();
          }
        } catch {
          // Ignore poll errors — event or timeout will handle
        }
      }, 5000);
    });
  }

  private async resolveDependency(agentId: string, dependsOnId: string): Promise<void> {
    await this.db.execute(
      `UPDATE agent_dependencies SET resolved = TRUE, resolved_at = NOW()
       WHERE agent_id = $1 AND depends_on_agent_id = $2`,
      [agentId, dependsOnId]
    );
  }

  // --- Agent Tree & Metrics ---

  async getAgentTree(rootId?: string): Promise<AgentTreeNode[]> {
    if (!this.db.isConnected()) return [];

    // Get root-level agents (level 1, no parent) or specific root
    let roots: SubAgentRecord[];
    if (rootId) {
      const agent = await this.getAgent(rootId);
      roots = agent ? [agent] : [];
    } else {
      roots = await this.db.query<SubAgentRecord>(
        'SELECT * FROM agents WHERE parent_id IS NULL ORDER BY created_at'
      );
    }

    const buildTree = async (agent: SubAgentRecord): Promise<AgentTreeNode> => {
      const children = await this.getChildren(agent.id);
      const childNodes = await Promise.all(children.map(c => buildTree(c)));
      const metrics = await this.getStoredMetrics(agent.id);

      return {
        id: agent.id,
        role: agent.role,
        model: agent.model,
        level: agent.level,
        status: agent.status,
        children: childNodes,
        metrics,
      };
    };

    return Promise.all(roots.map(r => buildTree(r)));
  }

  async getAgentMetrics(agentId: string): Promise<{ own: AgentMetricsSummary | null; aggregated: AgentMetricsSummary }> {
    const own = await this.getStoredMetrics(agentId);

    // Aggregate with children
    const aggregated: AgentMetricsSummary = {
      tokensIn: own?.tokensIn || 0,
      tokensOut: own?.tokensOut || 0,
      duration: own?.duration || 0,
      toolsCalled: own?.toolsCalled ? [...own.toolsCalled] : [],
      iterations: own?.iterations || 0,
    };

    const children = await this.getChildren(agentId);
    for (const child of children) {
      const childMetrics = await this.getAgentMetrics(child.id);
      aggregated.tokensIn += childMetrics.aggregated.tokensIn;
      aggregated.tokensOut += childMetrics.aggregated.tokensOut;
      aggregated.duration += childMetrics.aggregated.duration;
      aggregated.toolsCalled.push(...childMetrics.aggregated.toolsCalled);
      aggregated.iterations += childMetrics.aggregated.iterations;
    }

    return { own, aggregated };
  }

  private async getStoredMetrics(agentId: string): Promise<AgentMetricsSummary | null> {
    if (!this.db.isConnected()) return null;

    const row = await this.db.queryOne<{ metrics: AgentMetricsSummary | null }>(
      'SELECT metrics FROM agents WHERE id = $1',
      [agentId]
    );

    return row?.metrics || null;
  }

  private buildSubAgentPrompt(agent: SubAgentRecord): string {
    const roleDesc = agent.role === 'verifier'
      ? 'You are a verifier sub-agent. Your job is to test and validate work results.'
      : 'You are a specialized sub-agent. Complete the assigned task thoroughly.';

    return `${roleDesc}

Your model: ${agent.model}
Your role: ${agent.role}
Criteria for success: ${agent.criteria || 'Complete the task as described.'}

Important rules:
- Complete the task described in the briefing.
- Be thorough and precise.
- Report any issues found.
- Do not modify configurations you inherited.`;
  }
}
