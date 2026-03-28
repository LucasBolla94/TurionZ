# TurionZ — Roadmap (GSD Format)

**Created by:** BollaNetwork
**Milestone:** v0.1 — MVP
**Date:** 2026-03-24

## Phase Overview

| # | Phase | Requirements | Status |
|---|-------|-------------|--------|
| 1 | Project Setup & Types | REQ-018 | done |
| 2 | Database (PostgreSQL + Hybrid Strategy) | REQ-012, REQ-018 | done |
| 3 | Vault (Encrypted Credentials) | REQ-019 | done |
| 4 | LLM Providers (Anthropic + OpenRouter) | REQ-009, REQ-010 | done |
| 5 | Memory Manager (Context + Embedding) | REQ-012, REQ-013, REQ-014, REQ-015, REQ-016, REQ-017 | done |
| 6 | Tool Registry & Built-in Tools | REQ-040, REQ-041 | done |
| 7 | Agent Loop (ReAct Engine) | REQ-001 to REQ-008 | done |
| 8 | Authentication (Whitelist + Pairing) | REQ-020 | done |
| 9 | Telegram Gateway (Input + Output) | REQ-026, REQ-027, REQ-028, REQ-029 | done |
| 10 | Agent Controller (Facade) | REQ-022, REQ-024, REQ-028 | done |
| 11 | Permissions System | REQ-021, REQ-022 | done |
| 12 | 2/2 | Complete    | 2026-03-25 |
| 13 | 1/2 | In Progress|  |
| 14 | Logger (Bolla Network) | REQ-044 | planned |
| 15 | Recovery & Auto-Start | REQ-042, REQ-043 | planned |
| 16 | Self-Improvement (Weekly Analysis) | REQ-045, REQ-046, REQ-047, REQ-048 | planned |
| 17 | SkillCreator (Fixed Sub-Agent) | REQ-038, REQ-039 | planned |
| 18 | Integration & E2E Testing | All REQs | planned |

## Phase Details

### Phase 1: Project Setup & Types — done
**Goal:** Initialize project structure, TypeScript config, and all shared interfaces.
**Success:** `npm run build` compiles without errors. All types defined.
**Spec:** specs/roadmap_v0.1.md (Fase 0)

### Phase 2: Database (PostgreSQL + Hybrid Strategy) — done
**Goal:** PostgreSQL connection with Caminho C — 3 essential tables on startup, rest on-demand.
**Success:** Connection pool works. Essential tables auto-create. On-demand tables create when first needed.
**Spec:** specs/memory.md, specs/architecture.md

### Phase 3: Vault (Encrypted Credentials) — done
**Goal:** AES-256-GCM encrypted credential storage. Thor creates and manages the master key.
**Success:** Store, read, list credentials. Key auto-generated on first run.
**Spec:** specs/vault.md

### Phase 4: LLM Providers (Anthropic + OpenRouter) — done
**Goal:** TurionZ uses Claude Opus via Anthropic API. Sub-agents use OpenRouter. ProviderFactory routes correctly.
**Success:** AnthropicProvider works for main agent. OpenRouterProvider works for sub-agents. Monthly model sync.
**Spec:** specs/architecture.md

### Phase 5: Memory Manager (Context + Embedding) — done
**Goal:** Full memory system with 150k token window, auto-summary, memory_search, nomic-embed local, prompt caching.
**Success:** Messages persist. Context window respects limit. Summary triggers at 70%. memory_search returns relevant results.
**Spec:** specs/memory.md

### Phase 6: Tool Registry & Built-in Tools — done
**Goal:** Dynamic tool registry with built-in tools (file operations, command execution, web search, memory_search).
**Success:** Tools register dynamically. AgentLoop can discover and execute tools.
**Spec:** specs/roadmap_v0.1.md (Fase 6)

### Phase 7: Agent Loop (ReAct Engine) — done
**Goal:** Core reasoning engine with multi-tool calls, retry with backoff, abort detection, health checks, labeled results.
**Success:** Loop processes messages, executes multiple tools per round, handles errors gracefully, respects MAX_ITERATIONS.
**Spec:** specs/agent-loop.md

### Phase 8: Authentication (Whitelist + Pairing) — done
**Goal:** User auth by platform-specific numeric ID. Whitelist + pairing flow. Silent rejection.
**Success:** Authorized users pass. Unknown users get pairing code or silence. Owner always passes.
**Spec:** specs/authentication.md

### Phase 9: Telegram Gateway (Input + Output) — done
**Goal:** Telegram adapter via grammy. Receives text/voice/documents, translates to InternalMessage, sends responses back.
**Success:** Messages flow in and out of Telegram. Voice transcribed. Documents processed.
**Spec:** specs/telegram-input.md, specs/telegram-output.md, specs/gateway.md

### Phase 10: Agent Controller (Facade) — done
**Goal:** Central facade that orchestrates: validate auth → load personality → get context → route skill → run loop → send response.
**Success:** End-to-end message processing from gateway to response.
**Spec:** specs/architecture.md

### Phase 11: Permissions System — done
**Goal:** "Ask once, remember forever" permission system. Free actions vs dangerous actions. Always communicate.
**Success:** Dangerous actions prompt user first time. Permission saved in DB. Next time executes with communication.
**Spec:** specs/permissions.md

### Phase 12: Skill System (Loader + Router + Executor) — in-progress
**Goal:** Full skill pipeline. Hot-reload from .agents/skills/. Skills with own tools in any language. Sub-agents can use designated skills.
**Success:** Drop a skill folder → recognized next message. Router picks correct skill. Executor injects into loop. Tools from skills work.
**Spec:** specs/skill-user.md
**Plans:** 2/2 plans complete

Plans:
- [x] 12-01-PLAN.md — Infrastructure: SkillWatcher (hot-reload), ExternalTool, SkillToolBridge (cross-language tools), cached SkillLoader
- [x] 12-02-PLAN.md — Pipeline wiring: AgentController integration (Loader->Router->Executor), sub-agent skill access

### Phase 13: Sub-Agent Manager — planned
**Goal:** TurionZ creates unlimited sub-agents. Each can create up to 3 sub-sub-agents. Mandatory verifier. Centralized communication. Dependency waiting.
**Success:** Sub-agents work independently, verify before delivering, communicate through TurionZ, respect hierarchy.
**Spec:** specs/sub-agents.md

### Phase 14: Logger (Bolla Network) — planned
**Goal:** Structured activity logging to PostgreSQL. Every action from every agent logged with timestamps, tokens, duration.
**Success:** Full audit trail. Can trace any action by any agent.
**Spec:** specs/architecture.md (Section 2.6)

### Phase 15: Recovery & Auto-Start — planned
**Goal:** Auto-start with OS. Recover state from PostgreSQL after crash. Verify file integrity. Resume where stopped. Notify user.
**Success:** Kill process → restart → resumes correctly. Corrupt files detected and remade. User notified.
**Spec:** specs/recovery.md

### Phase 16: Self-Improvement (Weekly Analysis) — planned
**Goal:** Automatic weekly analysis every Sunday. Break conversations into chunks. Generate lessons. Verify previous changes (keep or revert). Use cheap model.
**Success:** Lessons generated. Changes applied subtly. Previous changes verified. Everything logged.
**Spec:** specs/self-improvement.md

### Phase 17: SkillCreator (Fixed Sub-Agent) — planned
**Goal:** Always-present sub-agent that creates complete skills (SKILL.md + tools + templates). Tests everything before installing. Hot-reload after install.
**Success:** "Create a translation skill" → SkillCreator builds, tests, installs, and skill is immediately available.
**Spec:** specs/skill-user.md (Section 4.4)

### Phase 18: Integration & E2E Testing — planned
**Goal:** End-to-end testing of all components working together. Full flow from Telegram message to response with sub-agents, skills, memory, and personality.
**Success:** Complete user journey works. All specs met. All edge cases handled.
**Spec:** All specs
