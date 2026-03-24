# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Layered Monolith with Facade Pattern and ReAct Agent Loop

**Key Characteristics:**
- Singleton pattern used extensively for cross-cutting services (Database, Logger, ToolRegistry, MemoryManager, etc.)
- Facade pattern at `AgentController` orchestrating all subsystems
- ReAct (Reasoning + Acting) loop as the core AI processing engine
- Gateway adapter pattern normalizing all platform inputs to a single `InternalMessage` format
- Graceful degradation: system continues without database, embeddings, or optional platforms
- Hybrid schema migration: 3 essential tables at startup, rest created on-demand by `SchemaManager`

## Layers

**Gateway Layer (Input/Output):**
- Purpose: Receive messages from external platforms, normalize to `InternalMessage`, send responses back
- Location: `src/gateway/`
- Contains: Platform adapters (Telegram, Discord, WhatsApp, API REST) and `MessageRouter`
- Depends on: Security (AuthenticationGateway), Types (InternalMessage, AgentLoopOutput)
- Used by: External platforms send messages here; `AgentController` sends responses via `MessageRouter`

**Core Layer (Brain):**
- Purpose: Orchestrate message processing, manage personality, run the AI reasoning loop
- Location: `src/core/`
- Contains: `AgentController` (facade), `AgentLoop` (ReAct engine), `PersonalityEngine`
- Depends on: Memory, Tools, Providers, Gateway (MessageRouter)
- Used by: Gateway layer routes messages here via `MessageRouter.routeMessage()`

**Provider Layer (LLM Access):**
- Purpose: Abstract LLM API communication behind a common interface
- Location: `src/providers/`
- Contains: `ILlmProvider` interface, `AnthropicProvider`, `OpenRouterProvider`, `ProviderFactory`
- Depends on: Types, Security (VaultManager for API keys)
- Used by: Core (AgentLoop), Agents (SubAgentManager), Skills (SkillRouter), Infra (SelfImprovement)

**Memory Layer (Persistence):**
- Purpose: Manage conversations, messages, context windows, and semantic search
- Location: `src/memory/`
- Contains: `MemoryManager` (facade), `ConversationRepository`, `MessageRepository`, `EmbeddingEngine`, `TokenCounter`
- Depends on: Infra (Database), Types
- Used by: Core (AgentController)

**Tools Layer (Agent Capabilities):**
- Purpose: Register, discover, and execute tools that the AI can call during reasoning
- Location: `src/tools/`
- Contains: `BaseTool` (abstract), `ToolRegistry` (singleton), `ToolFactory`, `builtin/MemorySearchTool`
- Depends on: Types, Memory (for MemorySearchTool)
- Used by: Core (AgentLoop calls tools via ToolFactory)

**Skills Layer (Hot-Loadable Behaviors):**
- Purpose: Load skill definitions from filesystem, route messages to skills, inject skill prompts
- Location: `src/skills/`
- Contains: `SkillLoader`, `SkillRouter`, `SkillExecutor`
- Depends on: Providers (for SkillRouter LLM call), Types
- Used by: Core (AgentController will inject skill content into system prompt)

**Agents Layer (Sub-Agent Hierarchy):**
- Purpose: Create, run, and manage sub-agents that use their own AgentLoop instances
- Location: `src/agents/`
- Contains: `SubAgentManager`
- Depends on: Core (AgentLoop), Providers (ProviderFactory.createForSubAgent), Infra (Database, SchemaManager), Tools
- Used by: Core (when Thor delegates tasks)

**Security Layer:**
- Purpose: Authentication, authorization, credential storage, permissions
- Location: `src/security/`
- Contains: `AuthenticationGateway` (facade), `OwnerValidator`, `AllowlistManager`, `PairingFlowManager`, `PermissionManager`, `PermissionChecker`, `VaultManager`, `CryptoHandler`, `KeyManager`
- Depends on: Infra (Database, SchemaManager)
- Used by: Gateway (adapters authenticate users), Providers (VaultManager for API keys), Core

**Infrastructure Layer:**
- Purpose: Database connectivity, schema management, migrations, logging, recovery, self-improvement
- Location: `src/infra/`
- Contains: `Database` (singleton), `SchemaManager` (on-demand table creation), `Migrations` (essential tables), `Logger`, `RecoveryManager`, `SelfImprovement`, `IntegrityChecker`
- Depends on: Types, Providers (SelfImprovement uses LLM for analysis)
- Used by: All layers depend on Database; modules use SchemaManager for lazy table creation

**Types Layer (Shared Contracts):**
- Purpose: Define all shared interfaces and types
- Location: `src/types/index.ts`
- Contains: `InternalMessage`, `AgentLoopInput/Output`, `LlmMessage`, `ToolDefinition`, `ToolResult`, `SkillMetadata`, `Permission`, `ActivityLog`
- Depends on: Nothing
- Used by: All layers

## Data Flow

**Primary Message Flow (User Message to Response):**

1. Platform adapter (e.g., `TelegramInputAdapter`) receives raw message
2. Adapter authenticates user via `AuthenticationGateway.authenticate()`
3. If authorized, adapter normalizes message to `InternalMessage`
4. Adapter calls `MessageRouter.routeMessage(message)`
5. `MessageRouter` delegates to `AgentController.processMessage()` (registered handler)
6. `AgentController` finds/creates conversation via `MemoryManager`
7. `AgentController` saves user message to database
8. `AgentController` retrieves context window (past messages within token limit)
9. `AgentController` builds system prompt via `PersonalityEngine` (SOUL.md + IDENTITY.md + MEMORY.md)
10. `AgentController` creates `AgentLoop` with `AnthropicProvider` (via `ProviderFactory.createMain()`)
11. `AgentLoop.run()` enters ReAct loop:
    - Calls LLM with messages + tools
    - If LLM returns tool calls: executes tools via `ToolFactory`, appends results, loops
    - If LLM returns final answer: exits loop
    - Respects `maxIterations` (default 5) and `maxToolsPerRound` (default 5)
12. `AgentController` saves assistant response to database
13. Response flows back through `MessageRouter` to the adapter
14. Adapter formats and sends response to user (chunking, file upload if needed)

**Sub-Agent Flow:**

1. `SubAgentManager.createSubAgent()` saves agent record to database
2. `SubAgentManager.runSubAgent()` waits for dependencies, then:
   - Creates `OpenRouterProvider` (sub-agents use OpenRouter, not Anthropic direct)
   - Creates new `AgentLoop` with sub-agent-specific system prompt
   - Runs the loop with the briefing as the user message
3. If level 1 worker completes successfully, auto-creates a verifier sub-agent
4. Results are saved to database; inter-agent communication via `agent_communications` table

**Self-Improvement Flow (Weekly):**

1. `SelfImprovement.startScheduler()` checks every hour, runs on Sundays at 3 AM
2. Collects all messages from the past 7 days
3. Fragments data if exceeding 20k token limit
4. Sends fragments to Claude Haiku (via OpenRouter) for analysis
5. Extracts lessons (category + description)
6. Verifies previous week's lessons
7. Saves lessons to `lessons_learned` table
8. Appends lessons to `.agents/MEMORY.md` file
9. Saves weekly report to `weekly_reports` table

**State Management:**
- Conversation state: PostgreSQL `conversations` and `messages` tables
- Per-user active loops: `AgentController.activeLoops` Map (in-memory)
- Sub-agent state: PostgreSQL `agents` table with status tracking
- Permissions: PostgreSQL `permissions` table (ask once, remember forever)
- Credentials: Encrypted vault at `data/vault/vault.enc` with AES encryption
- Personality: Filesystem-based at `.agents/` (SOUL.md, IDENTITY.md, MEMORY.md)
- Skills: Filesystem-based at `.agents/skills/` with YAML frontmatter in SKILL.md files

## Key Abstractions

**InternalMessage:**
- Purpose: Normalized representation of a message from any platform
- Defined in: `src/types/index.ts`
- Pattern: All gateway adapters convert platform-specific messages to this format
- Fields: `id`, `userId`, `platform`, `conversationId`, `type`, `content`, `attachments`, `flags`, `timestamp`

**ILlmProvider:**
- Purpose: Abstract interface for any LLM API provider
- Defined in: `src/providers/ILlmProvider.ts`
- Pattern: Strategy pattern -- `AnthropicProvider` and `OpenRouterProvider` implement the same interface
- Method: `chat(messages, tools?, config?) => Promise<LlmResponse>`

**BaseTool:**
- Purpose: Abstract base class for all tools the agent can call
- Defined in: `src/tools/BaseTool.ts`
- Pattern: Template method -- subclasses implement `execute()`, base provides `toDefinition()`, `success()`, `error()`
- Registered into `ToolRegistry` singleton at startup

**SkillMetadata:**
- Purpose: Parsed metadata from a skill's SKILL.md YAML frontmatter
- Defined in: `src/types/index.ts`
- Pattern: Skills are filesystem-based, hot-reloaded (no cache in `SkillLoader`)

**SchemaManager (Lazy Table Creation):**
- Purpose: Create database tables on-demand when a module first needs them
- Defined in: `src/infra/SchemaManager.ts`
- Pattern: Registry of SQL schemas with dependency tracking; `ensureTable()` is idempotent
- Contains schemas for: agents, agent_communications, agent_dependencies, permissions, activity_logs, lessons_learned, weekly_reports, pairing_requests, openrouter_models, conversation_summaries, recovery_state

## Entry Points

**Main Entry:**
- Location: `src/index.ts`
- Triggers: `npm run dev` (tsx watch) or `npm start` (compiled)
- Responsibilities: Boot sequence -- Database, Migrations, Vault, Memory, Tools, Auth, Controller, Permissions, SelfImprovement, Gateway adapters (Telegram, Discord, WhatsApp, API)

**REST API Entry:**
- Location: `src/gateway/adapters/api/APIRestAdapter.ts`
- Triggers: HTTP requests to port 3000 (configurable via API_PORT)
- Routes: `GET /health`, `POST /api/message`, `GET /api/status`
- Auth: Bearer token from vault or env (`API_ACCESS_KEY`)

**Telegram Entry:**
- Location: `src/gateway/adapters/telegram/TelegramInputAdapter.ts`
- Triggers: Telegram bot long polling via grammY
- Handles: text messages, documents (PDF/MD), voice (placeholder), abort commands

**Discord Entry:**
- Location: `src/gateway/adapters/discord/DiscordAdapter.ts`
- Triggers: Discord.js client events (DMs and mentions)

## Error Handling

**Strategy:** Graceful degradation with non-fatal fallbacks

**Patterns:**
- **Database unavailable:** System runs in "degraded mode" without persistence -- `Database.isConnected()` checked before every DB operation
- **LLM errors:** `AgentLoop` catches provider errors and returns error status; providers have retry with exponential backoff (1s, 3s, 6s) and permanent error detection (400, 401, 403, 404)
- **Tool errors:** `ToolFactory` wraps execution in try-catch with 30s timeout; errors returned as `ToolResult` with `success: false`
- **Embedding failures:** Fire-and-forget; message saved without embedding if generation fails
- **Logging failures:** Logger silently catches DB errors -- logging never crashes the application
- **Recovery:** `RecoveryManager` detects repeated crashes (3+ in 10 minutes) and activates safe mode (disables sub-agents and self-improvement)
- **Abort:** Users can abort processing with keywords (para/cancela/stop); `AgentLoop.requestAbort()` checked before each iteration and tool execution

## Cross-Cutting Concerns

**Logging:**
- `Logger` singleton at `src/infra/Logger.ts`
- Dual output: console (always) + PostgreSQL `activity_logs` table (when DB connected)
- Automatic redaction of API keys, tokens, and passwords in log output
- On-demand table creation via `SchemaManager`

**Validation:**
- Input validation in gateway adapters (authentication check, content type filtering)
- JSON validation in `AgentLoop` before tool execution (invalid JSON does not count as iteration)
- Tool argument validation delegated to individual tool implementations

**Authentication:**
- `AuthenticationGateway` facade at `src/security/AuthenticationGateway.ts`
- DM policies: `allowlist` (default), `pairing`, `open`, `disabled`
- Owner always authorized via `OwnerValidator`
- Pairing flow: unknown users get a code, owner approves/denies
- Each gateway adapter calls `authenticate()` before processing any message

**Secret Management:**
- `VaultManager` at `src/security/VaultManager.ts` -- AES-encrypted credential store
- `readOrEnv()` method: vault first, then environment variable fallback
- Master key generated per installation, stored at `data/vault/vault.key`

---

*Architecture analysis: 2026-03-24*
