---
phase: 16-self-improvement
plan: "01"
subsystem: infra
tags: [self-improvement, weekly-analysis, openrouter, llm-analysis, lessons-learned]

# Dependency graph
requires:
  - phase: 04-llm-providers
    provides: OpenRouter provider for cheap model analysis
  - phase: 05-memory
    provides: Conversation and message storage for data collection
  - phase: 14-activity-logger
    provides: Activity logs for error and event tracking
  - phase: 15-recovery
    provides: recovery_state table for scheduler persistence
provides:
  - SelfImprover singleton with 5-step weekly analysis cycle
  - Lesson and WeeklyReport types for self-improvement data
  - Lessons injection into AgentController system prompt
  - getWeeklyReport() and getLessons() query APIs
affects: [agent-controller, system-prompt, memory]

# Tech tracking
tech-stack:
  added: []
  patterns: [weekly-scheduler-with-recovery, fragment-and-analyze, change-verification-loop]

key-files:
  created:
    - src/core/SelfImprover.ts
  modified:
    - src/types/index.ts
    - src/index.ts
    - src/core/AgentController.ts

key-decisions:
  - "Analysis model configurable via ANALYSIS_MODEL env var (default: meta-llama/llama-3.1-8b-instruct)"
  - "Scheduler uses setInterval hourly check pattern with recovery_state persistence"
  - "Lessons injected into system prompt via getLessonsForContext() with max 10 entries"
  - "Harmful changes automatically reverted from both DB and MEMORY.md"

patterns-established:
  - "Fragment-and-analyze: split large text into ~20k token chunks for cheap model processing"
  - "Change verification loop: beneficial/harmful/neutral verdicts with automatic revert"
  - "Recovery-persistent scheduling: track last run date in recovery_state table"

requirements-completed: [REQ-045, REQ-046, REQ-047, REQ-048]

# Metrics
duration: 11min
completed: 2026-03-28
---

# Phase 16 Plan 01: Weekly Self-Analysis Engine Summary

**SelfImprover service with 5-step weekly cycle: collect conversations/logs, fragment large datasets, analyze with cheap OpenRouter model, verify previous changes, and apply lessons to MEMORY.md and system prompt**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-28T23:46:10Z
- **Completed:** 2026-03-28T23:57:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Full 5-step self-improvement cycle (COLLECT, FRAGMENT, ANALYZE, VERIFY, APPLY) in SelfImprover singleton
- Configurable analysis model via ANALYSIS_MODEL env var, default to cheap llama-3.1-8b-instruct
- Lessons automatically injected into AgentController system prompt for every conversation
- Previous week changes verified as beneficial/harmful/neutral with automatic revert of harmful changes
- Scheduler survives restarts via recovery_state table persistence

## Task Commits

Each task was committed atomically:

1. **Task 1: SelfImprover core service** - `9ec7667` (feat)
2. **Task 2: Integration and scheduling** - `ae9bdbd` (feat)

## Files Created/Modified
- `src/core/SelfImprover.ts` - Full 5-step weekly analysis engine with scheduling, fragmentation, LLM analysis, change verification, and MEMORY.md management
- `src/types/index.ts` - Added Lesson, WeeklyReport, ChangeVerification, ChangeVerdict, LessonCategory types
- `src/index.ts` - Replaced SelfImprovement with SelfImprover, added shutdown cleanup
- `src/core/AgentController.ts` - Added getWeeklyReport(), getLessons(), buildSystemPromptWithLessons() with lessons injection

## Decisions Made
- Used `meta-llama/llama-3.1-8b-instruct` as default analysis model (cheapest, configurable via env var)
- Scheduler checks hourly with day/hour validation instead of cron dependency
- Last run date persisted in recovery_state table (component: `self_improver:weekly`)
- MEMORY.md capped at 20 lesson entries to prevent unbounded growth
- Activity logs summarized as action counts (not raw details) to save tokens during analysis

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Analysis model can be customized via `ANALYSIS_MODEL` environment variable.

## Next Phase Readiness
- Self-improvement cycle complete and integrated into startup/shutdown lifecycle
- AgentController enriches every conversation with learned lessons
- Ready for verification phase or next milestone work

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 16-self-improvement*
*Completed: 2026-03-28*
