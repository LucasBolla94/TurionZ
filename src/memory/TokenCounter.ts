// ============================================================
// TurionZ — Token Counter (Estimation)
// Created by BollaNetwork
// ============================================================

/**
 * Simple token estimation.
 * ~4 characters per token is a reasonable approximation for most LLMs.
 * For precise counting, integrate tiktoken later.
 */
export class TokenCounter {
  private static readonly CHARS_PER_TOKEN = 4;

  static estimate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / TokenCounter.CHARS_PER_TOKEN);
  }

  static estimateMessages(messages: { content: string | null }[]): number {
    let total = 0;
    for (const msg of messages) {
      if (msg.content) {
        total += TokenCounter.estimate(msg.content);
      }
      // Overhead per message (role, formatting)
      total += 4;
    }
    return total;
  }
}
