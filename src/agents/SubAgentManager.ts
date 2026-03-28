// ============================================================
// TurionZ — Sub-Agent Manager
// Created by BollaNetwork
// ============================================================

import { Database } from '../infra/database';
import { SchemaManager } from '../infra/SchemaManager';
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

export class SubAgentManager {
  private static instance: SubAgentManager;
  private db: Database;
  private activeAgents: Map<string, AgentLoop> = new Map();
  private onProgress?: (agentId: string, message: string) => void;

  private tablesReady: boolean = false;

  private constructor() {
    this.db = Database.getInstance();
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

      // Run the agent loop
      const progressCb = (msg: string) => {
        if (this.onProgress) {
          this.onProgress(agentId, msg);
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

      console.log(`[SubAgentManager] Sub-agent ${agentId} finished: ${result.status}`);
      return result;
    } catch (error) {
      this.activeAgents.delete(agentId);
      await this.updateStatus(agentId, 'failed');
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

    const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? 'NOW()' : 'NULL';
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

  private async waitForDependencies(agentId: string): Promise<void> {
    if (!this.db.isConnected()) return;

    const deps = await this.db.query<{ depends_on_agent_id: string; resolved: boolean }>(
      `SELECT depends_on_agent_id, resolved FROM agent_dependencies WHERE agent_id = $1`,
      [agentId]
    );

    for (const dep of deps) {
      if (dep.resolved) continue;

      // Poll until dependency completes (max 5 min)
      const maxWait = 300000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const depAgent = await this.getAgent(dep.depends_on_agent_id);
        if (depAgent && ['completed', 'failed', 'cancelled'].includes(depAgent.status)) {
          await this.db.execute(
            `UPDATE agent_dependencies SET resolved = TRUE, resolved_at = NOW()
             WHERE agent_id = $1 AND depends_on_agent_id = $2`,
            [agentId, dep.depends_on_agent_id]
          );
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
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
