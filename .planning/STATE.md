---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: milestone
status: Phase complete — ready for verification
last_updated: "2026-03-28T23:58:16.408Z"
progress:
  total_phases: 18
  completed_phases: 5
  total_plans: 8
  completed_plans: 7
---

# TurionZ — Project State

**Last updated:** 2026-03-25

## Current Position

Phase: 16 (self-improvement) — COMPLETE
Plan: 1 of 1 (done)

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
- Phase 13: Sub-Agent Manager ✅ (both plans complete)
- Phase 14: Activity Logger ✅ (1 plan complete)
- Phase 15: Recovery & Auto-Start ✅ (1 plan complete)
- Phase 16: Self-Improvement ✅ (1 plan complete)

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
14. **Verifier verdict parsing:** Keyword search (VERDICT: PASS/FAIL) with last-200-chars fallback; event-based dependency waiting as primary with 5s polling fallback
15. **Agent status:** completed_with_issues for agents that pass work but fail verification after max retries
16. **Sub-agent tools:** Model validation uses static supported list; abortUserLoop changed sync to async for sub-agent cancellation
17. **ActivityLogger:** Separate class from Logger -- Logger handles basic console+DB, ActivityLogger handles structured batched activity tracking with 10-entry buffer and 2s flush
18. **Recovery checkpoints:** Saved before each AgentLoop iteration using component key pattern (agent_loop:main or agent_loop:{agentId}); safe mode marks interrupted agents as failed
19. **Self-improvement model:** Configurable via ANALYSIS_MODEL env var (default: meta-llama/llama-3.1-8b-instruct); scheduler uses hourly check with recovery_state persistence
20. **Lessons in system prompt:** SelfImprover.getLessonsForContext() injects up to 10 recent lessons into every AgentController conversation

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

Last work: Completed 16-01-PLAN.md (Self-Improvement Weekly Analysis)
Next action: Phase 16 verification or next phase
