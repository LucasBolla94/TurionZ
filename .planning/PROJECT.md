# TurionZ (Thor) — Agente AI Pessoal

**Created by:** BollaNetwork
**Owner:** Lucas
**Version:** 0.1
**Date:** 2026-03-24

## Vision

O TurionZ é um agente pessoal de Inteligência Artificial criado pela Bolla Network, projetado para operar localmente na máquina do usuário (Linux, Windows, Mac). Ele recebe comandos por múltiplas plataformas (Telegram, WhatsApp, Discord, API REST) através de um Gateway 24/7, processa-os com múltiplos LLMs, e possui memória persistente com busca semântica.

O TurionZ possui personalidade própria (Thor), pode criar sub-agents especializados ilimitados, aprende com seus erros semanalmente, e se recupera automaticamente de falhas.

## Core Identity

- **Nome do modelo:** TurionZ
- **Nome pessoal:** Thor
- **Personalidade:** Profissional, amigável, humor ácido, direto ao ponto
- **Criador:** Bolla Network
- **Dono:** Lucas (operador e chefe)
- **Thor fala como:** Diretor de operações reportando ao chefe

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Node.js (TypeScript) | Ecossistema rico, IO assíncrono, multi-plataforma |
| Database | PostgreSQL + pgvector | Robusto, suporta embeddings vetoriais |
| Embedding | nomic-embed (local, CPU) | Sem custo, privacidade total, roda independente |
| Main LLM (TurionZ) | Claude Opus 4.6 via Anthropic API | Melhor modelo para agente principal |
| Sub-agent LLMs | Via OpenRouter API | Flexibilidade de modelos, custo otimizado |
| Model Catalog | Sync mensal OpenRouter → PostgreSQL | Thor escolhe modelo ideal por tarefa |
| Telegram | grammy | Framework moderno, mantido ativamente |
| WhatsApp | whatsapp-web.js ou Baileys | Conexão direta sem API paga |
| Discord | discord.js | Biblioteca oficial |
| Encryption | AES-256-GCM | Padrão militar para o Vault |
| STT | Whisper local (CPU) | Transcrição PT-BR sem GPU |
| TTS | Edge-TTS | Voz natural pt-BR grátis |
| Reasoning | ReAct Pattern | Thought → Action → Observation loop |

## Architecture Overview

- **Monolito Modular** com serviços de Gateway independentes
- **Plugin-based Skills** com hot-reload (sem reiniciar)
- **Sub-agent hierarchy:** TurionZ → Sub-agents (ilimitados) → Sub-sub-agents (max 3 cada)
- **Verificador obrigatório** em cada sub-agent
- **Comunicação centralizada:** tudo passa pelo TurionZ
- **Auto-start** com SO + recovery de estado
- **Auto-análise semanal** com verificação de mudanças

## Database Strategy: Hybrid (Caminho C)

Tabelas divididas em 3 categorias:

### Essenciais (criadas no startup)
- `conversations` — Sem isso Thor não sabe com quem fala
- `messages` — Sem isso Thor não tem memória
- `authorized_users` — Sem isso qualquer pessoa usa o Thor

### Por demanda (criadas quando o módulo é usado pela primeira vez)
- `agents`, `agent_communications`, `agent_dependencies` — Primeiro sub-agent
- `permissions` — Primeira permissão pedida
- `lessons_learned`, `weekly_reports` — Primeira auto-análise
- `pairing_requests` — Primeiro usuário novo
- `openrouter_models` — Primeira sync mensal
- `conversation_summaries` — Primeira vez que janela enche
- `activity_logs` — Primeiro log
- `recovery_state` — Primeiro checkpoint

### Evolutivo
- Thor pode criar tabelas novas no futuro conforme features exigem

## Platforms

| Platform | Priority | Library | Status |
|----------|----------|---------|--------|
| Telegram | P0 (padrão) | grammy | Planned |
| API REST | P1 | Express/Fastify | Planned |
| Discord | P2 | discord.js | Planned |
| WhatsApp | P3 | whatsapp-web.js / Baileys | Planned |

## Security Model

- **Authentication:** Whitelist por user ID por plataforma + pairing flow
- **Permissions:** "Pede uma vez, lembra pra sempre" — sempre comunica
- **Vault:** AES-256-GCM para credenciais — Thor cria e gerencia a chave
- **Sub-agents:** Herdam permissões do TurionZ, nunca veem credenciais

## Specs Reference

All detailed specifications are in `/specs/`:
- PRD.md, architecture.md, agent-loop.md, memory.md
- sub-agents.md, skill-user.md, gateway.md, personality.md
- authentication.md, vault.md, permissions.md
- recovery.md, self-improvement.md
- telegram-input.md, telegram-output.md
