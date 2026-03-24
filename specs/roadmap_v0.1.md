# TurionZ — Roadmap v0.1

**Created by:** BollaNetwork
**Data:** 2026-03-24
**Versão:** 0.1

---

## Visão Geral

Este roadmap define a ordem de implementação do TurionZ (Thor), o agente AI pessoal da Bolla Network. São **18 fases** organizadas por dependência — cada fase depende da anterior estar pronta.

**Regra fundamental:** Siga as fases na ordem. Leia a spec de referência antes de implementar. Cada fase tem critério de conclusão — só avance quando atingir.

---

## Stack Tecnológica

| Componente | Tecnologia |
|-----------|-----------|
| Linguagem | Node.js (TypeScript) — OOP com Classes e Interfaces |
| Banco de Dados | PostgreSQL + pgvector |
| Embedding | nomic-embed (local, CPU) |
| LLM Provider | OpenRouter (Claude, GPT, etc.) |
| Telegram | grammy |
| WhatsApp | whatsapp-web.js ou Baileys |
| Discord | discord.js |
| API REST | Express ou Fastify |
| STT | Whisper local (CPU, PT-BR) |
| TTS | Edge-TTS (pt-BR-ThalitaMultilingualNeural) |
| Criptografia | AES-256-GCM (crypto nativo Node.js) |
| Raciocínio | ReAct Pattern (Thought → Action → Observation) |

---

## Estrutura de Pastas

```
turionz/
├── src/
│   ├── core/                    # AgentLoop, AgentController, PersonalityEngine
│   ├── memory/                  # MemoryManager, EmbeddingEngine, Repositories
│   ├── gateway/                 # MessageRouter
│   │   └── adapters/            # Adaptadores por plataforma
│   │       ├── telegram/        # TelegramInputAdapter, TelegramOutputAdapter
│   │       ├── discord/         # DiscordAdapter
│   │       ├── whatsapp/        # WhatsAppAdapter
│   │       └── api/             # APIRestAdapter
│   ├── skills/                  # SkillLoader, SkillRouter, SkillExecutor
│   ├── agents/                  # SubAgentManager
│   ├── security/                # VaultManager, Authentication, Permissions
│   ├── infra/                   # Database, Logger, Recovery, SelfImprovement
│   ├── providers/               # ILlmProvider, OpenRouterProvider, ProviderFactory
│   ├── tools/                   # ToolRegistry, BaseTool, tools built-in
│   ├── types/                   # Interfaces e tipos compartilhados
│   └── index.ts                 # Entry point
├── .agents/                     # Personalidade + Skills
│   ├── SOUL.md                  # Personalidade do Thor
│   ├── IDENTITY.md              # Identidade externa
│   ├── MEMORY.md                # Lições aprendidas
│   └── skills/                  # Plugins de habilidades
│       └── skill-creator/       # Sub-agent fixo criador de skills
├── data/
│   ├── vault/                   # vault.enc, vault.key, vault.meta
│   └── embeddings/              # Cache de embeddings
├── tmp/                         # Arquivos temporários (limpar no startup)
├── specs/                       # Documentação (este arquivo)
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## Variáveis de Ambiente (.env)

```env
# OpenRouter
OPENROUTER_API_KEY=sk-...

# Telegram
TELEGRAM_BOT_TOKEN=...

# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/turionz

# Agent Config
MAX_ITERATIONS=5
CONTEXT_WINDOW_SIZE=150000

# Owner
OWNER_TELEGRAM_ID=123456789
OWNER_NAME=Lucas
```

---

## Dependências npm (instalar por fase)

| Fase | Pacotes |
|------|---------|
| 0 | typescript, ts-node, tsx, nodemon, @types/node |
| 1 | pg, @types/pg |
| 2 | (crypto nativo — sem dependência extra) |
| 3 | (fetch nativo do Node 18+) |
| 5 | tiktoken |
| 9 | grammy, pdf-parse |
| 12 | js-yaml, @types/js-yaml |
| 17 | discord.js, @whiskeysockets/baileys, express, @types/express |

---

## FASES DE IMPLEMENTAÇÃO

---

### FASE 0 — Setup do Projeto

**Objetivo:** Criar estrutura de pastas, configurar TypeScript, instalar dependências base.
**Spec de referência:** `specs/architecture.md` (seção 2.6 e 2.7)

**Tarefas:**
- [x] 0.1: `npm init` — criar `package.json` (name: "turionz", scripts: dev/build/start)
- [x] 0.2: Instalar TypeScript + ts-node + tsx + nodemon + @types/node
- [x] 0.3: Criar `tsconfig.json` (strict mode, target ES2022)
- [x] 0.4: Criar toda a estrutura de pastas conforme diagrama acima
- [x] 0.5: Criar `.gitignore` (node_modules, data/, tmp/, .env, vault.key, vault.enc)
- [x] 0.6: Criar `.env.example` com todas as variáveis
- [x] 0.7: Criar `src/types/index.ts` com interfaces base:
  - `InternalMessage` (id, userId, platform, conversationId, type, content, attachments, flags, timestamp)
  - `AgentLoopInput` (messages, systemPrompt, tools, flags, config)
  - `AgentLoopOutput` (response, flags, metrics, status)
  - `ToolDefinition` (name, description, parameters)
  - `SkillMetadata` (name, description, version, author, tools, languages)
- [x] 0.8: Criar `src/index.ts` com hello world básico

**Critério de conclusão:** `npm run dev` inicia sem erro. TypeScript compila. Estrutura de pastas criada.

---

### FASE 1 — Banco de Dados (PostgreSQL)

**Objetivo:** Conectar ao PostgreSQL, criar tabelas automaticamente, repository pattern.
**Spec de referência:** `specs/memory.md` (seção 9), `specs/PRD.md` (seção 9), `specs/sub-agents.md` (seção 9), `specs/authentication.md` (seção 5)

**Tarefas:**
- [x] 1.1: Instalar `pg` e `@types/pg`
- [x] 1.2: Criar `src/infra/database.ts` — Singleton de conexão PostgreSQL (Pool)
  - Lê DATABASE_URL do .env
  - Retry de conexão no startup (3 tentativas)
- [x] 1.3: Criar `src/infra/migrations.ts` — cria TODAS as tabelas se não existirem:
  - `CREATE EXTENSION IF NOT EXISTS vector`
  - `conversations` (id UUID, user_id, platform, provider, context_window_size, current_token_count, created_at, updated_at)
  - `messages` (id UUID, conversation_id, role, content, token_count, embedding vector(768), is_summary, created_at)
  - `conversation_summaries` (id UUID, conversation_id, summary, token_count, messages_summarized, embedding, created_at)
  - `openrouter_models` (id, name, provider, context_length, pricing_input, pricing_output, capabilities JSONB, recommendations, synced_at)
  - `permissions` (id UUID, action, category, is_wildcard, granted, granted_by, granted_at, revoked_at)
  - `activity_logs` (id UUID, agent_type, agent_name, action, details JSONB, duration_ms, tokens_used, created_at)
  - `lessons_learned` (id UUID, category, lesson, source_conversations, applied_changes JSONB, applied_at, was_beneficial, verified_at, reverted, created_at)
  - `weekly_reports` (id UUID, week_start, week_end, conversations_analyzed, errors_found, lessons_generated, changes_applied JSONB, previous_changes_verified JSONB, model_used, tokens_used, created_at)
  - `agents` (id UUID, parent_id, level, role, model, briefing, skills JSONB, criteria, config JSONB, status, result, metrics JSONB, created_at, completed_at)
  - `agent_communications` (id UUID, from_agent_id, to_agent_id, data JSONB, created_at)
  - `agent_dependencies` (id UUID, agent_id, depends_on_agent_id, resolved, resolved_at)
  - `authorized_users` (id UUID, platform, platform_user_id, username, is_owner, approved_by, approved_at, revoked_at)
  - `pairing_requests` (id UUID, platform, platform_user_id, username, pairing_code, expires_at, status, resolved_by, created_at)
  - `recovery_state` (id UUID, component, state JSONB, iteration, created_at, updated_at)
  - Índices: idx_messages_conversation, idx_messages_embedding (ivfflat), idx_agents_parent, idx_agents_status
- [x] 1.4: Criar `src/memory/ConversationRepository.ts` — CRUD de conversations (create, findById, findByUserId, update)
- [x] 1.5: Criar `src/memory/MessageRepository.ts` — CRUD de messages (create, findByConversation, findByConversationWithLimit, countTokens)
- [x] 1.6: Integrar migrations no startup do `src/index.ts`

**Critério de conclusão:** App conecta ao PostgreSQL automaticamente. Todas as tabelas são criadas no primeiro startup. CRUD dos repositories funciona.

---

### FASE 2 — Vault (Cofre Criptografado)

**Objetivo:** Armazenamento seguro de credenciais com AES-256-GCM.
**Spec de referência:** `specs/vault.md`

**Tarefas:**
- [ ] 2.1: Criar `src/security/CryptoHandler.ts`
  - encrypt(data: string, key: Buffer): { encrypted: string, iv: string, authTag: string }
  - decrypt(encrypted: string, key: Buffer, iv: string, authTag: string): string
  - Algoritmo: AES-256-GCM
- [ ] 2.2: Criar `src/security/KeyManager.ts`
  - generateKey(): Buffer (crypto.randomBytes(32))
  - saveKey(path): void (salva com chmod 600 em Linux/Mac, ACL em Windows)
  - loadKey(path): Buffer
  - Cria `data/vault/` se não existir
- [ ] 2.3: Criar `src/security/VaultManager.ts`
  - save(name: string, value: string): void
  - read(name: string): string
  - list(): string[] (só nomes, nunca valores)
  - delete(name: string): void
  - exportKey(): string (pra fornecer ao owner)
  - Gera vault.key + vault.enc na primeira inicialização
  - Nunca loga valores de credenciais

**Critério de conclusão:** Vault cria chave automaticamente. Salvar, ler e listar credenciais funciona. Credenciais criptografadas no disco.

---

### FASE 3 — LLM Provider (OpenRouter)

**Objetivo:** Integração com OpenRouter para acessar múltiplos modelos de LLM.
**Spec de referência:** `specs/architecture.md` (seção 2.6), `specs/agent-loop.md` (RF-05)

**Tarefas:**
- [ ] 3.1: Criar `src/providers/ILlmProvider.ts` — interface:
  - chat(messages: Message[], tools?: ToolDefinition[], config?: LlmConfig): Promise<LlmResponse>
  - LlmResponse = { content: string | null, toolCalls: ToolCall[], tokensIn: number, tokensOut: number }
- [ ] 3.2: Criar `src/providers/OpenRouterProvider.ts`
  - Lê OPENROUTER_API_KEY do Vault (ou .env como fallback)
  - Endpoint: https://openrouter.ai/api/v1/chat/completions
  - Suporta tool_calls (function calling) — múltiplos por resposta
  - Headers: Authorization, HTTP-Referer, X-Title
- [ ] 3.3: Criar `src/providers/ProviderFactory.ts`
  - create(modelName: string): ILlmProvider
- [ ] 3.4: Implementar retry com backoff exponencial:
  - Erros temporários (429, 503): espera 1s → 3s → 6s → desiste
  - Erros permanentes (401, 400): falha imediata, sem retry
  - Timeout: 120s por chamada
- [ ] 3.5: Testar: enviar prompt simples → receber resposta. Enviar com tools → receber tool_calls.

**Critério de conclusão:** Chat com OpenRouter funciona. Tool calls parseados corretamente. Retry com backoff funciona.

---

### FASE 4 — Personality Engine

**Objetivo:** Carregar personalidade do Thor e injetar no system prompt.
**Spec de referência:** `specs/personality.md`, `.agents/SOUL.md`, `.agents/IDENTITY.md`, `.agents/MEMORY.md`

**Tarefas:**
- [ ] 4.1: Criar `src/core/PersonalityEngine.ts`
  - Lê `.agents/SOUL.md` → personalidade
  - Lê `.agents/IDENTITY.md` → identidade (nome, criador, etc.)
  - Lê `.agents/MEMORY.md` → lições e preferências
  - Compila tudo num bloco de system prompt
  - getSystemPromptPrefix(): string
- [ ] 4.2: Implementar fallback:
  - Se SOUL.md não existe → personalidade padrão mínima
  - Se IDENTITY.md não existe → "TurionZ by Bolla Network"
  - Se MEMORY.md não existe → sem lições (ok)
- [ ] 4.3: Implementar truncamento se total > 10k tokens

**Critério de conclusão:** getSystemPromptPrefix() retorna system prompt com personalidade do Thor. Fallback funciona.

---

### FASE 5 — Memory Manager

**Objetivo:** Janela de contexto 150k, resumo automático, busca semântica.
**Spec de referência:** `specs/memory.md`

**Tarefas:**
- [ ] 5.1: Criar `src/memory/TokenCounter.ts` — conta tokens (tiktoken ou estimativa ~4 chars/token)
- [ ] 5.2: Criar `src/memory/EmbeddingEngine.ts`
  - Wrapper do nomic-embed local
  - generateEmbedding(text: string): Promise<number[]>
  - Roda em background (async), não bloqueia
  - Se falhar → mensagem salva sem embedding (log warning)
- [ ] 5.3: Criar `src/memory/MemoryManager.ts` — Facade:
  - saveMessage(conversationId, role, content, platform): salva + gera embedding em background
  - getContextWindow(conversationId, maxTokens): retorna mensagens que cabem na janela
  - memorySearch(query, limit): busca semântica via pgvector (cosine similarity)
  - triggerSummary(conversationId): gera resumo via LLM barato, salva como is_summary=true
  - getConversationState(conversationId): estado pra recovery
- [ ] 5.4: Implementar detecção de 70% da janela → auto-trigger do resumo
- [ ] 5.5: Implementar janela autoconfigurável (CONTEXT_WINDOW_SIZE do .env, padrão 150000)
- [ ] 5.6: Instalar nomic-embed localmente (ou iniciar sem embedding se não disponível)

**Critério de conclusão:** Mensagens salvas e recuperadas. Janela respeita limite de tokens. memory_search retorna resultados semânticos. Resumo automático gera ao atingir 70%.

---

### FASE 6 — Tool Registry

**Objetivo:** Registro dinâmico de ferramentas para o LLM usar.
**Spec de referência:** `specs/agent-loop.md` (RF-01, RF-02), `specs/skill-user.md`

**Tarefas:**
- [ ] 6.1: Criar `src/tools/BaseTool.ts` — classe abstrata:
  - name: string
  - description: string
  - parameters: JSONSchema (pra function calling)
  - execute(args: Record<string, any>): Promise<ToolResult>
  - ToolResult = { success: boolean, output: string }
- [ ] 6.2: Criar `src/tools/ToolRegistry.ts`:
  - register(tool: BaseTool): void
  - unregister(name: string): void
  - get(name: string): BaseTool
  - listAll(): BaseTool[]
  - toOpenRouterFormat(): ToolDefinition[] (converte pra formato de API)
- [ ] 6.3: Criar `src/tools/ToolFactory.ts` — instancia tool por nome
- [ ] 6.4: Criar tool built-in `src/tools/builtin/MemorySearchTool.ts`:
  - Usa MemoryManager.memorySearch()
  - Parameters: { query: string, limit?: number }
- [ ] 6.5: Formato de tool call output etiquetado: `"tool_name(args) → resultado"`

**Critério de conclusão:** Registrar tool, listar, executar por nome, converter pra formato OpenRouter.

---

### FASE 7 — Agent Loop (Core ReAct)

**Objetivo:** Motor de raciocínio central com multi-tools, retry, abort, e logs.
**Spec de referência:** `specs/agent-loop.md` (SPEC PRINCIPAL — ler COMPLETO antes de implementar)

**Tarefas:**
- [ ] 7.1: Criar `src/core/AgentLoop.ts` com método `run(input: AgentLoopInput): Promise<AgentLoopOutput>`
- [ ] 7.2: Implementar ciclo ReAct principal:
  ```
  while (rodada < MAX_ITERATIONS) {
    response = await llmProvider.chat(messages, tools)
    if (response.toolCalls.length > 0) {
      // Executar tools → injetar resultados → próxima rodada
    } else {
      // Resposta final → retornar
    }
  }
  ```
- [ ] 7.3: Multi-tools estilo Claude Code:
  - Validar JSON de TODAS as tool_calls antes de executar qualquer uma
  - Se JSON inválido → devolver erro pro LLM, NÃO contar como rodada
  - Executar todas em fila (sequencial, uma após outra)
  - Se uma falha, as outras CONTINUAM
  - Cada resultado etiquetado: `"tool_name(args) → resultado"` ou `"tool_name(args) → ERRO: motivo"`
  - Limite de 5 tools por rodada — se pedir mais, executa 5 e avisa
- [ ] 7.4: Checagem de saúde antes de cada tool:
  - Rodada dentro do limite?
  - Flag de abort ativa?
  - Sistema operacional?
- [ ] 7.5: MAX_ITERATIONS: ler do .env, fallback pra 5
- [ ] 7.6: Retry com backoff pra erros do LLM (delega pro provider, Fase 3)
- [ ] 7.7: Propagação de flags: input.flags → output.flags (intacto)
- [ ] 7.8: Log estruturado a cada etapa:
  - `[Rodada X | Xs | tool: nome / final_answer | tokens: Xin / Xout]`
- [ ] 7.9: Placeholder pra abort check (será integrado na Fase 9):
  - Método checkForAbort(): Promise<boolean> — retorna false por padrão
- [ ] 7.10: Status de saída: "completed" | "max_iterations" | "aborted" | "error"
- [ ] 7.11: Metrics de saída: { totalDuration, totalTokensIn, totalTokensOut, iterationsUsed, toolsCalled[] }

**Critério de conclusão:** AgentLoop.run() funciona end-to-end. Processa mensagem, chama LLM, executa tools, retorna resposta. Multi-tools funciona. Logs aparecem no console.

---

### FASE 8 — Autenticação

**Objetivo:** Controle de acesso por whitelist + pairing flow (inspirado no OpenClaw).
**Spec de referência:** `specs/authentication.md`

**Tarefas:**
- [ ] 8.1: Criar `src/security/OwnerValidator.ts` — identifica Lucas pelo OWNER_TELEGRAM_ID
- [ ] 8.2: Criar `src/security/AllowlistManager.ts` — CRUD no PostgreSQL (authorized_users)
  - isAuthorized(platform, userId): boolean
  - addUser(platform, userId, approvedBy): void
  - removeUser(platform, userId): void
- [ ] 8.3: Criar `src/security/PairingFlowManager.ts`
  - createPairingRequest(platform, userId): string (código TZ-XXXX-XXXX)
  - approvePairing(code): void
  - denyPairing(code): void
  - Expiração: 1 hora
  - Deny: cooldown de 24h
- [ ] 8.4: Criar `src/security/AuthenticationGateway.ts` — orquestrador:
  - authenticate(platform, userId): 'authorized' | 'pairing_initiated' | 'denied_silent'
  - Não autorizado + allowlist mode → silêncio total
  - Não autorizado + pairing mode → gera código
- [ ] 8.5: Tokens de bot lidos do Vault (prefixo vault: no config)

**Critério de conclusão:** Allowlist funciona. Pairing gera código e aprova. Não autorizados recebem silêncio total.

---

### FASE 9 — Telegram Gateway (Input + Output)

**Objetivo:** Primeira plataforma funcional — bot completo no Telegram.
**Spec de referência:** `specs/telegram-input.md`, `specs/telegram-output.md`, `specs/gateway.md`

**Tarefas:**
- [ ] 9.1: Instalar `grammy` e `pdf-parse`
- [ ] 9.2: Criar `src/gateway/MessageRouter.ts`
  - Traduz InternalMessage ↔ formato de plataforma
  - Encaminha pro AgentController
  - Recebe resposta e despacha pro adaptador correto
- [ ] 9.3: Criar `src/gateway/adapters/telegram/TelegramInputAdapter.ts`
  - Escuta: message:text, message:document, message:voice, message:audio
  - Valida whitelist via AuthenticationGateway
  - Converte pra InternalMessage
  - Sinaliza typing/recording via ctx.api.sendChatAction()
  - Download de arquivos pra ./tmp/
  - Cleanup de TMP no finally
  - PDF: extrai texto via pdf-parse
  - MD: leitura direta
  - (Whisper/áudio = fase futura)
- [ ] 9.4: Criar `src/gateway/adapters/telegram/TelegramOutputAdapter.ts`
  - TextOutputStrategy: < 4096 chars → ctx.reply()
  - ChunkOutputStrategy: > 4096 chars → fatia sem cortar palavras, envia sequencial (for...of)
  - FileOutputStrategy: salva .md em TMP → ctx.replyWithDocument() → deleta TMP
  - ErrorOutputStrategy: "⚠️ [mensagem amigável]" — nunca stack traces
  - ProgressOutputStrategy: "🔄 [status]" — notificações periódicas
- [ ] 9.5: Integrar fluxo completo: Grammy → InputAdapter → MessageRouter → AgentController → AgentLoop → MessageRouter → OutputAdapter → Grammy
- [ ] 9.6: Implementar abort: escutar mensagens novas durante processamento
  - Regex: /^(para|cancela|stop|esquece|pare)$/i
  - Se match → setar flag de abort no AgentLoop
  - Integrar com AgentLoop.checkForAbort()
- [ ] 9.7: Implementar pairing flow no Telegram (mostrar código, notificar owner)

**Critério de conclusão:** Mandar mensagem no Telegram → Thor responde com personalidade. Chunking funciona. PDF é processado. Whitelist bloqueia. Abort funciona.

---

### FASE 10 — Agent Controller (Facade)

**Objetivo:** Orquestrador central — conecta tudo num pipeline limpo.
**Spec de referência:** `specs/architecture.md` (seção 2.5), `specs/PRD.md` (seção 6.2)

**Tarefas:**
- [ ] 10.1: Criar `src/core/AgentController.ts` — pipeline principal:
  ```
  async processMessage(message: InternalMessage): Promise<AgentLoopOutput> {
    1. Carregar personalidade (PersonalityEngine)
    2. Buscar/criar conversa (MemoryManager)
    3. Salvar mensagem do usuário no banco
    4. Buscar contexto (janela de mensagens)
    5. Identificar skill (SkillRouter → pode ser null)
    6. Montar system prompt (personalidade + skill)
    7. Montar tools (ToolRegistry + skill tools)
    8. Chamar AgentLoop.run()
    9. Salvar resposta no banco
    10. Retornar resultado + flags
  }
  ```
- [ ] 10.2: Implementar notificações de progresso: callback que o AgentLoop chama periodicamente
- [ ] 10.3: Integrar com Gateway: MessageRouter chama AgentController

**Critério de conclusão:** Pipeline completo funciona end-to-end. Personalidade do Thor nas respostas. Memória persiste entre mensagens.

---

### FASE 11 — Permissões

**Objetivo:** Sistema "pede uma vez, lembra pra sempre".
**Spec de referência:** `specs/permissions.md`

**Tarefas:**
- [ ] 11.1: Criar `src/security/PermissionChecker.ts`
  - check(action: string): Promise<'granted' | 'denied' | 'ask_user'>
  - Busca: específico → wildcard → não encontrado
- [ ] 11.2: Criar `src/security/PermissionManager.ts`
  - grant(action, category, grantedBy): void
  - revoke(action): void
  - listAll(): Permission[]
- [ ] 11.3: Classificar ações:
  - Livres: create_file, read_file, web_search, generate_document
  - Requerem permissão: delete_*, install_*, modify_system_*, send_external_*
- [ ] 11.4: Integrar com AgentLoop: antes de executar tool perigosa → checar permissão

**Critério de conclusão:** Tool perigosa pede permissão na primeira vez. Na segunda executa direto. Wildcard funciona.

---

### FASE 12 — Skill System

**Objetivo:** Plugin system com hot-reload e tools exclusivas.
**Spec de referência:** `specs/skill-user.md`

**Tarefas:**
- [ ] 12.1: Instalar `js-yaml` e `@types/js-yaml`
- [ ] 12.2: Criar `src/skills/SkillLoader.ts`
  - Lê todas as pastas em `.agents/skills/`
  - Extrai YAML frontmatter de SKILL.md (name, description, version, tools)
  - Retorna array de SkillMetadata
  - Hot-reload: lê do filesystem a cada mensagem (sem cache — reload instantâneo)
- [ ] 12.3: Criar `src/skills/SkillRouter.ts`
  - Recebe: mensagem do usuário + lista de SkillMetadata
  - Faz chamada leve ao LLM: "Qual skill serve? Retorne JSON { skillName: string | null }"
  - Parse JSON da resposta
  - Se null → sem skill (conversa livre)
- [ ] 12.4: Criar `src/skills/SkillExecutor.ts`
  - Lê SKILL.md completo da skill identificada
  - Carrega tools exclusivas da pasta tools/ da skill
  - Injeta instruções no systemPrompt do AgentLoop
  - Registra tools exclusivas no ToolRegistry
  - Após resposta: desregistra tools exclusivas (limpa)
- [ ] 12.5: Criar `.agents/skills/skill-creator/SKILL.md` — instruções pro sub-agent criador
- [ ] 12.6: Integrar com AgentController (Fase 10): inserir no pipeline entre Memory e AgentLoop

**Critério de conclusão:** Colocar pasta de skill → SkillRouter identifica → SkillExecutor injeta → AgentLoop usa. Hot-reload funciona sem restart.

---

### FASE 13 — Sub-Agent Manager

**Objetivo:** Criar e gerenciar sub-agents especializados com hierarquia.
**Spec de referência:** `specs/sub-agents.md`

**Tarefas:**
- [ ] 13.1: Criar `src/agents/SubAgentManager.ts`
  - createSubAgent(briefing, model, skills, criteria, dependencies[]): subAgentId
  - createSubSubAgent(parentId, briefing, role: 'worker' | 'verifier'): subSubAgentId
  - waitFor(agentId): Promise<AgentResult>
  - cancelAgent(agentId): void
  - getProgress(agentId): ProgressInfo
  - communicateResult(fromId, toId, data): void
- [ ] 13.2: Cada sub-agent instancia seu próprio AgentLoop (reutiliza a classe)
- [ ] 13.3: Implementar regras de hierarquia:
  - TurionZ (level 0) → sub-agents ilimitados (level 1) → max 3 sub-sub-agents (level 2)
  - Herança de configs: imutável, cascata
  - Verificador obrigatório: se sub-agent não criou, sistema cria automaticamente
- [ ] 13.4: Implementar comunicação central (via TurionZ):
  - Sub-agent A entrega → TurionZ → repassa pra Sub-agent B
- [ ] 13.5: Implementar dependências (waitFor):
  - Sub-agent B registra que espera Sub-agent A
  - Quando A termina, TurionZ repassa resultado e B continua
- [ ] 13.6: Salvar estado no PostgreSQL (tabelas agents, agent_communications, agent_dependencies)
- [ ] 13.7: Notificações de progresso pro usuário via Gateway
- [ ] 13.8: Criar tool built-in `create_sub_agent` pra o TurionZ chamar via AgentLoop

**Critério de conclusão:** TurionZ cria sub-agent → sub-agent executa → verificador testa → resultado entregue. Comunicação e dependências funcionam.

---

### FASE 14 — Logger (Bolla Network)

**Objetivo:** Logging estruturado em PostgreSQL e console.
**Spec de referência:** `specs/PRD.md` (seção 9), `specs/agent-loop.md` (RF-04)

**Tarefas:**
- [ ] 14.1: Criar `src/infra/Logger.ts`
  - log(agentType, agentName, action, details, durationMs?, tokensUsed?): void
  - Salva na tabela activity_logs do PostgreSQL
  - Console: formatação legível com timestamp e cores
  - REGRA: nunca logar API keys, senhas, ou valores do Vault
- [ ] 14.2: Integrar em todos os módulos existentes:
  - AgentLoop: log por rodada (thought, tool_call, observation, final_answer)
  - SubAgentManager: log de criação, conclusão, erro de agents
  - ToolRegistry: log de execução de tools
  - VaultManager: log de operações (sem valores)
  - AuthenticationGateway: log de auth (sem IDs de negados)

**Critério de conclusão:** Toda ação do sistema aparece nos logs. Console formatado. PostgreSQL guarda histórico.

---

### FASE 15 — Recovery (Auto-start)

**Objetivo:** Iniciar com o SO e retomar de onde parou.
**Spec de referência:** `specs/recovery.md`

**Tarefas:**
- [ ] 15.1: Criar `src/infra/RecoveryManager.ts`
  - Boot sequence: connect → check state → recover → notify → run
  - Salvar checkpoint a cada rodada do AgentLoop (tabela recovery_state)
- [ ] 15.2: Criar `src/infra/IntegrityChecker.ts`
  - Verificar SOUL.md, IDENTITY.md, MEMORY.md existem e são válidos
  - Verificar skills instaladas
  - Limpar TMP de arquivos órfãos
- [ ] 15.3: Implementar recovery de sub-agents:
  - Status 'running' → verificar progresso → completar ou recriar
  - Status 'waiting' → resolver dependência ou cancelar
- [ ] 15.4: Implementar safe mode: 3 crashes em 10min → modo reduzido
- [ ] 15.5: Criar scripts de auto-start:
  - Linux: systemd service file
  - Windows: Task Scheduler XML
  - Mac: launchd plist
- [ ] 15.6: Notificar usuário via Gateway: "TurionZ online! Retomando..."

**Critério de conclusão:** Kill processo → restart → volta de onde parou. Notifica o usuário. Safe mode funciona.

---

### FASE 16 — Self-Improvement (Auto-análise Semanal)

**Objetivo:** Aprender com erros e acertos automaticamente.
**Spec de referência:** `specs/self-improvement.md`

**Tarefas:**
- [ ] 16.1: Criar `src/infra/SelfImprovement.ts` — orquestrador
  - Roda todo domingo (scheduler via setInterval ou cron)
  - Coleta → Fragmentação → Análise → Verificação → Aplicação
- [ ] 16.2: Criar `src/infra/ConversationFragmenter.ts`
  - Se volume > 50k tokens → quebra em partes de ~20k
- [ ] 16.3: Criar `src/infra/LessonExtractor.ts`
  - Analisa cada fragmento via LLM barato (OpenRouter)
  - Gera lições categorizadas: technical, preference, pattern, tool, communication
- [ ] 16.4: Criar `src/infra/ChangeVerifier.ts`
  - Pega mudanças da semana anterior
  - Compara métricas: menos erros? menos correções?
  - Se piorou → reverte
- [ ] 16.5: Salvar lições na tabela lessons_learned
- [ ] 16.6: Salvar relatório semanal na tabela weekly_reports
- [ ] 16.7: Atualizar .agents/MEMORY.md com lições principais
- [ ] 16.8: Sugerir ajustes sutis ao SOUL.md (com log completo)

**Critério de conclusão:** Análise roda automaticamente. Gera lições. Verifica mudanças anteriores. Atualiza MEMORY.md.

---

### FASE 17 — Gateways Adicionais

**Objetivo:** Expandir para Discord, WhatsApp e API REST.
**Spec de referência:** `specs/gateway.md`

**Tarefas:**
- [ ] 17.1: Instalar `discord.js`, `@whiskeysockets/baileys`, `express`, `@types/express`
- [ ] 17.2: Criar `src/gateway/adapters/discord/DiscordAdapter.ts`
  - Conecta via discord.js
  - Traduz mensagens pra InternalMessage
  - Valida auth independente
  - Envia respostas (texto, chunks, arquivos)
- [ ] 17.3: Criar `src/gateway/adapters/whatsapp/WhatsAppAdapter.ts`
  - Conecta via Baileys (ou whatsapp-web.js)
  - Traduz mensagens pra InternalMessage
  - Valida auth independente
- [ ] 17.4: Criar `src/gateway/adapters/api/APIRestAdapter.ts`
  - Express/Fastify HTTP server
  - Autenticação via API key (do Vault)
  - Endpoints: POST /message, GET /conversations, GET /status
- [ ] 17.5: Cada adaptador roda como serviço independente (se um cair, outros continuam)
- [ ] 17.6: Integrar todos com MessageRouter e AuthenticationGateway

**Critério de conclusão:** Enviar mensagem em Discord/WhatsApp/API → TurionZ processa → responde na mesma plataforma.

---

## Diagrama de Dependências

```
FASE 0 (Setup)
  └── FASE 1 (PostgreSQL)
        ├── FASE 2 (Vault)
        │     └── FASE 3 (LLM Provider)
        │           ├── FASE 4 (Personality)
        │           ├── FASE 5 (Memory)
        │           │     └── FASE 6 (Tools)
        │           │           └── FASE 7 (Agent Loop) ← CORAÇÃO
        │           │                 ├── FASE 8 (Auth)
        │           │                 │     └── FASE 9 (Telegram) ← PRIMEIRA ENTREGA FUNCIONAL
        │           │                 │           └── FASE 10 (Controller)
        │           │                 │                 ├── FASE 11 (Permissões)
        │           │                 │                 ├── FASE 12 (Skills)
        │           │                 │                 └── FASE 13 (Sub-agents)
        │           │                 ├── FASE 14 (Logger)
        │           │                 ├── FASE 15 (Recovery)
        │           │                 └── FASE 16 (Self-improvement)
        │           │
        │           └── FASE 17 (Gateways adicionais)
```

**Marco importante:** Após FASE 10, o TurionZ é funcional no Telegram com personalidade, memória e ferramentas. As fases 11-17 adicionam funcionalidades avançadas.

---

## Notas para Implementação

1. **Leia a spec de referência** de cada fase antes de implementar.
2. **TypeScript strict mode** — sem any, com interfaces tipadas.
3. **OOP** — use Classes, Interfaces, e Design Patterns conforme specs/architecture.md.
4. **Nunca logar credenciais** — regra absoluta em todo o código.
5. **Cleanup de TMP** — sempre no finally de try/catch.
6. **Testes** — cada fase deve ter pelo menos um teste manual que confirme o critério de conclusão.
7. **Compatibilidade** — Linux, Windows e Mac. Cuidado com paths (use path.join).

---

*Created by BollaNetwork — TurionZ v0.1*
