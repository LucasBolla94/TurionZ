// ============================================================
// TurionZ — Vault Manager (Encrypted Credential Store)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { CryptoHandler, EncryptedData } from './CryptoHandler';
import { KeyManager } from './KeyManager';

interface VaultEntry {
  value: EncryptedData;
  createdAt: string;
  updatedAt: string;
}

interface VaultStore {
  version: string;
  entries: Record<string, VaultEntry>;
}

export class VaultManager {
  private static instance: VaultManager;
  private vaultDir: string;
  private vaultPath: string;
  private metaPath: string;
  private keyManager: KeyManager;
  private masterKey: Buffer | null = null;

  private constructor(vaultDir?: string) {
    this.vaultDir = vaultDir || path.join(process.cwd(), 'data', 'vault');
    this.vaultPath = path.join(this.vaultDir, 'vault.enc');
    this.metaPath = path.join(this.vaultDir, 'vault.meta');
    this.keyManager = new KeyManager(this.vaultDir);
  }

  static getInstance(vaultDir?: string): VaultManager {
    if (!VaultManager.instance) {
      VaultManager.instance = new VaultManager(vaultDir);
    }
    return VaultManager.instance;
  }

  async initialize(): Promise<void> {
    // Ensure vault directory exists
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
    }

    // Generate or load master key
    if (!this.keyManager.keyExists()) {
      this.masterKey = this.keyManager.generateAndSave();
      this.writeStore(this.createEmptyStore());
      this.writeMeta();
      console.log('[Vault] Initialized new vault with fresh master key.');
    } else {
      this.masterKey = this.keyManager.loadKey();
      if (!fs.existsSync(this.vaultPath)) {
        this.writeStore(this.createEmptyStore());
      }
      console.log('[Vault] Loaded existing vault.');
    }
  }

  save(name: string, value: string): void {
    this.ensureInitialized();

    const store = this.readStore();
    const now = new Date().toISOString();
    const encrypted = CryptoHandler.encrypt(value, this.masterKey!);

    store.entries[name] = {
      value: encrypted,
      createdAt: store.entries[name]?.createdAt || now,
      updatedAt: now,
    };

    this.writeStore(store);
    console.log(`[Vault] Credential '${name}' saved.`);
  }

  read(name: string): string | null {
    this.ensureInitialized();

    const store = this.readStore();
    const entry = store.entries[name];

    if (!entry) {
      return null;
    }

    return CryptoHandler.decrypt(entry.value, this.masterKey!);
  }

  list(): string[] {
    this.ensureInitialized();

    const store = this.readStore();
    return Object.keys(store.entries);
  }

  delete(name: string): boolean {
    this.ensureInitialized();

    const store = this.readStore();
    if (!store.entries[name]) {
      return false;
    }

    delete store.entries[name];
    this.writeStore(store);
    console.log(`[Vault] Credential '${name}' deleted.`);
    return true;
  }

  has(name: string): boolean {
    this.ensureInitialized();
    const store = this.readStore();
    return name in store.entries;
  }

  exportMasterKey(): string {
    this.ensureInitialized();
    return this.keyManager.exportKey();
  }

  /**
   * Read a credential from the vault, or fall back to environment variable.
   * Useful during early setup when vault may not have all keys yet.
   */
  readOrEnv(name: string, envVar: string): string | null {
    const vaultValue = this.read(name);
    if (vaultValue) return vaultValue;
    return process.env[envVar] || null;
  }

  private ensureInitialized(): void {
    if (!this.masterKey) {
      throw new Error('Vault not initialized. Call initialize() first.');
    }
  }

  private createEmptyStore(): VaultStore {
    return {
      version: '1.0',
      entries: {},
    };
  }

  private readStore(): VaultStore {
    if (!fs.existsSync(this.vaultPath)) {
      return this.createEmptyStore();
    }

    const raw = fs.readFileSync(this.vaultPath, 'utf8');
    return JSON.parse(raw) as VaultStore;
  }

  private writeStore(store: VaultStore): void {
    fs.writeFileSync(this.vaultPath, JSON.stringify(store, null, 2), { mode: 0o600 });
  }

  private writeMeta(): void {
    const meta = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
    };
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
  }
}
