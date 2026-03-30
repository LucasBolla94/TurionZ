# TurionZ — Troubleshooting Guide (Self-Fix Reference)

> This file is read by Thor when something goes wrong.
> Thor: use `read_file` to access this, then follow the fix steps.

---

## Tool Errors

### "Tool not found" or "Unknown tool"
**Cause:** Tool not registered in index.ts
**Fix:**
1. `read_file` src/index.ts — check if the tool import and registration exists
2. If missing, `edit_file` to add it
3. `execute_command` npm run build
4. Notify user: "Corrigi o registro da tool. Reinicie com `turionz restart`."

### Tool returns empty/null
**Cause:** Tool executed but returned nothing
**Fix:**
1. Check tool arguments — are they correct?
2. Try again with different arguments
3. If persists, check if the tool file exists: `read_file` on the tool file
4. Report to user with the exact error

### "JSON inválido" (Invalid JSON)
**Cause:** LLM sent malformed tool arguments
**Fix:** This is auto-handled by AgentLoop (doesn't count as iteration). Retry automatically.

---

## Database Errors

### "Database not connected" / "relation does not exist"
**Cause:** PostgreSQL not running or table not created
**Auto-fix steps:**
1. `execute_command` sudo systemctl status postgresql
2. If not running: `execute_command` sudo systemctl start postgresql
3. If table missing: tables are created on-demand by SchemaManager — restart should fix
4. `execute_command` cd ~/TurionZ && turionz restart

### "type vector does not exist"
**Cause:** pgvector extension not installed
**Fix:**
1. `execute_command` sudo apt install -y postgresql-16-pgvector
2. `execute_command` sudo systemctl restart postgresql
3. `execute_command` sudo -u postgres psql -d turionz -c "CREATE EXTENSION IF NOT EXISTS vector;"
4. `execute_command` cd ~/TurionZ && turionz restart

### "connection refused" on port 5432
**Cause:** PostgreSQL not running
**Fix:**
1. `execute_command` sudo systemctl start postgresql
2. `execute_command` sudo systemctl enable postgresql
3. Verify: `execute_command` sudo -u postgres psql -c "SELECT 1;"

---

## API/Provider Errors

### "OpenRouter API key not found"
**Cause:** .env missing or OPENROUTER_API_KEY empty
**Fix:**
1. `read_file` .env — check if OPENROUTER_API_KEY is set
2. If empty: notify user "Chefe, preciso da API key do OpenRouter. Roda `turionz setup` pra configurar."
3. Never try to guess or generate an API key

### "OpenRouter API error 401"
**Cause:** Invalid API key
**Fix:** Notify user: "Chefe, a chave do OpenRouter tá inválida. Verifica no painel: openrouter.ai/keys"

### "OpenRouter API error 429"
**Cause:** Rate limit exceeded
**Fix:** Automatic retry with backoff (built into OpenRouterProvider). If persists after 3 retries, notify user.

### "OpenRouter API error 402"
**Cause:** Insufficient credits
**Fix:** Notify user: "Chefe, acabou o crédito no OpenRouter. Precisa recarregar."

---

## Gateway Errors

### "Telegram bot token invalid"
**Cause:** Token wrong or bot deleted
**Fix:**
1. `read_file` .env — check TELEGRAM_BOT_TOKEN
2. Notify user: "Token do Telegram tá inválido. Cria um novo no @BotFather e roda `turionz setup`."

### "Telegram error 409: Conflict"
**Cause:** Another instance of the bot is running (duplicate process)
**Fix:**
1. `execute_command` turionz stop
2. `execute_command` pkill -f "node dist/index.js" (force kill all instances)
3. `execute_command` turionz start

---

## Build/Compilation Errors

### "Cannot find module"
**Cause:** Dependencies not installed or build outdated
**Fix:**
1. `execute_command` cd ~/TurionZ && npm install
2. `execute_command` npm run build
3. `execute_command` turionz restart

### TypeScript compilation errors
**Cause:** Code has type errors
**Fix:**
1. `execute_command` cd ~/TurionZ && npx tsc --noEmit 2>&1 | head -20
2. Read the error, identify the file and line
3. `read_file` the problematic file
4. `edit_file` to fix the error
5. `execute_command` npm run build

---

## Performance Issues

### Thor responding slowly (>30s)
**Possible causes:**
1. Model overloaded — try switching to a faster model
2. Too many tools registered — not a real issue (16 tools is fine)
3. Large context window — check if conversation is too long
**Fix:** Check `execute_command` turionz logs | tail -20 for timing info

### Memory/Context window full
**Cause:** Conversation exceeded 150k tokens
**Fix:** Auto-summary should trigger at 70%. If not working:
1. Check if MemoryManager is initialized
2. Check DB connection for saving summaries

---

## Update & Maintenance

### How to update TurionZ
```
turionz update
```
This runs: git pull → npm install → npm run build → restart

### How to check health
```
turionz status
turionz logs
```

### How to reset everything
```
turionz stop
cd ~/TurionZ
rm .env
npm run setup
turionz start
```

---

## Self-Fix Decision Tree

When an error occurs, Thor should follow this logic:

```
1. Read the error message carefully
2. Search this file for a matching error pattern
3. If found → follow the fix steps
4. If fix involves restart → warn user first: "Preciso reiniciar pra aplicar a correção. Pode ser?"
5. If fix involves user action → explain clearly what they need to do
6. If not found → log the error, notify user, and suggest checking turionz logs
7. NEVER silently ignore errors
8. NEVER retry the same action more than 3 times
```
