# Phase 12: Skill System (Loader + Router + Executor) - Research

**Researched:** 2026-03-25
**Domain:** Plugin/skill system with hot-reload, cross-language tool execution, LLM-based routing
**Confidence:** HIGH

## Summary

Phase 12 implements the full skill pipeline for TurionZ: Loader (reads `.agents/skills/` directory), Router (LLM-based skill matching), and Executor (injects skill context + tools into the AgentLoop). The existing codebase already has skeleton implementations of SkillLoader, SkillRouter, and SkillExecutor from Phase 12 scaffolding, but they are incomplete -- notably missing hot-reload via filesystem watching, cross-language tool execution (Python/Bash/etc.), skill-specific tool registration into ToolRegistry, and integration with AgentController.

The primary challenge is threefold: (1) making the Loader watch the filesystem for new/changed skills without restart, (2) building a SkillToolBridge that can load and execute tools written in any language via `child_process.spawn`, and (3) wiring the full pipeline into AgentController so that Router picks a skill, Executor loads its tools into ToolRegistry, and AgentLoop runs with the skill context injected.

OpenClaw (163K GitHub stars) uses a nearly identical architecture -- SKILL.md with YAML frontmatter, directory-based skill loading, filesystem watching with debounce, and precedence-based resolution. TurionZ's existing design aligns well with this proven pattern.

**Primary recommendation:** Complete the existing skeleton classes, add `chokidar` for filesystem watching (hot-reload), build a `SkillToolBridge` class that wraps `child_process.spawn` for cross-language tools, and wire everything through AgentController.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-035 | Pipeline Loader -> Router -> Executor for skills | Skeleton exists in `src/skills/`. Needs completion: hot-reload in Loader, integration in Controller, tool loading in Executor |
| REQ-036 | Hot-reload -- new skill recognized without restart | Use `chokidar` to watch `.agents/skills/` directory. OpenClaw uses same pattern with 250ms debounce |
| REQ-037 | Skills can have own tools (TypeScript, Python, any language) | Build SkillToolBridge using `child_process.spawn` for non-TS tools, dynamic `import()` for TS tools |
| REQ-038 | SkillCreator as fixed sub-agent (creates, tests, installs skills) | Skeleton SKILL.md exists at `.agents/skills/skill-creator/`. Full implementation deferred to Phase 17 per ROADMAP. Phase 12 only needs to ensure the infrastructure supports it |
| REQ-039 | Sub-agents can use skills designated by TurionZ | AgentConfig already has `skills: string[]` field. Executor needs a `loadForSubAgent(skillNames)` method that filters available skills |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No CLAUDE.md file found in the project root. Constraints derived from project STATE.md and architecture specs:

- **Language:** TypeScript OOP with Classes and Interfaces
- **Paradigm:** Classes, Interfaces, Design Patterns (Registry, Factory, Facade)
- **No ORMs:** SQL nativo or lightweight query builder
- **Skills are filesystem-based:** No database table for skills (spec Section 6)
- **Mode:** Interactive (user confirms decisions)
- **Provider split:** TurionZ = Anthropic direct, Sub-agents = OpenRouter

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| js-yaml | 4.1.1 | YAML frontmatter parsing in SKILL.md | Already in package.json. Handles YAML safely |
| pg | 8.20.0 | PostgreSQL (not used for skills, but part of the stack) | Already installed |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chokidar | 5.0.0 | Filesystem watching for hot-reload | 40M+ weekly downloads. Normalizes fs.watch quirks across Windows/Linux/Mac. OpenClaw uses same approach |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chokidar | Node.js native `fs.watch` | Native is simpler but unreliable on Windows (duplicate events, no recursive watching on Linux). Chokidar handles all edge cases |
| chokidar | `fs.watchFile` (polling) | Polling is CPU-heavy. Only use if chokidar has issues |
| gray-matter | js-yaml (manual parse) | gray-matter parses frontmatter + content in one call, but js-yaml is already installed and the manual regex parsing already works in SkillLoader |

**Installation:**
```bash
npm install chokidar
```

**Note:** chokidar v5 is ESM-only and requires Node.js v20+. The project uses Node.js v24, so this is fine. If TypeScript compilation has issues with ESM import, use chokidar v4.x (CommonJS compatible) as fallback.

## Architecture Patterns

### Existing Project Structure (skills)
```
src/skills/
  SkillLoader.ts        # EXISTS - reads .agents/skills/, parses YAML
  SkillRouter.ts        # EXISTS - LLM-based skill selection
  SkillExecutor.ts      # EXISTS - loads skill context for AgentLoop
  SkillToolBridge.ts    # NEW - executes cross-language tools
  SkillWatcher.ts       # NEW - chokidar-based hot-reload

.agents/skills/
  skill-creator/        # EXISTS - skeleton SKILL.md
  <other-skills>/       # Created by SkillCreator or manually
```

### Pattern 1: Pipeline (Loader -> Router -> Executor)
**What:** Chain of Responsibility pattern. Each message flows through the pipeline.
**When to use:** Every incoming message to AgentController.
**Flow:**
```typescript
// In AgentController.processMessage():
// 1. LOADER: Get fresh skill list (hot-reload means always current)
const skills = this.skillLoader.getSkills(); // cached, updated by watcher

// 2. ROUTER: LLM picks the right skill (or null for free conversation)
const skillName = await this.skillRouter.route(userMessage, skills);

// 3. EXECUTOR: Load skill content + tools, inject into AgentLoop
if (skillName) {
  const context = this.skillExecutor.loadSkillContext(skillName, skills);
  const skillPrompt = this.skillExecutor.buildSkillPrompt(context);
  // Inject into system prompt
  systemPrompt += skillPrompt;
  // Register skill tools temporarily
  if (context.toolsDir) {
    this.skillToolBridge.loadSkillTools(context);
  }
}
```

### Pattern 2: SkillToolBridge (Cross-Language Tool Execution)
**What:** Adapter that wraps external scripts as BaseTool instances.
**When to use:** When a skill has tools/ directory with .ts, .py, .sh, etc.
**Design:**
```typescript
class SkillToolBridge {
  // For TypeScript tools: dynamic import() or tsx execution
  // For Python/Bash/other: child_process.spawn with JSON stdin/stdout protocol

  async loadSkillTools(context: SkillContext): BaseTool[] {
    const toolsDir = context.toolsDir;
    // Scan for tool files
    // Create ExternalTool wrapper for each
    // Register in ToolRegistry (with skill prefix for cleanup)
  }

  async unloadSkillTools(skillName: string): void {
    // Unregister all tools prefixed with skill name from ToolRegistry
  }
}
```

### Pattern 3: Cached Loader with Watcher
**What:** SkillLoader caches the skill list in memory. SkillWatcher (chokidar) invalidates cache when files change.
**Why:** Current SkillLoader.loadAll() reads filesystem every call. This is fine for small numbers but becomes slow. Cache + watcher is the OpenClaw pattern.
**Design:**
```typescript
class SkillWatcher {
  private watcher: FSWatcher;
  private debounceTimer: NodeJS.Timeout | null = null;

  start(skillsDir: string, onReload: () => void): void {
    this.watcher = chokidar.watch(skillsDir, {
      depth: 1,           // Only watch skill directories, not deep
      ignoreInitial: true, // Don't fire on initial scan
    });

    this.watcher.on('all', (event, path) => {
      // Debounce 250ms (OpenClaw default)
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => onReload(), 250);
    });
  }
}
```

### Pattern 4: Tool Communication Protocol (JSON stdin/stdout)
**What:** Standard protocol for cross-language tool execution.
**Why:** Tools in Python/Bash need a consistent way to receive arguments and return results.
**Protocol:**
```
INPUT (stdin):  JSON object with tool arguments
OUTPUT (stdout): JSON object { "success": boolean, "output": string }
EXIT CODE:      0 = success, non-zero = error
```

```typescript
class ExternalTool extends BaseTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;

  private command: string;   // "python", "bash", "node"
  private scriptPath: string;

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return new Promise((resolve) => {
      const proc = spawn(this.command, [this.scriptPath], {
        timeout: 30000,
      });
      proc.stdin.write(JSON.stringify(args));
      proc.stdin.end();

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.stderr.on('data', (d) => stderr += d);

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve({ success: result.success, output: result.output });
          } catch {
            resolve({ success: true, output: stdout.trim() });
          }
        } else {
          resolve({ success: false, output: `ERROR: ${stderr || stdout}` });
        }
      });
    });
  }
}
```

### Anti-Patterns to Avoid
- **Loading all skill contents at startup:** Only load YAML frontmatter (name + description) for the catalog. Full SKILL.md content is loaded on-demand when a skill is selected by the Router.
- **Keeping skill tools permanently registered:** Register skill tools only for the duration of the AgentLoop execution, then unregister. Prevents tool name collisions and memory bloat.
- **Synchronous filesystem reads in hot path:** SkillLoader.loadAll() uses sync `fs.readdirSync`. For the watcher callback, use async variants.
- **No timeout on external tool processes:** Always set timeout on `child_process.spawn` (30s default, matching ToolFactory timeout).
- **Hardcoding `python3` on Windows:** Windows uses `python`, Linux uses `python3`. Detect with `process.platform`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filesystem watching | Custom `fs.watch` wrapper | chokidar | fs.watch has 6+ known cross-platform bugs. Chokidar handles all of them |
| YAML parsing | Regex-based parser | js-yaml (already installed) | YAML spec is complex. Edge cases with multiline strings, special characters |
| Process execution | Raw child_process without wrapper | ExternalTool class with timeout, error handling, JSON protocol | Raw spawn has no timeout, no structured output, no error normalization |
| LLM routing prompt | Ad-hoc string concatenation | Structured prompt template in SkillRouter | Prompt engineering is fragile. Template ensures consistent format |

## Common Pitfalls

### Pitfall 1: Chokidar v5 ESM-only on CommonJS Project
**What goes wrong:** `chokidar` v5.0.0 is ESM-only. If `tsconfig.json` targets CommonJS modules, `import chokidar from 'chokidar'` fails at runtime.
**Why it happens:** The project may compile to CommonJS (`"module": "commonjs"` in tsconfig).
**How to avoid:** Check tsconfig.json module target. If CommonJS, either: (a) use dynamic `import()` for chokidar, or (b) install chokidar v4.x which supports CommonJS, or (c) switch project to ESM.
**Warning signs:** `ERR_REQUIRE_ESM` error at runtime.

### Pitfall 2: Python Command Differs by Platform
**What goes wrong:** `python3` works on Linux/Mac, but Windows uses `python`.
**Why it happens:** Windows Python installer registers as `python`, not `python3`.
**How to avoid:** Detect platform: `process.platform === 'win32' ? 'python' : 'python3'`. Or probe with `which python3 || which python`.
**Warning signs:** `ENOENT` error when spawning Python tools on Windows.

### Pitfall 3: Tool Name Collisions Between Skills
**What goes wrong:** Two skills define a tool with the same name (e.g., `analyze_code`). Second registration overwrites the first.
**Why it happens:** ToolRegistry uses tool name as key, skills are independent.
**How to avoid:** Prefix skill tool names with skill name: `prd-manager.generate_prd`. Or use a scoped tool registry per skill.
**Warning signs:** ToolRegistry.register() logs "Overwriting existing tool" warning.

### Pitfall 4: Router LLM Call Cost Adds Up
**What goes wrong:** Every message triggers a Router LLM call, even casual "hello" messages.
**Why it happens:** The Router always asks the LLM to decide which skill to use.
**How to avoid:** Add keyword-based pre-filter before LLM call. If no skill keywords match, skip the LLM call. Or use a very cheap/fast model for routing (e.g., GPT-4o-mini via OpenRouter).
**Warning signs:** High token usage on short conversations.

### Pitfall 5: Skill Tools Not Cleaned Up After Execution
**What goes wrong:** Skill tools remain in ToolRegistry after the AgentLoop finishes. Next message has tools from previous skill.
**Why it happens:** Executor registers tools but nobody unregisters them.
**How to avoid:** Executor must return a cleanup function. AgentController calls it after loop completes.
**Warning signs:** LLM receives tools from a skill that isn't active.

### Pitfall 6: Large SKILL.md Eating Context Window
**What goes wrong:** A skill with 5000+ tokens of instructions eats into the 150k context window.
**Why it happens:** Skill content is injected directly into system prompt.
**How to avoid:** Set a max size for skill instructions (e.g., 2000 tokens). Warn in SkillCreator if exceeded. Consider summarizing long skills.
**Warning signs:** Context window summary triggers earlier than expected.

## Code Examples

### SKILL.md Format (from spec + OpenClaw alignment)
```markdown
---
name: code-analyzer
description: Analyzes code for bugs, patterns, and improvements
version: 1.0
author: BollaNetwork
tools:
  - analyze_code
languages:
  - typescript
---

# Code Analyzer

You are a code analysis expert. When activated...
(instructions for the LLM)
```

### Cross-Language Tool (Python example)
```python
#!/usr/bin/env python3
# .agents/skills/prd-manager/tools/validate_prd.py
import sys
import json

def main():
    args = json.loads(sys.stdin.read())
    filepath = args.get("filepath", "")

    # ... validation logic ...

    result = {
        "success": True,
        "output": f"PRD at {filepath} is valid. 12 sections found."
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
```

### Tool Definition in SKILL.md Frontmatter
```yaml
---
name: prd-manager
description: Creates professional project documents (PRD)
version: 1.0
author: BollaNetwork
tools:
  - name: generate_prd
    description: Generate a PRD document from requirements
    language: typescript
    parameters:
      type: object
      properties:
        title:
          type: string
          description: PRD title
        requirements:
          type: string
          description: Raw requirements text
      required: [title, requirements]
  - name: validate_prd
    description: Validate a PRD document structure
    language: python
    parameters:
      type: object
      properties:
        filepath:
          type: string
          description: Path to PRD file
      required: [filepath]
languages:
  - typescript
  - python
---
```

**Note:** The current SKILL.md frontmatter format uses simple tool name strings. For cross-language support, tools need parameter schemas. Two options: (a) Extend frontmatter with full tool definitions (shown above), or (b) Use a separate `tool.json` manifest per tool. Recommendation: Extend frontmatter -- keeps everything in one file, aligns with OpenClaw pattern.

### SkillToolBridge Skeleton
```typescript
import { spawn } from 'child_process';
import { BaseTool } from '../tools/BaseTool';
import { ToolResult } from '../types';
import { SkillContext } from './SkillExecutor';
import * as fs from 'fs';
import * as path from 'path';

interface ToolManifest {
  name: string;
  description: string;
  language: string;
  parameters: Record<string, unknown>;
}

export class SkillToolBridge {
  private pythonCmd: string;

  constructor() {
    this.pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  }

  async loadSkillTools(context: SkillContext): Promise<BaseTool[]> {
    if (!context.toolsDir) return [];

    const tools: BaseTool[] = [];
    const toolFiles = fs.readdirSync(context.toolsDir);

    for (const file of toolFiles) {
      const ext = path.extname(file);
      const toolPath = path.join(context.toolsDir, file);
      const toolMeta = this.findToolMeta(context, path.basename(file, ext));

      if (!toolMeta) continue;

      const command = this.getCommand(ext);
      if (!command) continue;

      tools.push(new ExternalTool(
        `${context.metadata.name}.${toolMeta.name}`,
        toolMeta.description,
        toolMeta.parameters,
        command,
        toolPath
      ));
    }

    return tools;
  }

  private getCommand(ext: string): string | null {
    switch (ext) {
      case '.ts': return 'tsx';
      case '.py': return this.pythonCmd;
      case '.sh': return 'bash';
      case '.js': return 'node';
      default: return null;
    }
  }

  private findToolMeta(context: SkillContext, toolName: string): ToolManifest | null {
    // Look up tool definition from SKILL.md frontmatter
    // ... implementation
    return null;
  }
}
```

## Recommended Starter Skills for TurionZ

Based on VoltAgent awesome-agent-skills and OpenClaw ecosystem research, these are the most useful base skills for a personal AI agent:

| Skill | Description | Priority | Tools |
|-------|-------------|----------|-------|
| code-analyzer | Analyze code for bugs, patterns, security issues | HIGH | analyze_code.ts |
| git-manager | Git operations (commit, push, log, diff, branch) | HIGH | git_commit.ts, git_push.ts, git_log.ts |
| file-manager | Create, read, edit, delete files and directories | HIGH | Built-in tools (already exist) |
| web-scraper | Fetch and extract content from web pages | MEDIUM | scrape_url.ts |
| doc-generator | Generate documents (PRDs, reports, changelogs) | MEDIUM | generate_doc.ts |
| translator | Translate text between languages | LOW | Can use LLM directly, no special tools |
| skill-creator | Creates new skills automatically (fixed sub-agent) | HIGH | Already has SKILL.md skeleton |

**Note:** file-manager and web-search capabilities already exist as built-in tools in ToolRegistry. Skills for these would just be instruction overlays (SKILL.md only, no tools/).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded plugins in source code | Directory-based skills with YAML metadata | OpenClaw popularized in 2025-2026 | Hot-reload, community sharing |
| nodemon/ts-node-dev for file watching | chokidar v5 (ESM) or Node.js native --watch | 2025 | More reliable, cross-platform |
| REST API for inter-process tools | JSON over stdin/stdout for child processes | Standard practice | Simpler, no server needed, lower overhead |
| Monolithic prompt with all capabilities | On-demand skill injection (load only active skill) | 2025-2026 | Saves context window, better LLM attention |

## Open Questions

1. **Tool parameter schema location**
   - What we know: Current SKILL.md frontmatter only has tool names as strings (`tools: ["generate_prd"]`). Cross-language tools need parameter schemas for the LLM to know how to call them.
   - What's unclear: Should schemas go in SKILL.md frontmatter (verbose but single-file) or in a separate `tools/manifest.json`?
   - Recommendation: Extend SKILL.md frontmatter with full tool definitions. Single source of truth, OpenClaw-aligned.

2. **Router model selection**
   - What we know: SkillRouter makes an LLM call per message. Spec says "lightweight/cheap call."
   - What's unclear: Which model to use? OpenRouter with GPT-4o-mini? Or local fast model?
   - Recommendation: Use OpenRouter with a cheap model (GPT-4o-mini or similar). The routing prompt is tiny (<500 tokens).

3. **Chokidar v5 ESM compatibility**
   - What we know: chokidar v5 is ESM-only. Project likely uses CommonJS.
   - What's unclear: Haven't checked tsconfig.json module setting.
   - Recommendation: Try v5 first. If ESM issues, fall back to chokidar v4.

4. **SkillCreator scope in Phase 12 vs Phase 17**
   - What we know: ROADMAP puts SkillCreator (REQ-038) in Phase 17. But REQ-038 is listed in Phase 12 requirements.
   - What's unclear: How much SkillCreator work belongs in Phase 12?
   - Recommendation: Phase 12 builds the infrastructure (Loader/Router/Executor/ToolBridge). Phase 17 builds the SkillCreator sub-agent logic. Phase 12 just ensures the skill-creator SKILL.md is loadable and its tools directory is supported.

5. **Skill dependencies (npm/pip packages)**
   - What we know: Spec Open Question says "recomendacao: sim, com sandbox"
   - What's unclear: No design for dependency management yet.
   - Recommendation: Defer to Phase 17 (SkillCreator). For Phase 12, assume tools have their dependencies pre-installed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Core runtime | Yes | v24.14.0 | -- |
| TypeScript | Build | Yes | 6.0.2 | -- |
| tsx | TS tool execution | Yes | 4.21.0 | ts-node |
| Python | Python skill tools | Yes | 3.12.10 | Skip Python tools |
| js-yaml | YAML parsing | Yes | 4.1.1 (installed) | -- |
| chokidar | Hot-reload watching | No (not installed) | -- | npm install chokidar |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:**
- chokidar: Must be installed (`npm install chokidar`). Fallback: periodic polling with `fs.readdirSync` (degrades hot-reload to polled-reload).

## Sources

### Primary (HIGH confidence)
- OpenClaw official docs (https://docs.openclaw.ai/tools/skills) - Skill format, YAML frontmatter, hot-reload mechanism, directory layout
- Node.js child_process docs (https://nodejs.org/api/child_process.html) - spawn API for cross-language execution
- Project source code: `src/skills/SkillLoader.ts`, `src/skills/SkillRouter.ts`, `src/skills/SkillExecutor.ts` - Existing skeleton implementations
- Project spec: `specs/skill-user.md` - Full skill system specification

### Secondary (MEDIUM confidence)
- VoltAgent awesome-agent-skills (https://github.com/VoltAgent/awesome-agent-skills) - Curated skill catalog, skill categories for personal AI agents
- chokidar GitHub (https://github.com/paulmillr/chokidar) - v5 ESM-only, Node.js v20+ requirement
- OpenClaw architecture articles verified across multiple sources (ProgressiveRobot, DigitalOcean, O'Reilly)

### Tertiary (LOW confidence)
- Starter skill recommendations based on general AI agent patterns (not verified against a specific benchmark)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - chokidar is proven, js-yaml already installed, child_process is Node.js core
- Architecture: HIGH - Pipeline pattern matches spec exactly, OpenClaw validates the approach, skeleton code already exists
- Pitfalls: HIGH - Cross-platform issues (Python command, chokidar ESM) verified against official docs
- Cross-language execution: MEDIUM - JSON stdin/stdout protocol is standard but not formally specified for this project

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable domain, no fast-moving dependencies)
