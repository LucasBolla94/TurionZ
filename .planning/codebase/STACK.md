# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 6.0.2 - All source code in `src/`
- Target: ES2022, Module system: CommonJS

**Secondary:**
- SQL - PostgreSQL schema definitions in `src/infra/migrations.ts` and `src/infra/SchemaManager.ts`
- YAML - Used for agent personality/identity files in `.agents/` via `js-yaml` dependency
- Markdown - Agent personality files (`.agents/SOUL.md`, `.agents/IDENTITY.md`, `.agents/MEMORY.md`)

## Runtime

**Environment:**
- Node.js v24.14.0
- No `.nvmrc` or `.node-version` file present

**Package Manager:**
- npm 11.9.0
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Express 5.2.1 - REST API adapter (`src/gateway/adapters/api/APIRestAdapter.ts`)
- grammY 1.41.1 - Telegram bot framework (`src/gateway/adapters/telegram/TelegramInputAdapter.ts`)
- discord.js 14.25.1 - Discord bot framework (`src/gateway/adapters/discord/DiscordAdapter.ts`)

**Testing:**
- None configured - No test runner, no test files, no test scripts in `package.json`

**Build/Dev:**
- tsx 4.21.0 - Development runner with watch mode (`npm run dev` = `tsx watch src/index.ts`)
- tsc (TypeScript compiler) - Production build (`npm run build` = `tsc`)
- ts-node 10.9.2 - TypeScript execution (available but dev uses tsx)
- nodemon 3.1.14 - Available but not used in scripts

## Key Dependencies

**Critical (Production):**
- `pg` 8.20.0 - PostgreSQL client, connection pooling (`src/infra/database.ts`)
- `grammy` 1.41.1 - Telegram bot (primary communication channel)
- `discord.js` 14.25.1 - Discord bot (secondary communication channel)
- `express` 5.2.1 - REST API gateway

**Utility:**
- `pdf-parse` 2.4.5 - PDF text extraction for document processing (`src/gateway/adapters/telegram/TelegramInputAdapter.ts`)
- `js-yaml` 4.1.1 - YAML parsing for personality/skill files

**Dev Dependencies:**
- `@types/express` 5.0.6 - Express type definitions
- `@types/pg` 8.20.0 - PostgreSQL type definitions
- `@types/node` 25.5.0 - Node.js type definitions
- `@types/pdf-parse` 1.1.5 - pdf-parse type definitions
- `@types/js-yaml` 4.0.9 - js-yaml type definitions
- `typescript` 6.0.2 - TypeScript compiler

**Notable Absence - No External LLM SDK:**
- Both Anthropic and OpenRouter integrations use raw `fetch()` (Node.js built-in) instead of official SDKs
- `src/providers/AnthropicProvider.ts` calls `https://api.anthropic.com/v1/messages` directly
- `src/providers/OpenRouterProvider.ts` calls `https://openrouter.ai/api/v1/chat/completions` directly
- This means no `@anthropic-ai/sdk` or `openai` package dependency

## TypeScript Configuration

**File:** `tsconfig.json`

**Key Settings:**
- `target`: ES2022
- `module`: commonjs
- `strict`: true (all strict checks enabled)
- `esModuleInterop`: true
- `resolveJsonModule`: true
- `declaration`: true (generates `.d.ts` files)
- `declarationMap`: true
- `sourceMap`: true
- `rootDir`: `./src`
- `outDir`: `./dist`

## Build & Run

**Scripts in `package.json`:**
```bash
npm run dev      # tsx watch src/index.ts (dev with hot reload)
npm run build    # tsc (TypeScript compile to dist/)
npm start        # node dist/index.js (production)
```

**Entry Point:**
- Source: `src/index.ts`
- Compiled: `dist/index.js`

## Configuration

**Environment:**
- `.env` file (gitignored) for all configuration
- `.env.example` provides template with all required variables
- `VaultManager` (`src/security/VaultManager.ts`) provides encrypted credential storage as alternative to `.env`
- `readOrEnv()` pattern: check vault first, fall back to env var

**Required Environment Variables:**
- `ANTHROPIC_API_KEY` - Anthropic API key for main Thor brain
- `OPENROUTER_API_KEY` - OpenRouter key for sub-agents
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `DATABASE_URL` - PostgreSQL connection string (format: `postgresql://user:pass@localhost:5432/turionz`)
- `OWNER_TELEGRAM_ID` - Owner's Telegram user ID
- `OWNER_NAME` - Owner display name

**Optional Environment Variables:**
- `DISCORD_BOT_TOKEN` - Discord bot token
- `API_PORT` - REST API port (default: 3000)
- `API_ACCESS_KEY` - REST API bearer token
- `MAIN_MODEL` - Override main model (default: `claude-opus-4-6`)
- `MAX_ITERATIONS` - Agent loop iteration limit (default: 5)
- `CONTEXT_WINDOW_SIZE` - Context window size (default: 150000)
- `OWNER_DISCORD_ID` - Owner's Discord user ID
- `OWNER_WHATSAPP_ID` - Owner's WhatsApp user ID

## Cryptography

**Vault Encryption:**
- Algorithm: AES-256-GCM (`src/security/CryptoHandler.ts`)
- IV: 16 bytes random per encryption
- Auth tag: 16 bytes (GCM authentication)
- Master key: 32 bytes, generated via `crypto.randomBytes(32)`
- Storage: `data/vault/vault.enc` (encrypted), `data/vault/vault.meta` (metadata)
- Uses Node.js built-in `crypto` module (no external crypto dependencies)

## Platform Requirements

**Development:**
- Node.js >= 22 (uses ES2022 features, native `fetch()`)
- PostgreSQL (optional - system runs in "degraded mode" without it)
- Telegram bot token (primary interface)

**Production:**
- Node.js runtime
- PostgreSQL with `uuid-ossp` extension (required)
- PostgreSQL with `pgvector` extension (optional, for embedding search)
- Network access to: `api.anthropic.com`, `openrouter.ai`, `api.telegram.org`

## Singleton Pattern

Nearly every core service uses the Singleton pattern with `getInstance()`:
- `Database` (`src/infra/database.ts`)
- `Logger` (`src/infra/Logger.ts`)
- `SchemaManager` (`src/infra/SchemaManager.ts`)
- `RecoveryManager` (`src/infra/RecoveryManager.ts`)
- `SelfImprovement` (`src/infra/SelfImprovement.ts`)
- `VaultManager` (`src/security/VaultManager.ts`)
- `AuthenticationGateway` (`src/security/AuthenticationGateway.ts`)
- `PermissionManager` (`src/security/PermissionManager.ts`)
- `ToolRegistry` (`src/tools/ToolRegistry.ts`)
- `MemoryManager` (`src/memory/MemoryManager.ts`)
- `EmbeddingEngine` (`src/memory/EmbeddingEngine.ts`)
- `AgentController` (`src/core/AgentController.ts`)
- `MessageRouter` (`src/gateway/MessageRouter.ts`)
- `SubAgentManager` (`src/agents/SubAgentManager.ts`)

---

*Stack analysis: 2026-03-24*
