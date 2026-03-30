# TurionZ — Architecture Reference (Self-Fix)

> Thor reads this when he needs to understand how his own system works.

## Core Components

```
User (Telegram/Discord/WhatsApp/API)
  ↓
Gateway Adapters (receive messages, convert to InternalMessage)
  ↓
MessageRouter → AuthenticationGateway (verify user is allowed)
  ↓
AgentController (the brain orchestrator)
  ├── PersonalityEngine (loads SOUL.md, IDENTITY.md, MEMORY.md)
  ├── SkillLoader → SkillRouter → SkillExecutor (skill pipeline)
  ├── MemoryManager (context window, summaries, embedding search)
  └── AgentLoop (ReAct: Thought → Tool Call → Observation → Repeat)
       ├── ToolRegistry (16 built-in tools)
       ├── SubAgentManager (create/run/verify sub-agents)
       └── Provider (OpenRouter API → DeepSeek/Gemini/GPT/Claude)
```

## Key Files

| File | Purpose |
|------|---------|
| src/index.ts | Entry point — startup sequence |
| src/cli.ts | CLI commands (turionz start/stop/restart) |
| src/setup.ts | Interactive setup wizard |
| src/core/AgentController.ts | Main orchestrator |
| src/core/AgentLoop.ts | ReAct reasoning engine |
| src/core/PersonalityEngine.ts | SOUL.md + identity + tool awareness |
| src/core/SelfImprover.ts | Weekly self-analysis |
| src/providers/ProviderFactory.ts | Creates LLM providers |
| src/providers/OpenRouterProvider.ts | OpenRouter API client |
| src/infra/database.ts | PostgreSQL connection |
| src/infra/migrations.ts | Essential table creation |
| src/infra/SchemaManager.ts | On-demand table creation |
| src/infra/SelfHealer.ts | Auto-fix on startup |
| src/infra/ActivityLogger.ts | Structured logging to DB |
| src/infra/RecoveryManager.ts | Crash recovery + checkpoints |
| src/agents/SubAgentManager.ts | Sub-agent lifecycle |
| src/skills/SkillLoader.ts | Load skills from .agents/skills/ |
| src/tools/builtin/*.ts | All built-in tools |

## Configuration

| Env Var | Purpose |
|---------|---------|
| OPENROUTER_API_KEY | API key for all LLM calls |
| MAIN_MODEL | Thor's brain model |
| SUB_AGENT_DEFAULT_MODEL | Default model for sub-agents |
| DATABASE_URL | PostgreSQL connection string |
| TELEGRAM_BOT_TOKEN | Telegram bot token |
| OWNER_TELEGRAM_ID | Owner's Telegram numeric ID |
| OWNER_NAME | Owner's name (used in personality) |
| MAX_ITERATIONS | Max AgentLoop iterations (default 5) |
| CONTEXT_WINDOW_SIZE | Token limit (default 150000) |

## How Messages Flow

1. User sends message on Telegram
2. TelegramInputAdapter converts to InternalMessage
3. MessageRouter passes to AgentController.processMessage()
4. Controller: auth check → load context → skill routing → build prompt
5. AgentLoop runs: LLM thinks → calls tools → observes results → repeat
6. Final response sent back via Telegram

## How Tools Work

Every tool extends BaseTool and has:
- `name` — unique identifier
- `description` — tells LLM when to use it
- `parameters` — JSON Schema of accepted arguments
- `execute(args)` — does the work, returns ToolResult

Tools are registered in src/index.ts at startup.

## How to Add a New Tool

1. Create file: src/tools/builtin/MyNewTool.ts
2. Extend BaseTool, implement name/description/parameters/execute
3. Import and register in src/index.ts
4. Build: npm run build
5. Restart: turionz restart

## How to Add a New Skill

Skills are prompt-based (not code). Drop a folder in .agents/skills/:
```
.agents/skills/my-skill/
├── SKILL.md (instructions + YAML frontmatter)
└── tools/ (optional — executable scripts)
```
Hot-reload detects new skills automatically.
