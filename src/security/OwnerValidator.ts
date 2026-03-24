// ============================================================
// TurionZ — Owner Validator
// Created by BollaNetwork
// ============================================================

export class OwnerValidator {
  private ownerIds: Map<string, string> = new Map();
  private ownerName: string;

  constructor() {
    this.ownerName = process.env.OWNER_NAME || 'Lucas';

    // Load owner IDs from env
    const telegramId = process.env.OWNER_TELEGRAM_ID;
    if (telegramId) {
      this.ownerIds.set('telegram', telegramId);
    }

    const discordId = process.env.OWNER_DISCORD_ID;
    if (discordId) {
      this.ownerIds.set('discord', discordId);
    }

    const whatsappId = process.env.OWNER_WHATSAPP_ID;
    if (whatsappId) {
      this.ownerIds.set('whatsapp', whatsappId);
    }
  }

  isOwner(platform: string, userId: string): boolean {
    const ownerId = this.ownerIds.get(platform);
    return ownerId === userId;
  }

  getOwnerName(): string {
    return this.ownerName;
  }

  getOwnerIdForPlatform(platform: string): string | null {
    return this.ownerIds.get(platform) || null;
  }
}
