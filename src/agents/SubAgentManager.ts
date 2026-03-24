// ============================================================
// TurionZ — Sub-Agent Manager
// Created by BollaNetwork
// ============================================================

import { Database } from '../infra/database';
import { AgentLoop } from '../core/AgentLoop';
import { ILlmProvider } from '../providers/ILlmProvider';
import { ProviderFactory } from '../providers/ProviderFactory';
import { ToolRegistry } from '../tools/ToolRegistry';
import {
  AgentLoopInput,
  AgentLoopOutput,
  AgentConfig,
  AgentLevel,
  AgentRole,
  AgentStatus,
  MessageFlags,
} from '../types';

const MAX_SUB_SUB_AGENTS = 3;

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

  private constructor() {
    this.db = Database.getInstance();
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
    const level: AgentLevel = params.parentId ? 2 : 1;
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
      // Create provider with inherited model
      const provider = ProviderFactory.create(agent.model);

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

      // Auto-create verifier if level 1 and role is worker
      if (agent.level === 1 && agent.role === 'worker' && result.status === 'completed') {
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

  // --- Verifier ---

  private async ensureVerifier(
    parentId: string,
    parent: SubAgentRecord,
    workResult: string
  ): Promise<void> {
    // Check if parent already has a verifier
    const children = await this.getChildren(parentId);
    const hasVerifier = children.some(c => c.role === 'verifier');

    if (hasVerifier) return;

    console.log(`[SubAgentManager] Auto-creating verifier for sub-agent ${parentId}`);

    const verifierId = await this.createSubAgent({
      parentId,
      briefing: `You are a verifier. Review and test the following work result against these criteria:

CRITERIA: ${parent.criteria}

WORK RESULT:
${workResult}

Verify: Does the work meet all criteria? Are there any errors or issues?
Respond with a clear PASS or FAIL verdict and explain why.`,
      model: parent.model,
      role: 'verifier',
    });

    await this.runSubAgent(verifierId);
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

    await this.db.execute(
      `INSERT INTO agent_dependencies (agent_id, depends_on_agent_id)
       VALUES ($1, $2)`,
      [agentId, dependsOnId]
    );
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
