# Coding Conventions

**Analysis Date:** 2026-03-24

## File Header

Every `.ts` file begins with a standardized comment block:

```typescript
// ============================================================
// TurionZ — [Module Name] ([Brief Purpose])
// Created by BollaNetwork
// ============================================================
```

Use this exact format for all new files. The `[Module Name]` should match the class name or primary export. Add a brief purpose description in parentheses when helpful. Optional multi-line notes can follow below the header (see `src/providers/ProviderFactory.ts` and `src/infra/SchemaManager.ts` for examples with extended comments).

## Naming Patterns

**Files:**
- Use PascalCase for all TypeScript files: `AgentLoop.ts`, `MemoryManager.ts`, `VaultManager.ts`
- One primary class per file, file name matches class name exactly
- Exception: `src/types/index.ts` (barrel file for shared types), `src/infra/database.ts` (lowercase), `src/infra/migrations.ts` (lowercase)
- Interfaces get `I` prefix only for provider contracts: `ILlmProvider.ts`

**Classes:**
- PascalCase: `AgentController`, `ToolRegistry`, `SubAgentManager`
- Suffix conventions:
  - `*Manager` for stateful orchestrators: `MemoryManager`, `VaultManager`, `PermissionManager`, `RecoveryManager`
  - `*Adapter` for gateway implementations: `TelegramInputAdapter`, `TelegramOutputAdapter`, `DiscordAdapter`, `WhatsAppAdapter`, `APIRestAdapter`
  - `*Repository` for database access layers: `ConversationRepository`, `MessageRepository`
  - `*Engine` for processing components: `PersonalityEngine`, `EmbeddingEngine`
  - `*Factory` for creation patterns: `ToolFactory`, `ProviderFactory`
  - `*Registry` for lookup/registration: `ToolRegistry`
  - `*Checker` for validation: `IntegrityChecker`, `PermissionChecker`
  - `*Gateway` for multi-concern facades: `AuthenticationGateway`
  - `*Loader` for filesystem loading: `SkillLoader`

**Interfaces and Types:**
- PascalCase for all interfaces: `InternalMessage`, `AgentLoopConfig`, `ToolResult`
- `I` prefix only for provider/service interfaces: `ILlmProvider`
- Type aliases use PascalCase: `AgentLevel`, `AgentRole`, `AgentStatus`, `AuthResult`, `DmPolicy`
- Use `type` for union literals, `interface` for object shapes

**Variables and Functions:**
- camelCase for all variables and functions: `maxIterations`, `toolCalls`, `abortFlag`
- Boolean variables use `is`/`has` prefix: `isConnected`, `isAvailable`, `isWildcard`, `hasVerifier`
- Private fields use no prefix (no underscore): `private pool`, `private connected`, `private masterKey`
- Constants use SCREAMING_SNAKE_CASE: `MAX_SUB_SUB_AGENTS`, `SAFE_MODE_THRESHOLD`, `ABORT_REGEX`, `PERMANENT_ERROR_CODES`

**Database columns:**
- snake_case: `user_id`, `platform_user_id`, `context_window_size`, `created_at`
- Always include `created_at TIMESTAMP DEFAULT NOW()`
- UUID primary keys: `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`

## Singleton Pattern

The codebase uses the Singleton pattern extensively for infrastructure and shared state. This is the dominant architectural pattern.

**Standard implementation:**

```typescript
export class ExampleManager {
  private static instance: ExampleManager;

  private constructor() {
    // Initialize internal state
  }

  static getInstance(): ExampleManager {
    if (!ExampleManager.instance) {
      ExampleManager.instance = new ExampleManager();
    }
    return ExampleManager.instance;
  }
}
```

**Singleton classes (use `getInstance()`):**
- `src/infra/database.ts` — `Database`
- `src/memory/MemoryManager.ts` — `MemoryManager`
- `src/memory/EmbeddingEngine.ts` — `EmbeddingEngine`
- `src/tools/ToolRegistry.ts` — `ToolRegistry`
- `src/security/AuthenticationGateway.ts` — `AuthenticationGateway`
- `src/security/VaultManager.ts` — `VaultManager`
- `src/security/PermissionManager.ts` — `PermissionManager`
- `src/core/AgentController.ts` — `AgentController`
- `src/gateway/MessageRouter.ts` — `MessageRouter`
- `src/infra/Logger.ts` — `Logger`
- `src/infra/RecoveryManager.ts` — `RecoveryManager`
- `src/infra/SelfImprovement.ts` — `SelfImprovement`
- `src/infra/SchemaManager.ts` — `SchemaManager`
- `src/agents/SubAgentManager.ts` — `SubAgentManager`

**Non-singleton classes (instantiated with `new`):**
- `AgentLoop` — created per message processing cycle
- `PersonalityEngine` — created by AgentController
- `ConversationRepository` — created by MemoryManager
- `MessageRepository` — created by MemoryManager
- `ToolFactory` — created by AgentLoop
- `OwnerValidator` — created by AuthenticationGateway
- `AllowlistManager` — created by AuthenticationGateway
- `PairingFlowManager` — created by AuthenticationGateway
- `SkillLoader` — created per use
- `IntegrityChecker` — created per boot
- `Migrations` — created per boot
- All gateway adapters

**Rule:** When adding new infrastructure/shared-state classes, use singleton. When adding per-request or per-use classes, use regular instantiation.

## Module Exports

**Pattern:** Named exports only. No default exports anywhere in the codebase.

```typescript
// Correct
export class ToolRegistry { ... }
export interface ToolResult { ... }
export type AgentStatus = 'created' | 'running' | ...;

// Never used
export default class ToolRegistry { ... }
```

**Barrel file:** `src/types/index.ts` exports all shared types and interfaces. Import from `'../types'` (not `'../types/index'`).

## Import Organization

**Order (observed consistently):**
1. Node.js built-in modules (`fs`, `path`, `crypto`)
2. Third-party packages (`grammy`, `discord.js`, `pg`, `js-yaml`, `express`)
3. Internal interfaces/types (`'../types'`, `'../providers/ILlmProvider'`)
4. Internal implementations (`'../infra/database'`, `'./ToolFactory'`)

**Style:**
- Named imports: `import { Bot, Context } from 'grammy';`
- Namespace imports for Node built-ins: `import * as fs from 'fs';`
- The `require()` syntax is used only for `pdf-parse` due to module compatibility: `const pdfParse = require('pdf-parse')`
- No path aliases configured; all imports use relative paths

```typescript
// Example from src/gateway/adapters/telegram/TelegramInputAdapter.ts
import { Bot, Context } from 'grammy';
import * as fs from 'fs';
import * as path from 'path';
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
import { InternalMessage, MessageFlags } from '../../../types';
import { AuthenticationGateway, AuthResult } from '../../../security/AuthenticationGateway';
import { MessageRouter } from '../../MessageRouter';
import { TelegramOutputAdapter } from './TelegramOutputAdapter';
```

## Error Handling

**Pattern 1 — Graceful degradation (dominant pattern):**
Most modules check `Database.isConnected()` before attempting DB operations and return safe defaults when unavailable:

```typescript
// From src/memory/MemoryManager.ts
async getContextWindow(conversationId: string): Promise<LlmMessage[]> {
  if (!this.db.isConnected()) {
    return [];
  }
  // ... actual logic
}
```

**Pattern 2 — Error message extraction:**
A universal pattern for extracting error messages throughout the codebase:

```typescript
const errMsg = error instanceof Error ? error.message : String(error);
```

Use this exact pattern everywhere. It appears in every file that has catch blocks.

**Pattern 3 — Non-fatal catch blocks:**
For secondary operations (logging, embeddings, recovery), use empty catch or catch with warning:

```typescript
// From src/infra/Logger.ts — Logging should never crash the application
} catch {
  // Logging should never crash the application
}

// From src/memory/MemoryManager.ts — Non-fatal warnings
} catch (error) {
  // Non-fatal — don't crash the flow
  const errMsg = error instanceof Error ? error.message : String(error);
  console.warn(`[Memory] Failed to check summary threshold: ${errMsg}`);
}
```

**Pattern 4 — Throw for critical failures:**
Only throw when the operation is essential and cannot continue:

```typescript
// From src/infra/database.ts
if (!this.pool || !this.connected) {
  throw new Error('Database not connected. Cannot execute query.');
}

// From src/security/VaultManager.ts
if (!this.masterKey) {
  throw new Error('Vault not initialized. Call initialize() first.');
}
```

**Pattern 5 — User-facing error responses (in Portuguese):**

```typescript
// From src/core/AgentLoop.ts
finalResponse = 'Falha na comunicacao com o provedor de IA. Tente novamente.';

// From src/core/AgentController.ts
response: 'Ocorreu um erro interno ao processar sua mensagem. Tente novamente.',
```

## Logging

**Framework:** `console.log`, `console.warn`, `console.error` (no external logging library).

**Pattern:** All log messages use a bracketed prefix tag identifying the module:

```typescript
console.log('[Database] Connected to PostgreSQL successfully.');
console.warn('[Telegram] Bot token not configured. Skipping.');
console.error('[Controller] Error: ${errMsg}');
```

**Module tags used across the codebase:**
- `[Database]`, `[Migrations]`, `[Schema]`
- `[Controller]`, `[AgentLoop]`
- `[Memory]`, `[EmbeddingEngine]`
- `[Vault]`, `[Auth]`, `[Permissions]`
- `[Telegram]`, `[Discord]`, `[WhatsApp]`, `[API]`
- `[Router]`, `[ToolRegistry]`, `[ToolFactory]`
- `[Recovery]`, `[IntegrityChecker]`
- `[SelfImprovement]`, `[SkillLoader]`
- `[ProviderFactory]`, `[OpenRouter]`, `[Anthropic]`
- `[SubAgentManager]`
- `[TurionZ]` — for top-level system messages

**Structured logging:** The `Logger` class (`src/infra/Logger.ts`) persists activity logs to the database with agent type, duration, and token usage. It also redacts secrets from log output. Use it for important operational events.

**Severity rules:**
- `console.log` — Normal operations, status updates
- `console.warn` — Missing optional config, degraded mode, non-fatal issues
- `console.error` — Actual errors that affect functionality

## Async Patterns

**All public methods that touch DB or network are `async`:**

```typescript
async processMessage(message: InternalMessage): Promise<AgentLoopOutput> { ... }
async connect(retries: number = 3): Promise<void> { ... }
```

**Synchronous methods for local operations:**

```typescript
load(): void { ... }  // File reading with fs.readFileSync
check(): IntegrityReport { ... }  // Local filesystem checks
```

**Retry pattern (used in providers and database):**

```typescript
for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
  try {
    return await this.executeRequest(body, timeout);
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    if (this.isPermanentError(lastError)) {
      throw lastError;
    }
    if (attempt < this.maxRetries) {
      const delay = this.retryDelays[attempt] || 6000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Timeout pattern (used in ToolFactory, providers):**

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);
try {
  const response = await fetch(url, { signal: controller.signal });
} finally {
  clearTimeout(timeoutId);
}
```

## Type Safety

**TypeScript strict mode is enabled** (`tsconfig.json` has `"strict": true`).

**Type casting patterns:**
- Use `as` for known safe casts: `return result.rows as T[]`
- Use `(error as any).statusCode` for extending Error objects (a pattern used in providers)
- Use `Record<string, unknown>` for generic objects, never `any` (except in JSON parse responses from external APIs)
- `any` is used only for external API responses: `const data = await response.json() as any`

**Null handling:**
- Return `null` for "not found": `queryOne<T>(): Promise<T | null>`
- Return empty arrays for "no results": `return []`
- Use `||` for defaults: `this.model = model || DEFAULT_CONFIG.model`
- Non-null assertion `!` used only when state is guaranteed: `this.masterKey!` (after `ensureInitialized()`)

## Configuration

**Environment variable access pattern:**
- Always via `process.env.VARIABLE_NAME`
- Provide defaults: `process.env.MAX_ITERATIONS || '5'`
- Parse numbers: `parseInt(process.env.CONTEXT_WINDOW_SIZE || '150000', 10)`
- For secrets: prefer `VaultManager.readOrEnv(vaultKey, envVarName)` pattern

**Constants for defaults:**
- Define at module level with descriptive names
- Use `const` with SCREAMING_SNAKE_CASE

```typescript
const DEFAULT_MAX_ITERATIONS = 5;
const SAFE_MODE_THRESHOLD = 3;
const SAFE_MODE_WINDOW_MS = 10 * 60 * 1000;
const MAX_DISCORD_LENGTH = 2000;
```

## Comments

**When to comment:**
- Section dividers within `main()` using `// --- Section Name ---`
- TODO markers for planned features: `// TODO: In Fase 12, skill content will be injected here`
- Explaining non-obvious behavior: `// JSON error does NOT count as iteration`
- Warning about gotchas: `// File might be in use`

**Comment style:**
- Inline comments use `//` with a space
- JSDoc used sparingly, primarily for public API methods on `VaultManager` and `EmbeddingEngine`
- No comments on self-explanatory code (getters, simple assignments)

```typescript
/**
 * Read a credential from the vault, or fall back to environment variable.
 * Useful during early setup when vault may not have all keys yet.
 */
readOrEnv(name: string, envVar: string): string | null { ... }
```

## Interface Design

**Method signatures follow these patterns:**
- Return `Promise<void>` for side-effect operations
- Return `Promise<T | null>` for lookups that may fail
- Return `Promise<T[]>` for list queries (empty array = no results)
- Return `boolean` for sync checks: `isConnected()`, `isAvailable()`, `has()`

**Constructor injection is minimal.** Most classes get dependencies via singleton access:

```typescript
// Dominant pattern: singleton access in constructor
private constructor() {
  this.db = Database.getInstance();
  this.memory = MemoryManager.getInstance();
}

// Exception: gateway adapters receive tokens as constructor args
constructor(botToken: string) { ... }
```

## Language

**Code:** All code, variable names, class names, and code comments in English.

**User-facing strings:** In Portuguese (Brazilian). Error messages, responses, and notifications sent to users are in Portuguese:

```typescript
finalResponse = 'Ok, parei o processamento!';
finalResponse = 'Ocorreu um erro interno ao processar sua mensagem. Tente novamente.';
await ctx.reply('Audio recebido, mas transcricao ainda nao esta configurada.');
```

**Console logs:** In English (for developers).

---

*Convention analysis: 2026-03-24*
