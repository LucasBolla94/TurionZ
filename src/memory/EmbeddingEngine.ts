// ============================================================
// TurionZ — Embedding Engine (nomic-embed local wrapper)
// Created by BollaNetwork
// ============================================================

/**
 * Wrapper for nomic-embed local embedding generation.
 * Runs in background, never blocks the main flow.
 * If embedding fails, the message is saved without embedding.
 *
 * NOTE: The actual nomic-embed integration will be configured when
 * deploying to the dedicated server. For now, this provides the
 * interface and a placeholder implementation.
 */
export class EmbeddingEngine {
  private static instance: EmbeddingEngine;
  private available: boolean = false;

  private constructor() {}

  static getInstance(): EmbeddingEngine {
    if (!EmbeddingEngine.instance) {
      EmbeddingEngine.instance = new EmbeddingEngine();
    }
    return EmbeddingEngine.instance;
  }

  async initialize(): Promise<void> {
    // TODO: Initialize nomic-embed local model when deployed to server
    // For now, embedding is not available
    this.available = false;
    console.log('[EmbeddingEngine] Not available yet (will be configured on server deployment).');
  }

  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Generate embedding for text.
   * Returns null if engine is not available.
   * Runs async — never blocks.
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.available) {
      return null;
    }

    try {
      // TODO: Call nomic-embed local model
      // const embedding = await nomicEmbed.encode(text);
      // return embedding;
      return null;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[EmbeddingEngine] Failed to generate embedding: ${errMsg}`);
      return null;
    }
  }

  /**
   * Generate embedding in background — fire and forget.
   * Calls onComplete with the result when done.
   */
  generateInBackground(
    text: string,
    onComplete: (embedding: number[] | null) => void
  ): void {
    if (!this.available) {
      return;
    }

    this.generateEmbedding(text)
      .then(onComplete)
      .catch(() => onComplete(null));
  }
}
