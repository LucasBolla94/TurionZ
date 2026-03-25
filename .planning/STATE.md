---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: milestone
status: Phase complete — ready for verification
last_updated: "2026-03-25T18:29:56.058Z"
progress:
  total_phases: 18
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# TurionZ — Project State

**Last updated:** 2026-03-25

## Current Position

Phase: 12 (skill-system) — EXECUTING
Plan: 2 of 2

## Recently Completed

- Phase 1: Project Setup & Types ✅
- Phase 2: Database (PostgreSQL + Hybrid Strategy) ✅
- Phase 3: Vault (Encrypted Credentials) ✅
- Phase 4: LLM Providers (Anthropic + OpenRouter) ✅
- Phase 5: Memory Manager ✅
- Phase 6: Tool Registry & Built-in Tools ✅
- Phase 7: Agent Loop (ReAct Engine) ✅
- Phase 8: Authentication ✅
- Phase 9: Telegram Gateway ✅
- Phase 10: Agent Controller ✅
- Phase 11: Permissions System ✅

## In Progress

- Phase 12: Skill System (Loader + Router + Executor)

## Key Decisions Made

1. **DB Strategy:** Caminho C (hybrid) — 3 essential tables on startup, rest on-demand
2. **Multi-tool calls:** Execute all, return all results labeled, trust the LLM (Claude Code style)
3. **Sub-agent hierarchy:** Max 3 sub-sub-agents per sub-agent, mandatory verifier
4. **Communication:** Centralized through TurionZ (never direct between sub-agents)
5. **Provider split:** TurionZ = Anthropic API (Opus), Sub-agents = OpenRouter
6. **Embedding:** nomic-embed local, runs independently on CPU
7. **Context window:** 150k tokens, auto-summary at 70%
8. **Permissions:** Ask once, remember forever, always communicate
9. **Mode:** Interactive (user confirms decisions)
10. **Personality:** Thor — professional, friendly, dark humor, straight to the point
11. **Skill tools:** chokidar v4 for CJS compat; tool names prefixed with skill name for collision prevention
12. **SkillRouter provider:** Using ProviderFactory.createMain() (no createCheap yet); routing should ideally use cheaper model
13. **Skill tool lifecycle:** Tools scoped per-message — registered before AgentLoop, cleaned up after to prevent leaking

## Architecture Highlights

- TypeScript OOP with Classes and Interfaces
- PostgreSQL + pgvector for vector search
- ReAct pattern for reasoning loop
- Plugin-based skills with hot-reload
- Multi-platform gateway (Telegram first, then Discord, WhatsApp, API)
- AES-256-GCM vault for credentials
- Weekly self-improvement with change verification

## Open Issues

- [ ] Define exact Whisper model for CPU STT (small vs medium)
- [ ] WhatsApp library decision (whatsapp-web.js vs Baileys)
- [ ] API REST auth method (API key vs JWT)
- [ ] Sub-agent timeout configuration (5min? 10min?)
- [ ] Sub-agents read-only access to memory_search

## Session Continuity

Last work: Completed 12-02-PLAN.md (Skill Pipeline Integration)
Next action: Phase 12 verification, then proceed to Phase 13
