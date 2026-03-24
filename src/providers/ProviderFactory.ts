// ============================================================
// TurionZ — Provider Factory
// Created by BollaNetwork
//
// TurionZ (Thor) → Anthropic API direto (Claude Opus 4.6)
// Sub-agents     → OpenRouter (modelos variados, custo otimizado)
// ============================================================

import { ILlmProvider } from './ILlmProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { VaultManager } from '../security/VaultManager';

const DEFAULT_MAIN_MODEL = 'claude-opus-4-6';

export class ProviderFactory {
  /**
   * Create the MAIN provider for TurionZ (Thor).
   * Uses Anthropic API directly with Claude Opus 4.6.
   */
  static createMain(model?: string): ILlmProvider {
    const vault = VaultManager.getInstance();
    const apiKey = vault.readOrEnv('anthropic_api_key', 'ANTHROPIC_API_KEY');

    if (!apiKey) {
      throw new Error(
        'Anthropic API key not found. Set ANTHROPIC_API_KEY in .env or save it in the vault.'
      );
    }

    const selectedModel = model || process.env.MAIN_MODEL || DEFAULT_MAIN_MODEL;
    console.log(`[ProviderFactory] Main provider: Anthropic (${selectedModel})`);
    return new AnthropicProvider(apiKey, selectedModel);
  }

  /**
   * Create a provider for SUB-AGENTS.
   * Uses OpenRouter for model variety and cost optimization.
   * TurionZ chooses the best model per task.
   */
  static createForSubAgent(model: string): ILlmProvider {
    const vault = VaultManager.getInstance();
    const apiKey = vault.readOrEnv('openrouter_api_key', 'OPENROUTER_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OpenRouter API key not found. Set OPENROUTER_API_KEY in .env or save it in the vault.'
      );
    }

    console.log(`[ProviderFactory] Sub-agent provider: OpenRouter (${model})`);
    return new OpenRouterProvider(apiKey, model);
  }

  /**
   * Legacy method — routes to the correct provider based on context.
   * If model starts with "claude-" → Anthropic direct.
   * Otherwise → OpenRouter.
   */
  static create(model?: string): ILlmProvider {
    const resolvedModel = model || process.env.MAIN_MODEL || DEFAULT_MAIN_MODEL;

    if (resolvedModel.startsWith('claude-')) {
      return ProviderFactory.createMain(resolvedModel);
    }

    return ProviderFactory.createForSubAgent(resolvedModel);
  }
}
