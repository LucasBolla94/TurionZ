# Spec: PRD — TurionZ Core

**Versão:** 2.0
**Status:** Aprovada
**Created by:** BollaNetwork
**Data:** 2026-03-24

---

## 1. Resumo

O **TurionZ** é um agente pessoal de Inteligência Artificial criado pela **Bolla Network**, projetado para operar localmente na máquina do usuário (Linux, Windows ou Mac). Ele recebe comandos por múltiplas plataformas (Telegram, WhatsApp, Discord e API REST) através de um Gateway 24/7, processa-os através de um pipeline inteligente com suporte a múltiplos LLMs via OpenRouter, e possui memória persistente em PostgreSQL com busca semântica via embedding local.

O TurionZ possui **personalidade própria** (sistema SOUL.md), pode criar **sub-agents especializados ilimitados**, aprende com seus erros semanalmente, e se recupera automaticamente de falhas.

---

## 2. Contexto e Motivação

**Problema:**
Agentes hospedados na nuvem requerem expor dados privados, têm custos altos e não oferecem governança total sobre skills customizadas. O usuário não tem controle pleno sem esbarrar na complexidade de infraestrutura cloud.

**Evidências:**
Tentativas anteriores funcionavam, mas a intenção agora é manter uma base modular, extensível e sob controle total do usuário, operando localmente com capacidade de conexão a APIs externas de LLM.

**Por que agora:**
A ascensão de LLMs eficientes (Claude, GPT, modelos via OpenRouter) somada à facilidade de APIs de mensageria permite rodar um agente pessoal poderoso sem atritos operacionais de UI web.

---

## 3. Goals (Objetivos)

- [ ] G-01: Receber e responder requisições por **múltiplas plataformas** (Telegram, WhatsApp, Discord, API REST) via Gateway 24/7.
- [ ] G-02: Intercambiar LLMs dinamicamente usando **OpenRouter** com catálogo mensal de modelos disponíveis.
- [ ] G-03: Reter contexto por múltiplos turnos com **PostgreSQL** + busca semântica via **nomic-embed** local.
- [ ] G-04: Respeitar limites de autorização via whitelist por plataforma.
- [ ] G-05: Possuir **personalidade própria** definida por SOUL.md + IDENTITY.md + MEMORY.md.
- [ ] G-06: Criar e gerenciar **sub-agents especializados** com verificação obrigatória.
- [ ] G-07: **Aprender com erros** através de auto-análise semanal.
- [ ] G-08: **Recuperar-se automaticamente** de falhas e reiniciar com o sistema operacional.
- [ ] G-09: Ser **autoconfigurável** — entender como se configurar para novas features.

**Métricas de sucesso:**

| Métrica | Baseline atual | Target | Prazo |
|---------|---------------|--------|-------|
| Uptime do Gateway | 0% | 99% | 30 dias |
| Troca dinâmica de Skills via hot-reload | Sem suporte | < 1 segundo | 10 dias |
| Recuperação após falha | Manual | Automática em < 60s | MVP |
| Plataformas suportadas | 0 | 4 (Telegram, WhatsApp, Discord, API) | MVP |

---

## 4. Non-Goals (Fora do Escopo)

- NG-01: Não será SaaS multi-tenant. É agente pessoal com whitelist restrita.
- NG-02: Não terá interface web própria nesta fase. A interface são as plataformas de chat + API.
- NG-03: Não haverá controle de budget/custo por enquanto.

---

## 5. Usuários e Personas

**Usuário primário:** Operador da Bolla Network, acessando via Telegram, WhatsApp, Discord ou API REST.

**Jornada atual (sem o TurionZ):**
O usuário gere manualmente APIs ou loga em múltiplas plataformas para acionar tarefas em blocos de texto independentes sem integrações.

**Jornada futura (com o TurionZ):**
O usuário envia uma mensagem por qualquer plataforma, o TurionZ processa localmente, cria sub-agents se necessário, aciona ferramentas e skills, e responde na mesma plataforma de forma orgânica e com personalidade.

---

## 6. Requisitos Funcionais

### 6.1 Requisitos Principais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | O Gateway deve rodar 24/7 recebendo mensagens de todas as plataformas configuradas. | Must | Mensagens de qualquer adaptador chegam ao TurionZ em < 2s. |
| RF-02 | O sistema deve validar todas as mensagens contra whitelist por plataforma. | Must | Usuário não cadastrado é ignorado. |
| RF-03 | O sistema deve alternar LLMs via OpenRouter com catálogo mensal de modelos. | Must | TurionZ escolhe o modelo ideal por tarefa com base nas specs salvas no banco. |
| RF-04 | O sistema deve possuir personalidade persistente via SOUL.md. | Must | Respostas refletem a personalidade definida consistentemente. |
| RF-05 | O sistema deve iniciar automaticamente com o SO e recuperar estado anterior. | Must | Após reboot, volta de onde parou sem intervenção humana. |

### 6.2 Fluxo Principal (Happy Path)

1. O usuário manda "Cria um projeto React" no Telegram.
2. Gateway Telegram recebe, traduz pra formato interno, encaminha pro TurionZ.
3. TurionZ valida whitelist (OK).
4. TurionZ consulta SOUL.md pra manter personalidade.
5. TurionZ consulta memória (PostgreSQL + embedding) pra contexto.
6. SkillRouter identifica skill necessária (ou nenhuma).
7. AgentLoop processa com ReAct (pode criar sub-agents).
8. Sub-agents trabalham, verificam, e devolvem resultados.
9. TurionZ monta resposta final e envia pelo Gateway Telegram.
10. Tudo logado na DB da Bolla Network.

### 6.3 Fluxos Alternativos

**Falha de API de LLM:**
AgentLoop tenta retry com backoff (1s → 3s → 6s). Se persistir, retorna mensagem amigável ao usuário pela mesma plataforma.

**Gateway de uma plataforma cai:**
Apenas aquela plataforma fica indisponível. As outras continuam funcionando normalmente (serviços independentes).

---

## 7. Requisitos Não-Funcionais

| ID | Requisito | Valor alvo | Observação |
|----|-----------|-----------|------------|
| RNF-01 | Latência de repasse de mensagem | < 1000ms | Do gateway até o início do processamento. |
| RNF-02 | Persistência | PostgreSQL | Com WAL ativo pra concorrência. |
| RNF-03 | Embedding local | nomic-embed | Roda independente sem afetar performance do TurionZ. |
| RNF-04 | Compatibilidade | Linux / Windows / Mac | Funciona nos 3 sistemas. |

---

## 8. Design e Interface

**Componentes:**
- Gateway 24/7 com adaptadores por plataforma
- Terminal com logs estruturados para desenvolvimento
- Chats nas plataformas configuradas (Telegram, WhatsApp, Discord)
- API REST para integrações externas

**Estados de UI (nas plataformas de chat):**
- Processando: sinaliza "digitando..." até a resposta ser enviada.
- Progresso: envia atualizações periódicas em tarefas longas.

---

## 9. Modelo de Dados

**PostgreSQL — Tabelas principais:**

```sql
-- Conversas
conversations {
  id: uuid
  user_id: string
  platform: string        -- 'telegram' | 'whatsapp' | 'discord' | 'api'
  provider: string        -- modelo LLM ativo
  created_at: timestamp
}

-- Mensagens
messages {
  id: uuid
  conversation_id: uuid
  role: string            -- 'user' | 'assistant' | 'system' | 'tool'
  content: text
  embedding: vector       -- nomic-embed representation
  created_at: timestamp
}

-- Modelos OpenRouter (atualizado mensalmente)
openrouter_models {
  id: string              -- model id no OpenRouter
  name: string
  provider: string
  context_length: integer
  pricing_input: decimal
  pricing_output: decimal
  capabilities: jsonb     -- coding, analysis, creative, etc.
  recommendations: text
  synced_at: timestamp
}

-- Permissões (pede uma vez, lembra pra sempre)
permissions {
  id: uuid
  action: string          -- 'install_node', 'delete_files', etc.
  granted: boolean
  granted_at: timestamp
}

-- Logs da Bolla Network
activity_logs {
  id: uuid
  agent_type: string      -- 'turionz' | 'sub-agent' | 'sub-sub-agent'
  agent_name: string
  action: string
  details: jsonb
  duration_ms: integer
  tokens_used: integer
  created_at: timestamp
}

-- Lições aprendidas (auto-análise semanal)
lessons_learned {
  id: uuid
  category: string
  lesson: text
  applied_at: timestamp
  was_beneficial: boolean  -- verificado na semana seguinte
  verified_at: timestamp
}
```

---

## 10. Integrações e Dependências

| Dependência | Tipo | Impacto se indisponível |
|-------------|------|------------------------|
| Gateway (adaptadores) | Obrigatória | Plataforma afetada fica offline; outras continuam. |
| OpenRouter API | Obrigatória | Sem raciocínio. Retry com backoff. |
| PostgreSQL | Obrigatória | Sem memória persistente. Sistema em modo degradado. |
| nomic-embed (local) | Secundária | Busca semântica indisponível. Busca exata como fallback. |
| Whisper local (STT) | Secundária | Transcrição de áudio indisponível. Avisa o usuário. |
| Edge-TTS | Secundária | Resposta em áudio indisponível. Fallback pra texto. |

---

## 11. Edge Cases e Tratamento de Erros

| Cenário | Trigger | Comportamento esperado |
|---------|---------|----------------------|
| EC-01: Usuário não autorizado | Request de ID fora da whitelist | Ignora silenciosamente. Sem log sensível. |
| EC-02: Banco inacessível | PostgreSQL offline | Modo degradado: funciona sem memória, avisa o usuário. |
| EC-03: Chave API inválida | .env corrompido | Log de erro fatal no terminal. Notifica no chat que o provider falhou. |
| EC-04: Sistema cai no meio de tarefa | Queda de energia/crash | Auto-start recupera estado do PostgreSQL. Verifica arquivos quebrados. |
| EC-05: Gateway de plataforma cai | Erro no adaptador do Discord | Apenas Discord para. Outras plataformas continuam. |

---

## 12. Segurança e Privacidade

- **Autenticação:** Whitelist por user ID por plataforma.
- **Permissões:** Sistema "pede uma vez, lembra pra sempre". Sempre comunica ações, nunca age em silêncio.
- **Dados:** PostgreSQL local. Embeddings locais. Nenhum dado sensível sai da máquina sem permissão.
- **Logs:** Registrados na DB da Bolla Network. Nunca contêm API keys ou secrets.

---

## 13. Plano de Rollout

1. **Fase 1 — Core:** Agent Loop + Memória PostgreSQL + Telegram Gateway.
2. **Fase 2 — Skills:** Sistema de skills com hot-reload e criador automático.
3. **Fase 3 — Sub-agents:** Sistema completo de sub-agents com verificação.
4. **Fase 4 — Multi-plataforma:** WhatsApp + Discord + API REST.
5. **Fase 5 — Inteligência:** Auto-análise semanal + personalidade evolutiva.

---

## 14. Open Questions

| Questão | Status |
|---------|--------|
| Definir personalidade detalhada do TurionZ (SOUL.md) | Pendente |
| Definir whitelist por plataforma (formato e gestão) | Pendente |
