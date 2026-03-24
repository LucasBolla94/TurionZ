# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

### Anthropic API (Main Brain)

- **Purpose:** Primary LLM provider for TurionZ (Thor) - the main agent
- **SDK/Client:** Raw `fetch()` to `https://api.anthropic.com/v1/messages` (no SDK)
- **Implementation:** `src/providers/AnthropicProvider.ts`
- **Auth:** `x-api-key` header, key from env `ANTHROPIC_API_KEY` or vault `anthropic_api_key`
- **API Version:** `2023-06-01` (via `anthropic-version` header)
- **Default Model:** `claude-opus-4-6`
- **Default Config:** temperature 0.7, maxTokens 8096, timeout 120s
- **Retry Strategy:** Up to 3 retries with delays [1s, 3s, 6s]; no retry on HTTP 400/401/403/404
- **Tool Calling:** Supports Anthropic native tool format (`tool_use`/`tool_result` content blocks)
- **Factory:** `ProviderFactory.createMain()` in `src/providers/ProviderFactory.ts`

### OpenRouter API (Sub-Agents)

- **Purpose:** LLM provider for sub-agents - model variety and cost optimization
- **SDK/Client:** Raw `fetch()` to `https://openrouter.ai/api/v1/chat/completions` (no SDK)
- **Implementation:** `src/providers/OpenRouterProvider.ts`
- **Auth:** `Authorization: Bearer` header, key from env `OPENROUTER_API_KEY` or vault `openrouter_api_key`
- **Custom Headers:** `HTTP-Referer: https://bollanetwork.com`, `X-Title: TurionZ by BollaNetwork`
- **Default Model:** `anthropic/claude-sonnet-4` (configurable per sub-agent)
- **Default Config:** temperature 0.7, maxTokens 4096, timeout 120s
- **Retry Strategy:** Same as Anthropic - 3 retries with [1s, 3s, 6s] delays
- **Tool Calling:** OpenAI-compatible format (tool_calls array in response)
- **Factory:** `ProviderFactory.createForSubAgent(model)` in `src/providers/ProviderFactory.ts`
- **Model Catalog:** Database table `openrouter_models` for caching model info (on-demand via `src/infra/SchemaManager.ts`)

### Provider Factory Pattern

- **File:** `src/providers/ProviderFactory.ts`
- **Interface:** `ILlmProvider` in `src/providers/ILlmProvider.ts`
- **Routing Logic:**
  - `ProviderFactory.createMain()` -> always Anthropic
  - `ProviderFactory.createForSubAgent(model)` -> always OpenRouter
  - `ProviderFactory.create(model)` -> routes by model name: `claude-*` goes to Anthropic, everything else to OpenRouter

## Messaging Platforms

### Telegram (Primary - Fully Implemented)

- **Purpose:** Primary communication channel with owner/users
- **SDK:** grammY 1.41.1 (`grammy` package)
- **Implementation:**
  - Input: `src/gateway/adapters/telegram/TelegramInputAdapter.ts`
  - Output: `src/gateway/adapters/telegram/TelegramOutputAdapter.ts`
- **Auth:** `TELEGRAM_BOT_TOKEN` env var or vault `telegram_bot_token`
- **Connection:** Long polling (not webhooks)
- **Features:**
  - Text message handling
  - Document processing (PDF via `pdf-parse`, Markdown as text)
  - Voice/audio message placeholders (Whisper integration planned)
  - Typing indicators (`sendChatAction`)
  - User abort support (regex: `para|cancela|stop|esquece|pare|cancel`)
  - File download via Telegram Bot API (`https://api.telegram.org/file/bot{token}/...`)
  - Temp file management in `tmp/` directory
- **Owner ID:** `OWNER_TELEGRAM_ID` env var for owner identification

### Discord (Fully Implemented)

- **Purpose:** Secondary communication channel
- **SDK:** discord.js 14.25.1
- **Implementation:** `src/gateway/adapters/discord/DiscordAdapter.ts`
- **Auth:** `DISCORD_BOT_TOKEN` env var or vault `discord_bot_token`
- **Intents:** Guilds, GuildMessages, DirectMessages, MessageContent
- **Features:**
  - DM handling (responds to all DMs)
  - Mention-based handling in servers (responds when @mentioned)
  - Message chunking (2000 char Discord limit)
  - Bot message filtering (ignores own messages)
  - Typing indicators
- **Owner ID:** `OWNER_DISCORD_ID` env var

### WhatsApp (Placeholder Only)

- **Purpose:** Future communication channel
- **SDK:** None installed - placeholder references `@whiskeysockets/baileys` or `whatsapp-web.js`
- **Implementation:** `src/gateway/adapters/whatsapp/WhatsAppAdapter.ts` (skeleton only)
- **Status:** `start()` logs "placeholder" and sets `connected = false`
- **Owner ID:** `OWNER_WHATSAPP_ID` env var

### REST API (Fully Implemented)

- **Purpose:** Programmatic access to TurionZ
- **Framework:** Express 5.2.1
- **Implementation:** `src/gateway/adapters/api/APIRestAdapter.ts`
- **Auth:** Bearer token via `API_ACCESS_KEY` env var (no key = dev mode, all requests allowed)
- **Port:** `API_PORT` env var (default: 3000)
- **Endpoints:**
  - `GET /health` - Health check (no auth required)
  - `POST /api/message` - Send message to agent (auth required), body: `{ content, userId?, conversationId? }`
  - `GET /api/status` - Agent status with uptime and memory usage (auth required)
- **Body Limit:** 10MB JSON

## Data Storage

### PostgreSQL (Primary Database)

- **Client:** `pg` 8.20.0 (node-postgres)
- **Implementation:** `src/infra/database.ts` (Singleton)
- **Connection:** Pool with max 10 connections, 30s idle timeout, 5s connection timeout
- **Connection String:** `DATABASE_URL` env var
- **Retry:** 3 connection attempts with 2s/4s/6s delays
- **Degraded Mode:** System continues without database (no persistence)
- **Extensions Required:**
  - `uuid-ossp` - UUID generation (required)
  - `vector` (pgvector) - Embedding vector storage (optional, for semantic search)

**Essential Tables (created at startup in `src/infra/migrations.ts`):**
- `conversations` - User conversation tracking (user_id, platform, context window)
- `messages` - Message history with optional embeddings (vector(768) column)
- `authorized_users` - Authentication/authorization (platform + user_id, owner flag)

**On-Demand Tables (created lazily via `src/infra/SchemaManager.ts`):**
- `agents` - Sub-agent records (level, role, model, briefing, status)
- `agent_communications` - Inter-agent messaging
- `agent_dependencies` - Agent execution dependencies
- `permissions` - Action-based permission grants
- `activity_logs` - Structured activity logging
- `lessons_learned` - Self-improvement learnings
- `weekly_reports` - Self-improvement weekly analysis
- `pairing_requests` - User pairing/onboarding flow
- `openrouter_models` - Cached OpenRouter model catalog
- `conversation_summaries` - Context window compression summaries
- `recovery_state` - Crash recovery checkpoints

### Local File Storage

- **Vault:** `data/vault/vault.enc` - AES-256-GCM encrypted credential store
- **Vault Meta:** `data/vault/vault.meta` - Vault metadata (creation date, last access)
- **Crash Counter:** `data/crash_count.json` - Recovery crash tracking
- **Embeddings:** `data/embeddings/` - Local embedding storage (empty, placeholder)
- **Temp Files:** `tmp/` - Temporary file processing (Telegram document downloads)
- **Agent Identity:** `.agents/SOUL.md`, `.agents/IDENTITY.md`, `.agents/MEMORY.md` - Agent personality files
- **Skills:** `.agents/skills/` - Skill definition files

### Caching

- None - No Redis, no in-memory cache layer. SchemaManager tracks created tables in a `Set<string>` in memory.

## Embedding Engine (Planned)

- **Purpose:** Semantic search over conversation history
- **Model:** nomic-embed (local inference planned)
- **Implementation:** `src/memory/EmbeddingEngine.ts` (interface only, returns null)
- **Status:** Not available - placeholder with TODO comments
- **Vector Size:** 768 dimensions (schema defines `vector(768)` columns)
- **Design:** Non-blocking background generation via `generateInBackground()` callback pattern
- **Storage:** PostgreSQL `pgvector` extension for vector similarity search

## Authentication & Identity

### Custom Multi-Platform Auth System

- **Implementation:** `src/security/AuthenticationGateway.ts`
- **Storage:** `authorized_users` table in PostgreSQL
- **Owner Validation:** `src/security/OwnerValidator.ts`
- **Pairing Flow:** `src/security/PairingFlowManager.ts` - code-based user onboarding
- **Permissions:** `src/security/PermissionManager.ts`, `src/security/PermissionChecker.ts`
- **Auth Results:** `authorized` | `denied_silent` | `pairing_initiated`
- **Supported Platforms:** telegram, discord, whatsapp, api

### Vault (Encrypted Secret Store)

- **Implementation:** `src/security/VaultManager.ts`, `src/security/CryptoHandler.ts`, `src/security/KeyManager.ts`
- **Encryption:** AES-256-GCM
- **Pattern:** `vault.readOrEnv(vaultKey, envVar)` - vault-first, env-fallback
- **Storage:** `data/vault/` (gitignored)

## Monitoring & Observability

### Structured Logger

- **Implementation:** `src/infra/Logger.ts`
- **Console Output:** Always (formatted: `[timestamp] [agent] action (duration) [tokens]`)
- **Database Output:** `activity_logs` table when DB is connected
- **Secret Redaction:** Automatic pattern-based redaction of API keys, tokens, passwords in logs
- **Redaction Patterns:** OpenRouter/OpenAI keys (`sk-...`), GitHub tokens (`ghp_...`), Telegram tokens, passwords

### Error Tracking

- None - No Sentry, no external error tracking. Errors logged to console and `activity_logs` table.

### Recovery System

- **Implementation:** `src/infra/RecoveryManager.ts`
- **Crash Tracking:** `data/crash_count.json`
- **Recovery State:** `recovery_state` table (on-demand)
- **Safe Mode:** Activated after repeated crashes, disables self-improvement scheduler

### Self-Improvement

- **Implementation:** `src/infra/SelfImprovement.ts`
- **Purpose:** Periodic self-analysis of conversations for learning
- **Storage:** `lessons_learned` and `weekly_reports` tables
- **Schedule:** Runs on scheduler (disabled in safe mode)

## CI/CD & Deployment

### Hosting

- Not configured - No Dockerfile, no deployment config files
- Designed for dedicated server deployment (referenced in code comments)

### CI Pipeline

- None - No GitHub Actions, no CI config files

## Webhooks & Callbacks

### Incoming

- `POST /api/message` - REST API endpoint for external systems to send messages
- Telegram long polling (not webhook-based)
- Discord WebSocket gateway (via discord.js)

### Outgoing

- None configured - No webhook dispatch system

## Integration Architecture Summary

```
External World
    |
    +-- Telegram Bot API (grammY, long polling)
    |       -> TelegramInputAdapter -> MessageRouter -> AgentController -> AgentLoop
    |
    +-- Discord Gateway (discord.js, WebSocket)
    |       -> DiscordAdapter -> MessageRouter -> AgentController -> AgentLoop
    |
    +-- REST API (Express, HTTP)
    |       -> APIRestAdapter -> MessageRouter -> AgentController -> AgentLoop
    |
    +-- WhatsApp (placeholder, not connected)
    |
    AgentLoop
    |   -> AnthropicProvider (fetch -> api.anthropic.com) [Main Thor brain]
    |   -> SubAgentManager
    |       -> OpenRouterProvider (fetch -> openrouter.ai) [Sub-agent brains]
    |
    +-- PostgreSQL (pg, connection pool)
    +-- Local Vault (AES-256-GCM encrypted files)
    +-- Embedding Engine (nomic-embed, planned)
```

---

*Integration audit: 2026-03-24*
