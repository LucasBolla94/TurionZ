// ============================================================
// TurionZ — Authentication Gateway
// Created by BollaNetwork
// ============================================================

import { OwnerValidator } from './OwnerValidator';
import { AllowlistManager } from './AllowlistManager';
import { PairingFlowManager } from './PairingFlowManager';

export type AuthResult = 'authorized' | 'pairing_initiated' | 'denied_silent';

export type DmPolicy = 'allowlist' | 'pairing' | 'open' | 'disabled';

interface AuthConfig {
  dmPolicy: DmPolicy;
}

const DEFAULT_AUTH_CONFIG: AuthConfig = {
  dmPolicy: 'allowlist',
};

export class AuthenticationGateway {
  private static instance: AuthenticationGateway;
  private ownerValidator: OwnerValidator;
  private allowlist: AllowlistManager;
  private pairing: PairingFlowManager;
  private config: AuthConfig;

  private constructor() {
    this.ownerValidator = new OwnerValidator();
    this.allowlist = new AllowlistManager();
    this.pairing = new PairingFlowManager();
    this.config = DEFAULT_AUTH_CONFIG;
  }

  static getInstance(): AuthenticationGateway {
    if (!AuthenticationGateway.instance) {
      AuthenticationGateway.instance = new AuthenticationGateway();
    }
    return AuthenticationGateway.instance;
  }

  setPolicy(policy: DmPolicy): void {
    this.config.dmPolicy = policy;
    console.log(`[Auth] DM policy set to: ${policy}`);
  }

  async authenticate(
    platform: string,
    userId: string,
    username?: string
  ): Promise<{ result: AuthResult; pairingCode?: string }> {
    // Platform disabled
    if (this.config.dmPolicy === 'disabled') {
      return { result: 'denied_silent' };
    }

    // Owner is always authorized
    if (this.ownerValidator.isOwner(platform, userId)) {
      return { result: 'authorized' };
    }

    // Open mode — everyone in
    if (this.config.dmPolicy === 'open') {
      return { result: 'authorized' };
    }

    // Check allowlist
    const isAuthorized = await this.allowlist.isAuthorized(platform, userId);
    if (isAuthorized) {
      return { result: 'authorized' };
    }

    // Pairing mode — generate code
    if (this.config.dmPolicy === 'pairing') {
      const code = await this.pairing.createRequest(platform, userId, username);
      if (code) {
        return { result: 'pairing_initiated', pairingCode: code };
      }
      // Cooldown active or DB unavailable
      return { result: 'denied_silent' };
    }

    // Allowlist mode and user not in list — silence
    return { result: 'denied_silent' };
  }

  async approvePairing(code: string, approvedBy: string): Promise<boolean> {
    return this.pairing.approve(code, approvedBy);
  }

  async denyPairing(code: string, deniedBy: string): Promise<boolean> {
    return this.pairing.deny(code, deniedBy);
  }

  async ensureOwnerRegistered(platform: string): Promise<void> {
    const ownerId = this.ownerValidator.getOwnerIdForPlatform(platform);
    if (ownerId) {
      await this.allowlist.ensureOwnerExists(
        platform,
        ownerId,
        this.ownerValidator.getOwnerName()
      );
    }
  }

  getOwnerValidator(): OwnerValidator {
    return this.ownerValidator;
  }

  getAllowlist(): AllowlistManager {
    return this.allowlist;
  }

  getPairing(): PairingFlowManager {
    return this.pairing;
  }
}
