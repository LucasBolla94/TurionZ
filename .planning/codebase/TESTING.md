# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Runner:** None installed.

There is no test framework, test runner, or test configuration in the project. No test files exist in `src/` or any other project directory.

**Dependencies check:**
- `package.json` contains no test-related dependencies (no jest, vitest, mocha, chai, sinon, supertest, etc.)
- No `test` script in `package.json` scripts
- No test configuration files (no `jest.config.*`, `vitest.config.*`, `.mocharc.*`)

**Run Commands:**
```bash
# No test commands available
# package.json scripts only include:
npm run dev     # tsx watch src/index.ts
npm run build   # tsc
npm run start   # node dist/index.js
```

## Current Test Coverage

**Coverage:** 0%. No tests exist.

## Test Infrastructure Needed

When adding tests to this project, the following setup is recommended based on the codebase conventions:

### Recommended Framework

**Vitest** is the recommended choice because:
- The project uses TypeScript with `tsx` for development, and Vitest has native TypeScript support
- No Babel or complex transform chain needed
- Fast execution with ESM-compatible runner
- Jest-compatible API (familiar assertion style)

### Installation

```bash
npm install -D vitest @vitest/coverage-v8
```

### Recommended Configuration

Create `vitest.config.ts` at project root:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/index.ts'],
    },
  },
});
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Test File Organization

**Recommended location:** Co-located with source files.

**Naming convention:** `[ClassName].test.ts`

```
src/
├── core/
│   ├── AgentLoop.ts
│   ├── AgentLoop.test.ts
│   ├── AgentController.ts
│   └── AgentController.test.ts
├── tools/
│   ├── BaseTool.ts
│   ├── BaseTool.test.ts
│   ├── ToolRegistry.ts
│   ├── ToolRegistry.test.ts
│   └── builtin/
│       ├── MemorySearchTool.ts
│       └── MemorySearchTool.test.ts
├── providers/
│   ├── OpenRouterProvider.ts
│   ├── OpenRouterProvider.test.ts
│   ├── AnthropicProvider.ts
│   └── AnthropicProvider.test.ts
```

## Testability Analysis

### Easy to Test (Pure Logic, Few Dependencies)

**`src/tools/BaseTool.ts`** — Abstract class with `success()` and `error()` helper methods. Test via a concrete subclass.

```typescript
// Example test pattern
class TestTool extends BaseTool {
  readonly name = 'test_tool';
  readonly description = 'test';
  readonly parameters = { type: 'object', properties: {} };
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return this.success('ok');
  }
}

describe('BaseTool', () => {
  it('should generate tool definition', () => {
    const tool = new TestTool();
    const def = tool.toDefinition();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('test_tool');
  });

  it('should format success result', async () => {
    const tool = new TestTool();
    const result = await tool.execute({});
    expect(result.success).toBe(true);
    expect(result.output).toBe('ok');
  });
});
```

**`src/tools/ToolRegistry.ts`** — Singleton but stateless logic. Reset instance between tests.

```typescript
describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = ToolRegistry.getInstance();
    registry.clear();
  });

  it('should register and retrieve tools', () => {
    const tool = new TestTool();
    registry.register(tool);
    expect(registry.has('test_tool')).toBe(true);
    expect(registry.count()).toBe(1);
  });
});
```

**`src/memory/TokenCounter.ts`** — Pure function, no dependencies.

**`src/security/OwnerValidator.ts`** — Reads from `process.env`, easy to test with env mocking.

**`src/infra/IntegrityChecker.ts`** — Accepts `projectRoot` parameter, testable with temp directories.

**`src/core/PersonalityEngine.ts`** — Accepts `agentsDir` parameter, testable with temp files.

**`src/skills/SkillLoader.ts`** — Accepts `skillsDir` parameter, testable with temp directories.

### Medium Difficulty (Need Mocking)

**`src/core/AgentLoop.ts`** — Requires mocking `ILlmProvider` and `ToolFactory`. The `ILlmProvider` interface makes this straightforward:

```typescript
// Mock provider pattern
const mockProvider: ILlmProvider = {
  chat: vi.fn().mockResolvedValue({
    content: 'Hello!',
    toolCalls: [],
    tokensIn: 10,
    tokensOut: 20,
  }),
  getModelName: () => 'test-model',
};

describe('AgentLoop', () => {
  it('should return response when no tools called', async () => {
    const loop = new AgentLoop(mockProvider);
    const result = await loop.run({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'You are helpful.',
      tools: [],
      flags: { requires_audio_reply: false, source_type: 'text' },
      config: { maxIterations: 5, llmTimeout: 5000, retryAttempts: 1, maxToolsPerRound: 5 },
    });
    expect(result.status).toBe('completed');
    expect(result.response).toBe('Hello!');
  });
});
```

**`src/providers/AnthropicProvider.ts` and `src/providers/OpenRouterProvider.ts`** — Need `fetch` mocking. Both share the same retry/timeout pattern.

```typescript
// Mock fetch pattern
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AnthropicProvider', () => {
  it('should parse Anthropic response format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    });
    // ...
  });
});
```

**`src/tools/ToolFactory.ts`** — Depends on ToolRegistry singleton. Pre-populate registry before tests.

**`src/security/AuthenticationGateway.ts`** — Composes OwnerValidator, AllowlistManager, PairingFlowManager. Test the authentication flow logic.

### Hard to Test (Deep Dependencies, Database Required)

**`src/core/AgentController.ts`** — Singleton facade that wires together MemoryManager, ToolRegistry, MessageRouter, ProviderFactory. Needs comprehensive mocking or integration test setup.

**`src/memory/MemoryManager.ts`** — Depends on Database, ConversationRepository, MessageRepository, EmbeddingEngine. Requires database mocking.

**`src/agents/SubAgentManager.ts`** — Depends on Database, AgentLoop, ProviderFactory. Complex stateful operations.

**`src/infra/SelfImprovement.ts`** — Database queries, LLM calls, filesystem writes. Full integration test candidate.

**All Repository classes** (`ConversationRepository`, `MessageRepository`) — Direct SQL queries, require a test database.

## Singleton Testing Strategy

The extensive use of singletons requires a reset strategy for test isolation. Two approaches:

**Approach 1 — Expose reset method (preferred for test-only):**

```typescript
// Add to singleton classes for testing
static resetInstance(): void {
  (ExampleManager as any).instance = undefined;
}
```

**Approach 2 — Module-level reset in test setup:**

```typescript
beforeEach(() => {
  // Access private static and reset
  (Database as any).instance = undefined;
  (ToolRegistry as any).instance = undefined;
});
```

## Mocking Priorities

**What to mock:**
- `Database` — Most classes depend on it via singleton. Create a mock that implements `isConnected()`, `query()`, `queryOne()`, `execute()`
- `ILlmProvider` — Clean interface, easy to mock for AgentLoop tests
- `fetch` — For provider tests (Anthropic, OpenRouter)
- `fs` — For VaultManager, SkillLoader, PersonalityEngine, RecoveryManager tests
- `process.env` — For OwnerValidator, Database, ProviderFactory tests

**What NOT to mock:**
- `BaseTool` — Test the real abstract class via concrete subclass
- `ToolRegistry` — Use the real registry, just `clear()` it between tests
- Type definitions from `src/types/index.ts` — Use real types
- `TokenCounter` — Pure logic, no side effects

## Test Priority Recommendations

**High priority (core logic, most likely to break):**
1. `src/core/AgentLoop.ts` — ReAct loop logic, tool execution flow, abort handling, iteration limits
2. `src/providers/AnthropicProvider.ts` — Response parsing, retry logic, timeout handling
3. `src/providers/OpenRouterProvider.ts` — Same as Anthropic, different response format
4. `src/tools/ToolFactory.ts` — Tool execution, timeout, error handling
5. `src/security/AuthenticationGateway.ts` — Auth flow (allowlist, pairing, open, disabled modes)

**Medium priority (important but simpler logic):**
6. `src/tools/ToolRegistry.ts` — Registration, lookup
7. `src/tools/BaseTool.ts` — Definition generation, result helpers
8. `src/tools/builtin/MemorySearchTool.ts` — Argument validation, result formatting
9. `src/security/OwnerValidator.ts` — Platform-specific owner checks
10. `src/core/PersonalityEngine.ts` — File loading, prompt assembly, truncation
11. `src/skills/SkillLoader.ts` — YAML frontmatter parsing, directory scanning
12. `src/infra/IntegrityChecker.ts` — Filesystem checks

**Lower priority (infrastructure, less likely to have bugs):**
13. `src/infra/database.ts` — Connection, retry, query wrapper
14. `src/memory/MemoryManager.ts` — Integration with repositories
15. `src/gateway/MessageRouter.ts` — Simple routing
16. `src/infra/Logger.ts` — Logging, redaction patterns
17. `src/infra/RecoveryManager.ts` — Boot sequence, safe mode detection

## Integration Test Candidates

These operations span multiple modules and are best tested as integration tests with a real (test) database:

1. **Message processing pipeline:** TelegramInputAdapter -> MessageRouter -> AgentController -> AgentLoop -> response
2. **Conversation memory flow:** Save message -> Generate embedding -> Context window retrieval
3. **Sub-agent lifecycle:** Create -> Run -> Verify -> Complete
4. **Authentication flow:** Authenticate -> Pairing request -> Approve -> Allowlist check
5. **Self-improvement cycle:** Collect week data -> Analyze -> Save lessons -> Update MEMORY.md

## Database Test Setup

For integration tests requiring PostgreSQL:

```typescript
// test/helpers/testDb.ts
import { Database } from '../../src/infra/database';

export async function setupTestDb(): Promise<void> {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/turionz_test';
  const db = Database.getInstance();
  await db.connect();
}

export async function teardownTestDb(): Promise<void> {
  const db = Database.getInstance();
  // Clean all tables
  await db.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await db.disconnect();
}
```

---

*Testing analysis: 2026-03-24*
