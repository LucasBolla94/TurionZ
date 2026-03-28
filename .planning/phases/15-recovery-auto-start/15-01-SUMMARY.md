---
phase: 15-recovery-auto-start
plan: "01"
subsystem: infra
tags: [recovery, auto-start, systemd, launchd, task-scheduler, checkpoints, safe-mode]

requires:
  - phase: 02-database
    provides: PostgreSQL connection, SchemaManager for on-demand tables
  - phase: 07-agent-loop
    provides: AgentLoop ReAct engine where checkpoints are saved
  - phase: 13-sub-agent-manager
    provides: Agent status tracking in agents table
  - phase: 14-activity-logger
    provides: ActivityLogger for system event logging

provides:
  - RecoveryManager with full startup sequence and checkpoint CRUD
  - Checkpoint saving before each AgentLoop iteration
  - Safe mode detection (3 crashes in 10 minutes)
  - Critical file integrity verification (SOUL.md, IDENTITY.md, MEMORY.md)
  - Interrupted agent recovery on boot
  - Auto-start scripts for Linux (systemd), Windows (Task Scheduler), macOS (launchd)
  - Graceful shutdown with checkpoint persistence

affects: [self-improvement, gateway, controller]

tech-stack:
  added: []
  patterns: [checkpoint-before-iteration, safe-mode-degradation, cross-platform-autostart]

key-files:
  created:
    - scripts/autostart-linux.sh
    - scripts/autostart-windows.ps1
    - scripts/autostart-mac.plist
  modified:
    - src/infra/RecoveryManager.ts
    - src/core/AgentLoop.ts
    - src/types/index.ts
    - src/index.ts

key-decisions:
  - "Checkpoint saved before each AgentLoop iteration using component key pattern (agent_loop:main or agent_loop:{agentId})"
  - "Safe mode marks interrupted agents as failed instead of resetting them to created"
  - "StartupReport interface provides structured diagnostics for boot sequence results"

patterns-established:
  - "Checkpoint pattern: save before work, clear on success, recover on restart"
  - "Safe mode degradation: 3 crashes in 10 min disables sub-agents and self-improvement"

requirements-completed: [REQ-042, REQ-043]

duration: 16min
completed: 2026-03-28
---

# Phase 15 Plan 01: Recovery & Auto-Start Summary

**RecoveryManager with checkpoint CRUD, safe mode detection, startup sequence, and cross-platform auto-start scripts (systemd, Task Scheduler, launchd)**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-28T22:32:45Z
- **Completed:** 2026-03-28T22:49:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Enhanced RecoveryManager with full startup sequence: DB connect, checkpoint recovery, file integrity check, agent recovery, temp cleanup, startup report
- Added checkpoint saving to AgentLoop before each iteration with automatic clearing on completion
- Created auto-start scripts for all 3 target operating systems with install/uninstall/status commands
- Integrated graceful shutdown with checkpoint persistence in index.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: RecoveryManager core** - `f1b996f` (feat)
2. **Task 2: Auto-start scripts + boot integration** - `46c139e` (feat)

## Files Created/Modified
- `src/infra/RecoveryManager.ts` - Full recovery system with checkpoint CRUD, startup sequence, safe mode, agent recovery
- `src/core/AgentLoop.ts` - Checkpoint saving before each iteration, clearing on completion
- `src/types/index.ts` - StartupReport interface
- `src/index.ts` - runStartupSequence() integration, shutdown checkpoint saving
- `scripts/autostart-linux.sh` - systemd service with install/uninstall, auto-restart, security hardening
- `scripts/autostart-windows.ps1` - Task Scheduler via PowerShell, logon trigger, restart on failure
- `scripts/autostart-mac.plist` - launchd plist with KeepAlive, crash restart, throttle interval

## Decisions Made
- Checkpoint key uses pattern `agent_loop:main` for TurionZ and `agent_loop:{agentId}` for sub-agents, enabling per-agent recovery
- Safe mode marks interrupted agents as failed (not reset to created) to prevent cascading failures
- StartupReport is a structured interface returned by runStartupSequence() for programmatic access to boot diagnostics
- macOS plist uses YOURUSER placeholder since paths are system-specific

## Deviations from Plan

None - plan executed exactly as written. RecoveryManager already existed with partial implementation from a previous phase; this plan enhanced it to full spec compliance.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Auto-start scripts require manual installation per OS.

## Next Phase Readiness
- Recovery system complete and integrated into boot sequence
- Checkpoints saved during agent execution, recovered on restart
- Auto-start scripts ready for deployment on all target platforms
- Safe mode provides degraded operation during crash loops

---
*Phase: 15-recovery-auto-start*
*Completed: 2026-03-28*
