# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
TurionAgent/
├── .agents/                    # Personality system (runtime config, not code)
│   ├── SOUL.md                 # Core personality definition
│   ├── IDENTITY.md             # Agent identity metadata
│   ├── MEMORY.md               # Learned context (auto-updated by SelfImprovement)
│   └── skills/                 # Hot-loadable skill definitions
│       └── skill-creator/      # Example skill folder
│           └── SKILL.md        # Skill definition with YAML frontmatter
├── .planning/                  # GSD planning documents
│   └── codebase/               # Codebase analysis documents
├── data/                       # Runtime data (gitignored secrets)
│   ├── embeddings/             # Local embedding storage (future)
│   └── vault/                  # Encrypted credential store
│       ├── vault.enc           # Encrypted credentials (JSON)
│       ├── vault.key           # AES master key
│       └── vault.meta          # Vault metadata
├── specs/                      # Design specifications and docs
│   ├── PRD.md                  # Product Requirements Document
│   ├── architecture.md         # Architecture spec
│   ├── agent-loop.md           # ReAct loop spec
│   ├── authentication.md       # Auth system spec
│   ├── gateway.md              # Gateway pattern spec
│   ├── memory.md               # Memory system spec
│   ├── permissions.md          # Permission system spec
│   ├── personality.md          # Personality engine spec
│   ├── recovery.md             # Recovery system spec
│   ├── self-improvement.md     # Self-improvement spec
│   ├── skill-user.md           # Skill system spec
│   ├── sub-agents.md           # Sub-agent hierarchy spec
│   ├── telegram-input.md       # Telegram input spec
│   ├── telegram-output.md      # Telegram output spec
│   ├── vault.md                # Vault system spec
│   └── roadmap_v0.1.md         # Version 0.1 roadmap
├── src/                        # All source code
│   ├── index.ts                # Application entry point (boot sequence)
│   ├── types/
│   │   └── index.ts            # All shared interfaces and types
│   ├── core/                   # Brain — controller, loop, personality
│   │   ├── AgentController.ts  # Facade orchestrating all subsystems
│   │   ├── AgentLoop.ts        # ReAct reasoning engine
│   │   └── PersonalityEngine.ts # Loads .agents/ personality files
│   ├── providers/              # LLM API providers
│   │   ├── ILlmProvider.ts     # Provider interface
│   │   ├── AnthropicProvider.ts # Direct Anthropic API (for Thor)
│   │   ├── OpenRouterProvider.ts # OpenRouter API (for sub-agents)
│   │   └── ProviderFactory.ts  # Factory: createMain() vs createForSubAgent()
│   ├── memory/                 # Conversation and message persistence
│   │   ├── MemoryManager.ts    # Facade for all memory operations
│   │   ├── ConversationRepository.ts # Conversation CRUD
│   │   ├── MessageRepository.ts # Message CRUD + embedding search
│   │   ├── EmbeddingEngine.ts  # Placeholder for nomic-embed local
│   │   └── TokenCounter.ts     # Token estimation for context window
│   ├── tools/                  # Agent tool system
│   │   ├── BaseTool.ts         # Abstract base class for tools
│   │   ├── ToolRegistry.ts     # Singleton tool registry
│   │   ├── ToolFactory.ts      # Tool execution with timeout
│   │   └── builtin/
│   │       └── MemorySearchTool.ts # Built-in semantic memory search
│   ├── skills/                 # Skill loading and routing
│   │   ├── SkillLoader.ts      # Filesystem-based skill loading
│   │   ├── SkillRouter.ts      # LLM-based skill selection
│   │   └── SkillExecutor.ts    # Skill context preparation
│   ├── agents/                 # Sub-agent management
│   │   └── SubAgentManager.ts  # Create, run, verify sub-agents
│   ├── gateway/                # Multi-platform message gateway
│   │   ├── MessageRouter.ts    # Central message routing singleton
│   │   └── adapters/
│   │       ├── telegram/
│   │       │   ├── TelegramInputAdapter.ts  # Message reception, auth, document processing
│   │       │   └── TelegramOutputAdapter.ts # Response formatting, chunking, file upload
│   │       ├── discord/
│   │       │   └── DiscordAdapter.ts        # Discord DM and mention handling
│   │       ├── whatsapp/
│   │       │   └── WhatsAppAdapter.ts       # Placeholder — not yet implemented
│   │       └── api/
│   │           └── APIRestAdapter.ts        # Express REST API (health, message, status)
│   ├── security/               # Authentication, authorization, vault
│   │   ├── AuthenticationGateway.ts  # Auth facade (owner, allowlist, pairing)
│   │   ├── OwnerValidator.ts         # Owner identification per platform
│   │   ├── AllowlistManager.ts       # Authorized users CRUD
│   │   ├── PairingFlowManager.ts     # Pairing code generation and approval
│   │   ├── PermissionManager.ts      # Permission CRUD
│   │   ├── PermissionChecker.ts      # Permission checking logic
│   │   ├── VaultManager.ts           # Encrypted credential store
│   │   ├── CryptoHandler.ts          # AES encryption/decryption
│   │   └── KeyManager.ts             # Master key generation and loading
│   └── infra/                  # Infrastructure and cross-cutting
│       ├── database.ts         # PostgreSQL connection singleton (pg Pool)
│       ├── migrations.ts       # Essential table creation (3 tables at startup)
│       ├── SchemaManager.ts    # On-demand table creation for all modules
│       ├── Logger.ts           # Structured logging with secret redaction
│       ├── RecoveryManager.ts  # Boot sequence, safe mode, crash detection
│       ├── SelfImprovement.ts  # Weekly auto-analysis and MEMORY.md updates
│       └── IntegrityChecker.ts # Startup integrity verification
├── tmp/                        # Temporary files (cleaned on boot)
├── package.json                # Project manifest
├── tsconfig.json               # TypeScript config (ES2022, strict, CommonJS)
└── PRD.md                      # Product Requirements Document (root copy)
```

## Directory Purposes

**`src/core/`:**
- Purpose: The "brain" of the agent -- orchestration and reasoning
- Contains: Controller (facade), AgentLoop (ReAct), PersonalityEngine
- Key files: `AgentController.ts` (264 lines, central orchestrator), `AgentLoop.ts` (264 lines, ReAct engine)

**`src/providers/`:**
- Purpose: LLM API abstraction and factory
- Contains: Interface, two implementations (Anthropic direct, OpenRouter), factory
- Key files: `ProviderFactory.ts` (routes Thor to Anthropic, sub-agents to OpenRouter)

**`src/memory/`:**
- Purpose: All persistence-related logic for conversations and messages
- Contains: Facade, repositories, embedding engine, token counter
- Key files: `MemoryManager.ts` (facade with context window management and summary threshold)

**`src/tools/`:**
- Purpose: Extensible tool system for agent capabilities
- Contains: Abstract base, registry, factory, built-in tools
- Key files: `BaseTool.ts` (extend this for new tools), `ToolRegistry.ts` (register tools here)

**`src/skills/`:**
- Purpose: Hot-loadable skill system from filesystem
- Contains: Loader (reads `.agents/skills/`), Router (LLM selects skill), Executor (prepares prompt injection)
- Key files: `SkillLoader.ts` (hot-reload, no cache)

**`src/agents/`:**
- Purpose: Sub-agent creation, execution, and lifecycle management
- Contains: `SubAgentManager.ts` (417 lines -- the largest file in the codebase)
- Key files: `SubAgentManager.ts` (handles 3-level hierarchy: Thor > sub-agent > sub-sub-agent)

**`src/gateway/`:**
- Purpose: Multi-platform message ingestion and response delivery
- Contains: Central router + platform-specific adapters
- Key files: `MessageRouter.ts` (hub), adapter files per platform

**`src/security/`:**
- Purpose: Authentication, authorization, and secret management
- Contains: Auth gateway, owner validation, allowlist, pairing, permissions, vault with encryption
- Key files: `AuthenticationGateway.ts` (facade), `VaultManager.ts` (encrypted credential store)

**`src/infra/`:**
- Purpose: Cross-cutting infrastructure concerns
- Contains: Database, migrations, schema manager, logging, recovery, self-improvement, integrity checks
- Key files: `database.ts` (PostgreSQL singleton), `SchemaManager.ts` (defines ALL non-essential table schemas)

**`src/types/`:**
- Purpose: Single source of truth for all shared TypeScript interfaces
- Contains: One barrel file with all types
- Key files: `index.ts` (165 lines -- InternalMessage, AgentLoop types, LLM types, Tool types, Skill types, Permission types)

**`.agents/`:**
- Purpose: Thor's personality and skill definitions (runtime configuration, not code)
- Contains: Markdown files loaded by `PersonalityEngine` and `SkillLoader`
- Key files: `SOUL.md` (core personality), `IDENTITY.md` (metadata), `MEMORY.md` (auto-updated learned context)

**`specs/`:**
- Purpose: Design specifications written before implementation
- Contains: 16 spec documents covering every subsystem
- Key files: `architecture.md`, `agent-loop.md`, `sub-agents.md`, `memory.md`

**`data/`:**
- Purpose: Runtime data that should NOT be committed (vault, embeddings)
- Contains: Encrypted vault files, future embedding storage
- Generated: Yes (created at startup by IntegrityChecker and VaultManager)
- Committed: No (should be gitignored)

**`tmp/`:**
- Purpose: Temporary file storage (document downloads, large response files)
- Generated: Yes (cleaned on every boot by RecoveryManager)
- Committed: No

## Key File Locations

**Entry Points:**
- `src/index.ts`: Application bootstrap -- starts all services in order
- `src/gateway/adapters/api/APIRestAdapter.ts`: REST API on port 3000
- `src/gateway/adapters/telegram/TelegramInputAdapter.ts`: Telegram bot
- `src/gateway/adapters/discord/DiscordAdapter.ts`: Discord bot

**Configuration:**
- `package.json`: Dependencies and scripts
- `tsconfig.json`: TypeScript compiler options (ES2022, strict, CommonJS)
- `.agents/SOUL.md`: Thor's personality (loaded as system prompt prefix)
- `.agents/IDENTITY.md`: Thor's identity metadata
- `.agents/MEMORY.md`: Learned context (auto-updated weekly)

**Core Logic:**
- `src/core/AgentController.ts`: Main processing pipeline (message in -> response out)
- `src/core/AgentLoop.ts`: ReAct reasoning loop (LLM call -> tool execution -> repeat)
- `src/providers/ProviderFactory.ts`: Decides which LLM provider to use
- `src/agents/SubAgentManager.ts`: Sub-agent lifecycle management

**Database:**
- `src/infra/database.ts`: PostgreSQL connection pool singleton
- `src/infra/migrations.ts`: Essential tables (conversations, messages, authorized_users)
- `src/infra/SchemaManager.ts`: All other table schemas (11 tables, created on-demand)

**Security:**
- `src/security/AuthenticationGateway.ts`: Auth facade
- `src/security/VaultManager.ts`: Encrypted credential store
- `src/security/PermissionManager.ts`: Permission CRUD

## Naming Conventions

**Files:**
- PascalCase for class files: `AgentController.ts`, `MemoryManager.ts`, `BaseTool.ts`
- camelCase for non-class modules: `database.ts`, `migrations.ts`
- One class per file (matches filename)

**Directories:**
- Lowercase, kebab-case for multi-word: `builtin/`
- Singular nouns for module directories: `core/`, `memory/`, `gateway/`, `security/`, `infra/`
- Plural nouns for collection directories: `tools/`, `skills/`, `agents/`, `providers/`, `types/`
- Platform names for adapter subdirs: `telegram/`, `discord/`, `whatsapp/`, `api/`

**Classes:**
- PascalCase: `AgentController`, `MemoryManager`, `SubAgentManager`
- Singletons use `getInstance()` pattern
- Facade classes end in descriptive name (no suffix): `AuthenticationGateway`, `MemoryManager`

## Where to Add New Code

**New Tool:**
1. Create `src/tools/builtin/MyNewTool.ts` extending `BaseTool`
2. Implement `name`, `description`, `parameters`, and `execute()` method
3. Register in `src/index.ts`: `toolRegistry.register(new MyNewTool())`

**New Platform Adapter:**
1. Create `src/gateway/adapters/{platform}/{PlatformName}Adapter.ts`
2. Follow the pattern: authenticate via `AuthenticationGateway`, normalize to `InternalMessage`, route via `MessageRouter.routeMessage()`
3. Initialize in `src/index.ts` in the Gateways section

**New Skill:**
1. Create `.agents/skills/{skill-name}/SKILL.md` with YAML frontmatter
2. Include `name`, `description`, `version`, `author`, `tools`, `languages` in frontmatter
3. Skill is auto-discovered by `SkillLoader` (hot-reload, no code changes needed)

**New LLM Provider:**
1. Create `src/providers/MyProvider.ts` implementing `ILlmProvider`
2. Implement `chat()` and `getModelName()`
3. Add creation method to `ProviderFactory`

**New Database Table:**
1. Add SQL schema to `TABLE_SCHEMAS` in `src/infra/SchemaManager.ts`
2. Add any dependencies to `TABLE_DEPENDENCIES`
3. Call `SchemaManager.getInstance().ensureTable('my_table')` in the module that needs it

**New Security Module:**
1. Create `src/security/MyModule.ts`
2. If it needs database, use `SchemaManager.ensureTable()` pattern (lazy creation)
3. Wire into `AuthenticationGateway` if it affects auth flow

**New Infrastructure Service:**
1. Create `src/infra/MyService.ts`
2. Use singleton pattern with `getInstance()`
3. Initialize in `src/index.ts` boot sequence

**New Shared Type:**
1. Add interface/type to `src/types/index.ts`
2. Export it (barrel file pattern)

## Special Directories

**`.agents/`:**
- Purpose: Thor's personality, identity, memory, and skill definitions
- Generated: Partially (MEMORY.md auto-updated by SelfImprovement weekly)
- Committed: Yes (personality is part of the project)
- Note: `IntegrityChecker` verifies these files exist at startup

**`.agents/skills/`:**
- Purpose: Hot-loadable skill definitions (each skill = folder with SKILL.md)
- Generated: No (manually created or created by skill-creator skill)
- Committed: Yes
- Note: `SkillLoader` re-reads from filesystem every time (no cache)

**`data/`:**
- Purpose: Runtime-generated data (vault, embeddings, crash logs)
- Generated: Yes (created by IntegrityChecker, VaultManager, RecoveryManager)
- Committed: No (contains secrets and generated data)

**`data/vault/`:**
- Purpose: AES-encrypted credential store
- Generated: Yes (VaultManager creates on first run)
- Committed: No (contains master key and encrypted secrets)

**`tmp/`:**
- Purpose: Temporary files for document processing and large response output
- Generated: Yes (used by TelegramInputAdapter and TelegramOutputAdapter)
- Committed: No
- Note: Cleaned automatically on every boot by RecoveryManager

**`dist/`:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by `tsc` via `npm run build`)
- Committed: No

**`specs/`:**
- Purpose: Design documents written before implementation
- Generated: No (manually authored)
- Committed: Yes
- Note: Reference material, not consumed by the runtime

---

*Structure analysis: 2026-03-24*
