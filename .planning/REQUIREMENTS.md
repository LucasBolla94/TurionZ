# TurionZ — Requirements

**Created by:** BollaNetwork
**Version:** 0.1
**Date:** 2026-03-24

## v1 — Must Have (MVP)

### Core Engine
- **REQ-001:** Agent Loop ReAct (Thought → Action → Observation → Answer) com limite de rodadas configurável
- **REQ-002:** Multi tool calls por rodada — executa todas, devolve resultados etiquetados, confia no LLM
- **REQ-003:** Retry com backoff em falhas temporárias de API (1s → 3s → 6s, max 3 tentativas)
- **REQ-004:** Validação de JSON antes de executar tools (não gasta rodada se malformado)
- **REQ-005:** Limite de 5 tools por rodada, resto vai pra fila de espera
- **REQ-006:** Checagem de saúde antes de cada tool (sistema anti-pânico)
- **REQ-007:** Abort por mensagem do usuário entre rodadas (detecção de "para", "cancela", "stop")
- **REQ-008:** Propagação de flags (requires_audio_reply, source_type) do input ao output

### LLM Providers
- **REQ-009:** TurionZ principal usa Claude Opus 4.6 via Anthropic API direta
- **REQ-010:** Sub-agents usam modelos via OpenRouter (TurionZ escolhe o ideal)
- **REQ-011:** Sync mensal do catálogo OpenRouter → PostgreSQL com specs e recomendações

### Memory & Context
- **REQ-012:** PostgreSQL como banco principal com pgvector para embeddings
- **REQ-013:** Janela de contexto de 150k tokens, autoconfigurável
- **REQ-014:** Resumo automático quando janela atinge 70% da capacidade
- **REQ-015:** memory_search — busca semântica em conversas antigas via embedding
- **REQ-016:** nomic-embed local para geração de embeddings (roda independente em CPU)
- **REQ-017:** Prompt caching para APIs que suportam (Claude, GPT)
- **REQ-018:** DB Strategy Caminho C — 3 tabelas essenciais no startup, resto por demanda

### Security
- **REQ-019:** Vault criptografado AES-256-GCM — Thor cria e gerencia a chave mestra
- **REQ-020:** Autenticação por whitelist + pairing flow por plataforma
- **REQ-021:** Sistema de permissões "pede uma vez, lembra pra sempre"
- **REQ-022:** Thor sempre comunica ações, nunca age em silêncio

### Personality
- **REQ-023:** Sistema SOUL.md + IDENTITY.md + MEMORY.md (3 camadas)
- **REQ-024:** PersonalityEngine injeta personalidade no system prompt a cada mensagem
- **REQ-025:** Thor = profissional, amigável, humor ácido, direto, pé no chão

### Gateway
- **REQ-026:** Telegram como plataforma padrão (grammy, long polling)
- **REQ-027:** Gateway 24/7 com adaptadores independentes por plataforma
- **REQ-028:** Formato interno padronizado (InternalMessage) para todas as plataformas
- **REQ-029:** Notificações de progresso em tarefas longas

### Sub-Agents
- **REQ-030:** TurionZ cria sub-agents ilimitados com briefing completo
- **REQ-031:** Cada sub-agent pode criar até 3 sub-sub-agents (herdam configs do pai)
- **REQ-032:** Verificador obrigatório — cada sub-agent spawna pelo menos 1 verificador
- **REQ-033:** Comunicação centralizada — tudo passa pelo TurionZ
- **REQ-034:** Sub-agents esperam dependências antes de iniciar

### Skills
- **REQ-035:** Pipeline Loader → Router → Executor para skills
- **REQ-036:** Hot-reload — nova skill reconhecida sem reiniciar
- **REQ-037:** Skills podem ter tools próprias (TypeScript, Python, qualquer linguagem)
- **REQ-038:** SkillCreator como sub-agent fixo (cria, testa, instala skills automaticamente)
- **REQ-039:** Sub-agents podem usar skills designadas pelo TurionZ

### Tools
- **REQ-040:** ToolRegistry com registro dinâmico de ferramentas
- **REQ-041:** Tools built-in: criar/ler/deletar arquivo, executar comando, buscar web, memory_search

### Infrastructure
- **REQ-042:** Auto-start com o sistema operacional (Linux/Windows/Mac)
- **REQ-043:** Recovery — retoma de onde parou após falha, verifica arquivos corrompidos
- **REQ-044:** Logs estruturados na DB da Bolla Network (toda ação logada)

### Self-Improvement
- **REQ-045:** Auto-análise semanal automática (domingo)
- **REQ-046:** Quebra conversas em partes se muito grandes (>50k tokens)
- **REQ-047:** Verifica se mudanças da semana anterior foram benéficas (mantém ou reverte)
- **REQ-048:** Usa modelo barato via OpenRouter para análise

## v2 — Should Have (Post-MVP)

- **REQ-049:** API REST adapter para integrações externas
- **REQ-050:** Discord adapter (discord.js)
- **REQ-051:** WhatsApp adapter (whatsapp-web.js / Baileys)
- **REQ-052:** STT local via Whisper (PT-BR, CPU)
- **REQ-053:** TTS via Edge-TTS (pt-BR-ThalitaMultilingualNeural)
- **REQ-054:** Dashboard de permissões via chat
- **REQ-055:** Marketplace de skills (compartilhar entre instâncias)
- **REQ-056:** Personalidade evolutiva via auto-análise (ajustes no SOUL.md)

## Out of Scope

- SaaS multi-tenant (é agente pessoal)
- Interface web própria (interface são as plataformas de chat)
- Controle de budget/custo (não ativado por enquanto)
- Chamadas de vídeo ou tela compartilhada
- ORMs pesados (SQL nativo ou query builder leve)
- Banco de dados vetorial separado (pgvector é suficiente)
- Embedding via API externa (sempre local via nomic-embed)
