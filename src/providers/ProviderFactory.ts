// ============================================================
// TurionZ — Provider Factory
// Created by BollaNetwork
//
// TurionZ (Thor) → OpenRouter (Gemini 2.5 Flash — custo-benefício)
// Sub-agents     → OpenRouter (modelos variados, custo otimizado)
// Tudo via OpenRouter — uma API key, múltiplos modelos
// ============================================================

import { ILlmProvider } from './ILlmProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { VaultManager } from '../security/VaultManager';

const DEFAULT_MAIN_MODEL = 'google/gemini-2.5-flash-preview';
const DEFAULT_SUB_AGENT_MODEL = 'google/gemini-2.5-flash-preview';

export class ProviderFactory {
  private static getOpenRouterKey(): string {
    const vault = VaultManager.getInstance();
    const apiKey = vault.readOrEnv('openrouter_api_key', 'OPENROUTER_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OpenRouter API key not found. Set OPENROUTER_API_KEY in .env or save it in the vault.'
      );
    }

    return apiKey;
  }

  /**
   * Create the MAIN provider for TurionZ (Thor).
   * Uses OpenRouter with Gemini 2.5 Flash (best cost-benefit).
   */
  static createMain(model?: string): ILlmProvider {
    const apiKey = ProviderFactory.getOpenRouterKey();
    const selectedModel = model || process.env.MAIN_MODEL || DEFAULT_MAIN_MODEL;
    console.log(`[ProviderFactory] Main provider: OpenRouter (${selectedModel})`);
    return new OpenRouterProvider(apiKey, selectedModel);
  }

  /**
   * Create a provider for SUB-AGENTS.
   * Uses OpenRouter — TurionZ chooses the best model per task.
   */
  static createForSubAgent(model?: string): ILlmProvider {
    const apiKey = ProviderFactory.getOpenRouterKey();
    const selectedModel = model || process.env.SUB_AGENT_DEFAULT_MODEL || DEFAULT_SUB_AGENT_MODEL;
    console.log(`[ProviderFactory] Sub-agent provider: OpenRouter (${selectedModel})`);
    return new OpenRouterProvider(apiKey, selectedModel);
  }

  /**
   * Generic method — routes to correct model.
   */
  static create(model?: string): ILlmProvider {
    const resolvedModel = model || process.env.MAIN_MODEL || DEFAULT_MAIN_MODEL;
    return new OpenRouterProvider(ProviderFactory.getOpenRouterKey(), resolvedModel);
  }
}
