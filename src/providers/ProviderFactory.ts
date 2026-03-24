// ============================================================
// TurionZ — Provider Factory
// Created by BollaNetwork
// ============================================================

import { ILlmProvider } from './ILlmProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { VaultManager } from '../security/VaultManager';

export class ProviderFactory {
  static create(model?: string): ILlmProvider {
    const vault = VaultManager.getInstance();
    const apiKey = vault.readOrEnv('openrouter_api_key', 'OPENROUTER_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OpenRouter API key not found. Set OPENROUTER_API_KEY in .env or save it in the vault.'
      );
    }

    return new OpenRouterProvider(apiKey, model);
  }
}
