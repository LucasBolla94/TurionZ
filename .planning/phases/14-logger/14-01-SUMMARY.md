---
phase: 14-logger
plan: "01"
subsystem: infra
tags: [logging, postgresql, batch-insert, structured-logging, activity-tracking]

requires:
  - phase: 02-database
    provides: Database singleton and SchemaManager for on-demand table creation
provides:
  - ActivityLogger service with batched PostgreSQL inserts
  - Structured logging across AgentLoop, SubAgentManager, AgentController
  - Query API for activity logs with filters
  - Graceful shutdown flush
affects: [self-improvement, recovery, monitoring, analytics]

tech-stack:
  added: []
  patterns: [singleton-batch-logger, flush-on-shutdown, structured-activity-logging]

key-files:
  created:
    - src/infra/ActivityLogger.ts
  modified:
    - src/types/index.ts
    - src/infra/SchemaManager.ts
    - src/core/AgentLoop.ts
    - src/agents/SubAgentManager.ts
    - src/core/AgentController.ts
    - src/index.ts

key-decisions:
  - "ActivityLogger as separate class from existing Logger — Logger handles basic console+DB logging, ActivityLogger handles structured batched activity tracking"
  - "Batch insert buffer of 10 entries with 2s flush interval — balances write efficiency with data freshness"
  - "Timer uses unref() to prevent blocking process exit"

patterns-established:
  - "Batch logging pattern: buffer entries, flush on size threshold or timer, graceful shutdown"
  - "Structured activity tracking: every component logs via ActivityLogger convenience methods"

requirements-completed: [REQ-044]

duration: 5min
completed: 2026-03-28
---

# Phase 14 Plan 01: ActivityLogger Service Summary

**Centralized ActivityLogger with batched PostgreSQL inserts, structured logging for LLM calls, tool executions, agent lifecycle, and system events across all components**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T20:34:05Z
- **Completed:** 2026-03-28T20:41:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created ActivityLogger singleton with batch insert buffer (10 entries, 2s flush)
- Added convenience methods: logToolCall, logLlmCall, logAgentLifecycle, logSystemEvent
- Added query method with component, agentId, action, time range filters
- Integrated logging into AgentLoop (LLM calls, tool calls, loop lifecycle)
- Integrated logging into SubAgentManager (create, run, complete, fail, cancel, communication)
- Integrated logging into AgentController (message processing, skill routing, initialization)
- Added graceful shutdown with flush in index.ts (SIGINT/SIGTERM handlers)

## Task Commits

Each task was committed atomically:

1. **Task 1: ActivityLogger core + DB integration** - `35e037a` (feat)
2. **Task 2: Integration into all components** - `5c7e418` (feat)

## Files Created/Modified

- `src/infra/ActivityLogger.ts` - Singleton logging service with batched DB inserts, query support, credential redaction
- `src/types/index.ts` - Added ActivityLogEntry and LogQueryFilters interfaces
- `src/infra/SchemaManager.ts` - Updated activity_logs schema with agent_id, component, model, tokens_in/out columns and indexes
- `src/core/AgentLoop.ts` - Logs LLM calls, tool calls, loop start/end lifecycle
- `src/agents/SubAgentManager.ts` - Logs agent create/run/complete/fail/cancel and communications
- `src/core/AgentController.ts` - Logs message processing start/end, skill routing, initialization
- `src/index.ts` - Logs startup/shutdown events, graceful shutdown flush

## Decisions Made

- ActivityLogger is a separate class from the existing Logger to avoid breaking existing Logger consumers while adding richer structured logging
- Batch buffer size of 10 with 2s flush interval balances write efficiency vs data freshness
- Timer uses unref() to not block Node.js process exit
- Updated SchemaManager schema preserves backward compatibility (old columns kept as defaults)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved backward-compatible schema columns**
- **Found during:** Task 1
- **Issue:** Existing Logger uses agent_type, agent_name, tokens_used columns. Plan schema would break existing Logger.
- **Fix:** Kept old columns (agent_type, agent_name, tokens_used) with defaults alongside new columns (agent_id, component, model, tokens_in, tokens_out)
- **Files modified:** src/infra/SchemaManager.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** 35e037a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Schema backward compatibility maintained. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Activity logging infrastructure fully operational for all components
- Ready for self-improvement module to query logs for analysis
- Ready for monitoring/analytics dashboards to consume structured log data

## Self-Check: PASSED

All 7 files verified present. Both task commits (35e037a, 5c7e418) verified in git log.

---
*Phase: 14-logger*
*Completed: 2026-03-28*
