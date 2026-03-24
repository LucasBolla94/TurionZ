// ============================================================
// TurionZ — Key Manager (Master Key Generation & Storage)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { CryptoHandler } from './CryptoHandler';

export class KeyManager {
  private keyPath: string;

  constructor(vaultDir: string) {
    this.keyPath = path.join(vaultDir, 'vault.key');
  }

  keyExists(): boolean {
    return fs.existsSync(this.keyPath);
  }

  generateAndSave(): Buffer {
    const key = CryptoHandler.generateKey();

    const dir = path.dirname(this.keyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.keyPath, key.toString('hex'), { mode: 0o600 });
    console.log('[KeyManager] Master key generated and saved.');
    return key;
  }

  loadKey(): Buffer {
    if (!this.keyExists()) {
      throw new Error('Vault key not found. Cannot decrypt credentials.');
    }

    const hex = fs.readFileSync(this.keyPath, 'utf8').trim();
    return Buffer.from(hex, 'hex');
  }

  exportKey(): string {
    const key = this.loadKey();
    return key.toString('hex');
  }
}
