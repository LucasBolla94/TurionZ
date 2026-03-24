# Codebase Concerns

**Analysis Date:** 2026-03-24

## Tech Debt

**EmbeddingEngine is entirely a stub:**
- Issue: The entire `EmbeddingEngine` class is a placeholder. `available` is hardcoded to `false`, `generateEmbedding()` always returns `null`. Semantic memory search (`MemoryManager.memorySearch()`) and the `MemorySearchTool` are effectively dead code.
- Files: `src/memory/EmbeddingEngine.ts`, `src/memory/MemoryManager.ts` (lines 112-127), `src/tools/builtin/MemorySearchTool.ts`
- Impact: Memory search tool is registered but will never return results. Users may invoke it and get empty results with no explanation. The entire "semantic memory" capability advertised by specs does not function.
- Fix approach: Implement nomic-embed integration or switch to an API-based embedding provider (e.g., OpenAI embeddings via the existing fetch pattern). Guard the `MemorySearchTool` registration behind `EmbeddingEngine.isAvailable()`.

**Conversation summary is not implemented:**
- Issue: `MemoryManager.triggerSummary()` at line 131 returns `null` with a log message "(Not yet implemented)". The `checkSummaryThreshold()` method detects when context is 70%+ full but the follow-up action does nothing.
- Files: `src/memory/MemoryManager.ts` (lines 131-136, 162-184)
- Impact: Long conversations will fill the context window and eventually degrade response quality or cause LLM errors. There is no compaction mechanism.
- Fix approach: Implement summary generation using the LLM provider (call `ProviderFactory.create()` with a cheap model, send conversation history, get a summary, store in `conversation_summaries` table).

**Skill injection into AgentLoop is not wired:**
- Issue: `AgentController.buildSystemPrompt()` has a `TODO` at line 154 and `skillContent` is hardcoded to empty string `''`. The `SkillLoader`, `SkillRouter`, and `SkillExecutor` classes exist and are functional, but they are never called from the main processing pipeline.
- Files: `src/core/AgentController.ts` (lines 151-163), `src/skills/SkillRouter.ts`, `src/skills/SkillExecutor.ts`, `src/skills/SkillLoader.ts`
- Impact: Skills system is fully built but disconnected. Loading skills from `.agents/skills/` has no effect on agent behavior.
- Fix approach: In `AgentController.processMessage()`, call `SkillRouter.route()` to detect the active skill, then `SkillExecutor.loadSkillContext()` and `buildSkillPrompt()` to inject it into the system prompt.

**SelfImprovement auto-marks lessons as beneficial:**
- Issue: `verifyPreviousChanges()` at line 263 blindly marks all previous lessons as `was_beneficial = TRUE` without actual verification. The comment says "Real verification will compare metrics" but no metrics comparison exists.
- Files: `src/infra/SelfImprovement.ts` (lines 251-272)
- Impact: The self-improvement feedback loop has no actual feedback. Bad lessons are never detected or reverted.
- Fix approach: Implement actual metric comparison (e.g., compare error rates, user satisfaction signals before/after lesson application).

**WhatsApp adapter is a complete placeholder:**
- Issue: The entire `WhatsAppAdapter` class is non-functional. `start()` sets `connected = false`, no actual WhatsApp connection is made. Yet `index.ts` always instantiates and starts it (line 107-108), logging misleading output.
- Files: `src/gateway/adapters/whatsapp/WhatsAppAdapter.ts`, `src/index.ts` (lines 107-108)
- Impact: The WhatsApp adapter always starts and logs to console even though it does nothing. This is noise in logs and misleading.
- Fix approach: Either gate instantiation behind a config flag (`WHATSAPP_ENABLED=true`) or remove the `await whatsapp.start()` call until the adapter is implemented.

**Voice/Audio handlers are stubs in Telegram:**
- Issue: `bot.on('message:voice')` and `bot.on('message:audio')` just reply with a hardcoded "not configured" message in Portuguese.
- Files: `src/gateway/adapters/telegram/TelegramInputAdapter.ts` (lines 71-79)
- Impact: Minor -- users get a clear message. But this is a capability gap versus specs.
- Fix approach: Integrate Whisper API for transcription when ready.

## Known Bugs

**Message IDs use `Date.now()` leading to potential collisions:**
- Symptoms: Messages from the API adapter use `api-${Date.now()}` as both `id` and `conversationId`. If two API requests arrive in the same millisecond, they share IDs.
- Files: `src/gateway/adapters/api/APIRestAdapter.ts` (lines 89, 92), `src/gateway/adapters/whatsapp/WhatsAppAdapter.ts` (line 64)
- Trigger: Concurrent API requests within the same millisecond.
- Workaround: Use `crypto.randomUUID()` for IDs instead of timestamp-based IDs.

**Telegram abort uses `require()` at runtime:**
- Symptoms: The abort callback in `TelegramInputAdapter` uses `require('../../core/AgentController')` at runtime (line 136) instead of importing at the top of the file. This is fragile and may break with bundlers or ESM.
- Files: `src/gateway/adapters/telegram/TelegramInputAdapter.ts` (lines 134-138)
- Trigger: When a user sends an abort command while a loop is active.
- Workaround: Import `AgentController` at the top of the file. The circular dependency concern can be resolved by using the `MessageRouter` pattern instead.

**RecoveryManager records ALL startups as "crashes":**
- Symptoms: `recordStartup()` appends a timestamp to `crash_count.json` on every boot, not just crashes. If the process restarts 3 times in 10 minutes (e.g., during development with `tsx watch`), safe mode activates incorrectly.
- Files: `src/infra/RecoveryManager.ts` (lines 146-168, 126-143)
- Trigger: Rapid restarts during development (hot-reload, manual restarts).
- Workaround: Distinguish between clean shutdowns and crashes. Record startup timestamps but also record clean shutdown. Only count entries without a matching shutdown as crashes.

**Discord adapter receives token twice:**
- Symptoms: `DiscordAdapter` constructor does not take a token, but `index.ts` calls `discord.start(discordToken)` passing the token. The adapter class needs to be checked for how it uses the token.
- Files: `src/index.ts` (lines 100-101)
- Trigger: On every Discord startup.
- Workaround: Verify `DiscordAdapter.start()` signature matches usage.

## Security Considerations

**API REST adapter has no auth when API key is unset:**
- Risk: When `API_ACCESS_KEY` is not configured (no env var, no vault entry), the middleware at line 51 calls `next()` allowing all requests. This means the entire agent is accessible without authentication over HTTP.
- Files: `src/gateway/adapters/api/APIRestAdapter.ts` (lines 50-55)
- Current mitigation: None. The comment says "dev mode" but there is no explicit dev/prod distinction.
- Recommendations: Either require the API key in production (fail to start if missing) or bind to localhost only when no key is configured. Log a prominent warning.

**Vault master key stored as plaintext hex on filesystem:**
- Risk: The master encryption key for the vault is stored as a hex string in `data/vault/vault.key` with file mode `0o600`. On Windows, POSIX file modes are not enforced, so the key may be world-readable.
- Files: `src/security/KeyManager.ts` (line 29), `src/security/VaultManager.ts`
- Current mitigation: File mode `0o600` (only effective on Unix). `.gitignore` excludes `data/vault/`.
- Recommendations: On Windows, use DPAPI or Windows Credential Manager. Consider deriving the key from a password using PBKDF2 instead of storing raw key material. At minimum, log a warning on Windows about key file permissions.

**Vault store file is NOT encrypted at rest:**
- Risk: `vault.enc` (the vault store) is a JSON file where individual values are encrypted, but the file itself is plain JSON with the structure visible. Key names are in cleartext. The filename `.enc` is misleading.
- Files: `src/security/VaultManager.ts` (lines 150-157, 159-161)
- Current mitigation: Individual values are AES-256-GCM encrypted. Key names (e.g., "anthropic_api_key") are visible.
- Recommendations: Encrypt the entire store file or rename to `vault.json` to avoid implying full-file encryption. Key names leaking is low-risk but worth noting.

**No rate limiting on API REST endpoint:**
- Risk: The `/api/message` endpoint has no rate limiting. Each request triggers an LLM call (expensive). An attacker could drain API credits rapidly.
- Files: `src/gateway/adapters/api/APIRestAdapter.ts`
- Current mitigation: API key authentication (when configured).
- Recommendations: Add rate limiting middleware (e.g., `express-rate-limit`). Limit by IP or API key.

**No input sanitization on user messages:**
- Risk: User input flows directly from platform adapters into `InternalMessage.content` and then into the LLM system prompt. No sanitization or length limits on the content field (beyond Express's 10MB body limit).
- Files: `src/gateway/adapters/telegram/TelegramInputAdapter.ts`, `src/gateway/adapters/api/APIRestAdapter.ts`, `src/core/AgentController.ts`
- Current mitigation: Express body limit of 10MB. Telegram has its own message size limits.
- Recommendations: Add maximum content length validation. Consider prompt injection defenses for the system prompt boundary.

**PermissionChecker treats unknown categories as "granted":**
- Risk: At line 58-59 in `PermissionChecker.ts`, any action whose category is not in `PERMISSION_CATEGORIES` is automatically granted. A new dangerous action could bypass permissions if its category name is not registered.
- Files: `src/security/PermissionChecker.ts` (lines 57-59)
- Current mitigation: The `PERMISSION_CATEGORIES` set covers the known dangerous categories.
- Recommendations: Invert the logic: deny-by-default for unknown categories, or at least return `ask_user` instead of `granted`.

**Free actions include potentially dangerous operations:**
- Risk: `FREE_ACTIONS` includes `create_file`, `write_file`, and `execute_sandbox`. Depending on how tools implement these, file write operations could be used to overwrite critical files.
- Files: `src/security/PermissionChecker.ts` (lines 13-22)
- Current mitigation: Only `MemorySearchTool` is currently registered as a tool.
- Recommendations: Review this list before adding file-system tools. `write_file` and `execute_sandbox` should require permission or have path restrictions.

## Performance Bottlenecks

**SubAgent dependency waiting uses polling loop:**
- Problem: `waitForDependencies()` polls the database every 2 seconds in a while loop for up to 5 minutes. This blocks the Node.js event loop thread with repeated DB queries.
- Files: `src/agents/SubAgentManager.ts` (lines 370-398)
- Cause: No event-driven notification system between agents. Pure polling.
- Improvement path: Use PostgreSQL `LISTEN/NOTIFY` for agent status changes, or use an in-memory event emitter for agents in the same process.

**SelfImprovement scheduler uses setInterval with 1-hour granularity:**
- Problem: The weekly analysis scheduler checks every hour (`60 * 60 * 1000 ms`) whether it's Sunday at 3 AM. This is imprecise and wastes cycles.
- Files: `src/infra/SelfImprovement.ts` (lines 51-63)
- Cause: Simple implementation using setInterval instead of a proper scheduler.
- Improvement path: Use `node-cron` or calculate exact milliseconds until next Sunday 3 AM and use `setTimeout`.

**Context window loads all messages then truncates by token count:**
- Problem: `MessageRepository.findByConversationWithTokenLimit()` likely loads messages and counts tokens. With very long conversations, this could be expensive.
- Files: `src/memory/MemoryManager.ts` (lines 91-108), `src/memory/MessageRepository.ts`
- Cause: No summarization means conversations grow unboundedly.
- Improvement path: Implement conversation summarization (the existing stub). Add pagination or a DB-level token sum query.

## Fragile Areas

**Singleton pattern used everywhere without cleanup:**
- Files: `src/infra/database.ts`, `src/core/AgentController.ts`, `src/memory/MemoryManager.ts`, `src/security/AuthenticationGateway.ts`, `src/security/VaultManager.ts`, `src/agents/SubAgentManager.ts`, `src/infra/RecoveryManager.ts`, `src/infra/SelfImprovement.ts`, `src/infra/SchemaManager.ts`, `src/gateway/MessageRouter.ts`
- Why fragile: Almost every major class is a singleton with `private static instance`. This makes testing extremely difficult (no way to reset state between tests), creates hidden coupling, and prevents running multiple agent instances in the same process.
- Safe modification: When adding new modules, consider dependency injection instead. Accept dependencies in constructors rather than calling `getInstance()` internally.
- Test coverage: Zero tests exist. Singletons are the primary blocker for adding tests.

**Degraded mode (no database) silently drops features:**
- Files: Throughout the codebase -- every module checks `this.db.isConnected()` and silently returns empty results or skips operations.
- Why fragile: When the database is down, the system appears to work but: no messages are saved, no permissions are checked (defaults to `ask_user`), no sub-agents can run, no allowlist works. The user gets responses but loses all history and security. There is no clear signal to the user that the system is running in degraded mode.
- Safe modification: Add a prominent warning in the response when running without database. Consider failing more explicitly for security-critical paths.
- Test coverage: None.

**`process.cwd()` used as base path everywhere:**
- Files: `src/infra/RecoveryManager.ts` (lines 11-13), `src/infra/SelfImprovement.ts` (line 13), `src/skills/SkillLoader.ts` (line 17), `src/security/VaultManager.ts` (line 31)
- Why fragile: If the process is started from a different working directory (e.g., via a process manager, Docker, systemd), all file paths break. Personality files, skills, vault, recovery data, and temp files all depend on `process.cwd()`.
- Safe modification: Use `__dirname`-relative paths or a configurable base path from environment variable (e.g., `TURIONZ_HOME`).
- Test coverage: None.

## Scaling Limits

**Single-process architecture:**
- Current capacity: One Node.js process handles all platforms, all users, all sub-agents.
- Limit: LLM calls are async but each user's AgentLoop runs sequentially. With many concurrent users, response times will degrade. The `activeLoops` map in `AgentController` is in-memory only.
- Scaling path: For now, this is appropriate for a personal agent. If multi-user scaling is needed, extract the AgentLoop into a worker pool or separate service.

**PostgreSQL pool capped at 10 connections:**
- Current capacity: 10 concurrent database connections.
- Limit: Each sub-agent polls dependencies every 2 seconds. With multiple sub-agents, the connection pool could be exhausted.
- Scaling path: Increase pool size, optimize sub-agent polling, or use connection-less queries for lightweight operations.

## Dependencies at Risk

**No test framework installed:**
- Risk: There is no testing framework in `package.json` (no jest, vitest, mocha, or any test runner). Zero test files exist in the project.
- Impact: Every code change is untested. Regressions are invisible until they hit production.
- Migration plan: Add `vitest` (lightweight, TypeScript-native) to devDependencies. Start with unit tests for `CryptoHandler`, `TokenCounter`, `PermissionChecker`, and `ProviderFactory`.

**Express 5.x (early adoption):**
- Risk: `express@^5.2.1` is a major version that was in alpha/beta for years. Some middleware and patterns may differ from Express 4.x documentation. Community middleware may not be compatible.
- Impact: Limited ecosystem compatibility for Express 5 middleware.
- Migration plan: Monitor Express 5 stability. If issues arise, downgrade to Express 4.x.

## Missing Critical Features

**No graceful shutdown handler:**
- Problem: There is no `SIGTERM`/`SIGINT` handler. When the process is killed, database connections, Telegram bot polling, and Express server are not cleanly shut down.
- Blocks: Clean deployment with process managers (PM2, Docker, systemd). Database connections may leak.

**No health monitoring or alerting:**
- Problem: Beyond `console.log`, there is no monitoring. If the LLM provider fails, the database goes down, or the bot disconnects, nobody is notified.
- Blocks: Reliable operation as a long-running service.

**No conversation isolation between platforms:**
- Problem: `MemoryManager.findOrCreateConversation()` uses `userId + platform` to find conversations. But the same user across Telegram and Discord gets separate conversations with no way to share context.
- Blocks: Cross-platform continuity (mentioned in specs/PRD).

## Test Coverage Gaps

**Zero test files exist in the entire project:**
- What's not tested: Everything. There are no unit tests, integration tests, or end-to-end tests.
- Files: All files in `src/` -- 46 TypeScript files with 5,733 lines of code.
- Risk: Any refactoring or feature addition could introduce regressions that go completely undetected. The singleton-heavy architecture makes adding tests retroactively harder.
- Priority: **High** -- Start with pure-logic modules that have no side effects:
  1. `src/security/CryptoHandler.ts` -- encrypt/decrypt roundtrip
  2. `src/memory/TokenCounter.ts` -- token estimation accuracy
  3. `src/security/PermissionChecker.ts` -- permission logic
  4. `src/providers/ProviderFactory.ts` -- provider selection logic
  5. `src/skills/SkillLoader.ts` -- YAML frontmatter parsing

---

*Concerns audit: 2026-03-24*
