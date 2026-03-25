---
phase: 12-skill-system
plan: 01
subsystem: skills
tags: [chokidar, hot-reload, cross-language, child-process, filesystem-watcher]

requires:
  - phase: 06-tools
    provides: "BaseTool abstract class and ToolRegistry singleton"
  - phase: 12-skill-system
    provides: "SkillLoader and SkillExecutor from prior phases"
provides:
  - "ExternalTool class for cross-language script execution via spawn"
  - "SkillToolBridge for loading/unloading skill tools with prefix namespacing"
  - "SkillWatcher for filesystem hot-reload with chokidar"
  - "Cached SkillLoader with invalidateCache() for watcher integration"
  - "SkillToolManifest type for future manifest-based tool metadata"
affects: [12-02-PLAN, agent-controller, sub-agents]

tech-stack:
  added: [chokidar@4]
  patterns: [prefixed-tool-names, debounced-filesystem-watching, cache-invalidation-pattern, json-stdin-stdout-protocol]

key-files:
  created:
    - src/skills/ExternalTool.ts
    - src/skills/SkillToolBridge.ts
    - src/skills/SkillWatcher.ts
  modified:
    - src/skills/SkillLoader.ts
    - src/types/index.ts

key-decisions:
  - "Used chokidar v4 (not v5) for CommonJS compatibility with project tsconfig"
  - "Tool names prefixed with skill name (e.g. prd-manager.validate_prd) to prevent collisions"
  - "JSON stdin/stdout protocol for cross-language tool communication with 30s default timeout"
  - "Cache-through pattern: loadAll() returns cache, scanSkills() does actual filesystem read"

patterns-established:
  - "Prefixed tool naming: {skillName}.{toolName} for namespace isolation"
  - "Debounced filesystem watching: 250ms default to batch rapid changes"
  - "Cache invalidation callback: watcher triggers loader.invalidateCache()"

requirements-completed: [REQ-036, REQ-037]

duration: 3min
completed: 2026-03-25
---

# Phase 12 Plan 01: Skill System Infrastructure Summary

**Cross-language ExternalTool with spawn-based JSON protocol, SkillToolBridge for tool loading/unloading, chokidar SkillWatcher with debounce, and cached SkillLoader with invalidation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T18:19:33Z
- **Completed:** 2026-03-25T18:23:14Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ExternalTool extends BaseTool with child_process.spawn for TypeScript, JavaScript, Python, and Bash scripts
- SkillToolBridge loads tool files from skill directories and creates prefixed ExternalTool instances
- SkillWatcher uses chokidar v4 with 250ms debounce for hot-reload detection
- SkillLoader upgraded with in-memory cache and invalidateCache() method for watcher integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Install chokidar, add SkillToolManifest type, build ExternalTool and SkillToolBridge** - `84c6293` (feat)
2. **Task 2: Create SkillWatcher and upgrade SkillLoader with cache + invalidation** - `76040a5` (feat)

## Files Created/Modified
- `src/skills/ExternalTool.ts` - BaseTool subclass wrapping cross-language scripts via child_process.spawn
- `src/skills/SkillToolBridge.ts` - Loads tool files from skill tools/ directory, creates prefixed ExternalTool instances
- `src/skills/SkillWatcher.ts` - Filesystem watcher with chokidar v4 and debounced reload callback
- `src/skills/SkillLoader.ts` - Added cache layer, invalidateCache(), getSkillsDir() accessor
- `src/types/index.ts` - Added SkillToolManifest interface

## Decisions Made
- Used chokidar v4 (not v5) because v5 is ESM-only and project uses CommonJS
- Tool names prefixed with skill name to prevent collisions across skills
- Generic fallback parameters when no manifest available (input: string)
- Platform-aware Python command detection (python on Windows, python3 on Unix)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four infrastructure files ready for Plan 02 to wire into AgentController pipeline
- SkillWatcher + SkillLoader cache invalidation pattern ready for integration
- SkillToolBridge + ExternalTool ready to load and execute cross-language skill tools

---
*Phase: 12-skill-system*
*Completed: 2026-03-25*
